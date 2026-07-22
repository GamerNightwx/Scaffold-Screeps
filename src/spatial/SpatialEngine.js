/**
 * @typedef {Object} PathCacheEntry
 * @property {RoomPosition[]} path - caminho calculado
 * @property {number} cost - custo total do caminho
 * @property {number} computedTick - tick em que foi calculado
 * @property {number} ttl - ticks de validade
 */

/**
 * @typedef {Object} DistanceMatrixEntry
 * @property {Array<Array<number>>} matrix - matriz 50x50 de distâncias
 * @property {number} computedTick - tick em que foi calculado
 * @property {RoomPosition} origin - posição de origem usada
 */

/**
 * @typedef {Object} TopologyRegion
 * @property {string} type - 'chokepoint' | 'open_area' | 'structure_cluster' | 'mineral_cluster'
 * @property {RoomPosition[]} positions - posições que formam a região
 * @property {number} priority - 0-100, prioridade estratégica
 */

/**
 * Spatial Engine - Conhecimento espacial centralizado
 *
 * Responsabilidades:
 * - Cache de pathfinding (não chamar RoomPosition.findPathTo() diretamente)
 * - Matriz de distâncias (O(1) lookups após cálculo)
 * - Análise de topologia (regiões estratégicas)
 *
 * Nenhum outro módulo usa PathFinder diretamente.
 *
 * @class SpatialEngine
 */
export default class SpatialEngine {
  /**
   * @param {Kernel} kernel - para logging e métricas
   */
  constructor(kernel) {
    this.kernel = kernel;

    // Cache de caminhos: Map<hash, PathCacheEntry>
    this.pathCache = new Map();

    // Cache de matrizes de distância: Map<roomName, DistanceMatrixEntry>
    this.distanceMatrixCache = new Map();

    // Cache de topologia: Map<roomName, TopologyRegion[]>
    this.topologyCache = new Map();

    // Traffic tracking: Map<roomName, number> (exponential-decay counter)
    this.traffic = new Map();

    // Contadores para metrics
    this.metrics = {
      pathCacheHits: 0,
      pathCacheMisses: 0,
      distanceMatrixComputes: 0,
      topologyAnalyzes: 0,
    };

    // decay factor applied each tick to traffic counters (0 < decay < 1)
    // configurable via kernel.config.trafficDecay or src/config/Settings
    try {
      // Lazy import Settings to avoid circular issues in tests
      const Settings = require('../config/Settings.js').default;
      const cfg = (kernel && kernel.config) ? kernel.config : {};
      this._trafficDecay = (typeof cfg.trafficDecay === 'number') ? cfg.trafficDecay : (Settings && Settings.trafficDecay ? Settings.trafficDecay : 0.85);
    } catch (e) {
      // Fallback if require/import fails in some test envs
      this._trafficDecay = (kernel && kernel.config && typeof kernel.config.trafficDecay === 'number') ? kernel.config.trafficDecay : 0.85;
    }
  }

  /**
   * Computa caminho entre dois pontos com cache
   *
   * @param {RoomPosition} start
   * @param {RoomPosition} end
   * @param {Object} opts - { ignoreCreeps, range, maxPath, ttl }
   * @returns {PathCacheEntry}
   */
  computePath(start, end, opts = {}) {
    const { ignoreCreeps = false, range = 1, ttl = 100 } = opts;

    // Gera hash para o cache
    const hash = this._pathCacheHash(start, end, ignoreCreeps, range);

    const now = Game.time;

    // Verifica cache
    if (this.pathCache.has(hash)) {
      const entry = this.pathCache.get(hash);
      if (now - entry.computedTick < entry.ttl) {
        this.metrics.pathCacheHits++;
        return entry;
      } else {
        // Expirou
        this.pathCache.delete(hash);
      }
    }

    this.metrics.pathCacheMisses++;

    // Calcula novo caminho
    const path = start.findPathTo(end, {
      ignoreCreeps,
      range,
      maxOps: 2000,
    });

    const entry = {
      path,
      cost: path.length,
      computedTick: now,
      ttl,
    };

    this.pathCache.set(hash, entry);
    return entry;
  }

  /**
   * Retorna matriz de distâncias para uma sala
   * Cálculo: flood-fill desde a origem, preenchendo matriz 50x50
   *
   * @param {string} roomName
   * @param {RoomPosition} origin
   * @returns {Array<Array<number>>}
   */
  distanceMatrix(roomName, origin) {
    const cacheKey = `${roomName}:${origin.x}:${origin.y}`;
    const now = Game.time;

    // Verifica cache (válido por 10 ticks)
    if (this.distanceMatrixCache.has(cacheKey)) {
      const entry = this.distanceMatrixCache.get(cacheKey);
      if (now - entry.computedTick < 10) {
        return entry.matrix;
      }
    }

    this.metrics.distanceMatrixComputes++;

    // Computa nova matriz usando flood-fill
    const matrix = this._floodFillDistances(roomName, origin);

    const entry = {
      matrix,
      computedTick: now,
      origin,
    };

    this.distanceMatrixCache.set(cacheKey, entry);
    return matrix;
  }

  /**
   * Identifica regiões estratégicas em uma sala
   * Inclui: choke points, open areas, aglomerados de estruturas
   *
   * @param {string} roomName
   * @returns {TopologyRegion[]}
   */
  analyzeTopology(roomName) {
    const now = Game.time;

    // Verifica cache (válido por 100 ticks)
    if (this.topologyCache.has(roomName)) {
      const cached = this.topologyCache.get(roomName);
      if (now - cached.computedTick < 100) {
        return cached.regions;
      }
    }

    this.metrics.topologyAnalyzes++;

    const regions = [];
    const terrain = new Room.Terrain(roomName);

    // Análise 1: Identificar chokepoints (posições com poucos vizinhos walkable)
    const chokepoints = this._findChokepoints(terrain);
    if (chokepoints.length > 0) {
      regions.push({
        type: 'chokepoint',
        positions: chokepoints,
        priority: 85,
      });
    }

    // Análise 2: Identificar áreas abertas (clusters de posições walkable)
    const openAreas = this._findOpenAreas(terrain);
    if (openAreas.length > 0) {
      regions.push({
        type: 'open_area',
        positions: openAreas,
        priority: 40,
      });
    }

    // Análise 3: Aglomerados de estruturas (para staging areas)
    const room = Game.rooms[roomName];
    if (room) {
      const structureClusters = this._findStructureClusters(room);
      regions.push(...structureClusters);
    }

    const cached = {
      regions,
      computedTick: now,
      roomName,
    };

    this.topologyCache.set(roomName, cached);
    return regions;
  }

  /**
   * Executado a cada tick do Kernel
   * Realiza limpeza de caches e estatísticas
   */
  tick() {
    this.cleanup();
    // decay traffic counters each tick
    for (const [roomName, val] of this.traffic.entries()) {
      const decayed = val * this._trafficDecay;
      if (decayed < 0.01) this.traffic.delete(roomName);
      else this.traffic.set(roomName, decayed);
    }
  }

  /**
   * Limpa caches antigos (chamado periodicamente do Kernel)
   */
  cleanup() {
    const now = Game.time;

    // Limpa pathCache
    for (const [hash, entry] of this.pathCache.entries()) {
      if (now - entry.computedTick >= entry.ttl) {
        this.pathCache.delete(hash);
      }
    }

    // Limpa distanceMatrixCache
    for (const [key, entry] of this.distanceMatrixCache.entries()) {
      if (now - entry.computedTick >= 10) {
        this.distanceMatrixCache.delete(key);
      }
    }
  }

  /**
   * Retorna métricas para monitoramento
   * @returns {Object}
   */
  getMetrics() {
    const totalPathQueries = this.metrics.pathCacheHits + this.metrics.pathCacheMisses;
    const hitRate = totalPathQueries > 0
      ? (this.metrics.pathCacheHits / totalPathQueries * 100).toFixed(1)
      : 'N/A';

    return {
      pathCache: {
        size: this.pathCache.size,
        hits: this.metrics.pathCacheHits,
        misses: this.metrics.pathCacheMisses,
        hitRate: `${hitRate}%`,
      },
      distanceMatrixCache: {
        size: this.distanceMatrixCache.size,
        computes: this.metrics.distanceMatrixComputes,
      },
      topologyCache: {
        size: this.topologyCache.size,
        analyzes: this.metrics.topologyAnalyzes,
      },
    };
  }

  /**
   * Get approximate traffic metric for a room (used by Scheduler)
   * @param {string} roomName
   * @returns {number}
   */
  getTraffic(roomName) {
    const v = this.traffic.get(roomName) || 0;
    return v;
  }

  /**
   * Record traffic occurrence in a room (called by AgentRuntime/CommandEngine)
   * @param {string} roomName
   * @param {number} weight
   */
  recordTraffic(roomName, weight = 1) {
    if (!roomName) return;
    const prev = this.traffic.get(roomName) || 0;
    this.traffic.set(roomName, prev + weight);
  }


  // ===== PRIVATE METHODS =====

  /**
   * Gera hash para cache de caminho
   * @private
   */
  _pathCacheHash(start, end, ignoreCreeps, range) {
    return `${start.roomName}:${start.x}:${start.y}→${end.x}:${end.y}:${ignoreCreeps}:${range}`;
  }

  /**
   * Preenche matriz 50x50 com distâncias de Manhattan desde origem
   * @private
   */
  _floodFillDistances(roomName, origin) {
    const matrix = Array.from({ length: 50 }, () => Array(50).fill(-1));

    // BFS flood-fill
    const queue = [origin];
    matrix[origin.y][origin.x] = 0;

    while (queue.length > 0) {
      const current = queue.shift();
      const currentDist = matrix[current.y][current.x];

      // Expande para vizinhos
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;

          const nx = current.x + dx;
          const ny = current.y + dy;

          // Bounds check
          if (nx < 0 || nx >= 50 || ny < 0 || ny >= 50) continue;

          // Já visitado
          if (matrix[ny][nx] !== -1) continue;

          // Walkable check
          const terrain = new Room.Terrain(roomName);
          if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;

          const newDist = currentDist + 1;
          matrix[ny][nx] = newDist;
          queue.push(new RoomPosition(nx, ny, roomName));
        }
      }
    }

    return matrix;
  }

  /**
   * Identifica chokepoints em uma sala
   * Chokepoint = posição walkable com <= 2 vizinhos walkable
   * @private
   */
  _findChokepoints(terrain) {
    const chokepoints = [];

    for (let x = 1; x < 49; x++) {
      for (let y = 1; y < 49; y++) {
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;

        // Conta vizinhos walkable
        let walkableNeighbors = 0;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            if (terrain.get(x + dx, y + dy) !== TERRAIN_MASK_WALL) {
              walkableNeighbors++;
            }
          }
        }

        // Chokepoint: poucos vizinhos
        if (walkableNeighbors <= 4) {
          chokepoints.push(new RoomPosition(x, y, terrain.roomName));
        }
      }
    }

    return chokepoints;
  }

  /**
   * Identifica áreas abertas (clusters de posições walkable)
   * @private
   */
  _findOpenAreas(terrain) {
    // Implementação simplificada: retorna posições com muitos vizinhos walkable
    const openAreas = [];

    for (let x = 5; x < 45; x++) {
      for (let y = 5; y < 45; y++) {
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;

        // Conta vizinhos walkable (raio maior)
        let walkableNeighbors = 0;
        for (let dx = -2; dx <= 2; dx++) {
          for (let dy = -2; dy <= 2; dy++) {
            if (dx === 0 && dy === 0) continue;
            if (x + dx >= 0 && x + dx < 50 && y + dy >= 0 && y + dy < 50) {
              if (terrain.get(x + dx, y + dy) !== TERRAIN_MASK_WALL) {
                walkableNeighbors++;
              }
            }
          }
        }

        // Open area: muitos vizinhos
        if (walkableNeighbors > 20) {
          openAreas.push(new RoomPosition(x, y, terrain.roomName));
        }
      }
    }

    return openAreas.slice(0, 20); // Limita a 20 pontos
  }

  /**
   * Identifica aglomerados de estruturas
   * @private
   */
  _findStructureClusters(room) {
    const clusters = [];

    // Agrupa estruturas por tipo
    const byType = {};
    for (const struct of room.find(FIND_STRUCTURES)) {
      const type = struct.structureType;
      if (!byType[type]) byType[type] = [];
      byType[type].push(struct);
    }

    // Cria regiões para tipos significantes
    if (byType[STRUCTURE_SPAWN] && byType[STRUCTURE_SPAWN].length > 0) {
      clusters.push({
        type: 'structure_cluster',
        positions: byType[STRUCTURE_SPAWN].map(s => s.pos),
        priority: 95,
      });
    }

    if (byType[STRUCTURE_STORAGE] && byType[STRUCTURE_STORAGE].length > 0) {
      clusters.push({
        type: 'structure_cluster',
        positions: byType[STRUCTURE_STORAGE].map(s => s.pos),
        priority: 90,
      });
    }

    return clusters;
  }
}
