/**
 * WorldModel - Fonte única de verdade sobre o estado do jogo
 * Captura snapshot da Game API, cria índices rápidos
 */

export default class WorldModel {
  constructor() {
    this.currentSnapshot = null;
    this.previousSnapshot = null;
  }

  /**
   * Captura snapshot completo do jogo
   * @returns {Object} WorldSnapshot { tickId, game, memory, indices, meta }
   */
  snapshot() {
    this.previousSnapshot = this.currentSnapshot;

    const startTime = Date.now();
    const startCpu = Game.cpu.getUsed();

    const game = {
      time: Game.time,
      creeps: this._captureCreeps(),
      structures: this._captureStructures(),
      rooms: this._captureRooms(),
      flags: this._captureFlags(),
      resources: this._captureResources()
    };

    this.currentSnapshot = {
      tickId: Game.time,
      game: game,
      memory: {
        ...Memory
      },
      indices: this._buildIndices(game),
      meta: {
        timestamp: startTime,
        cpuStarted: startCpu,
        cpuFinished: Game.cpu.getUsed(),
        cpuUsed: Game.cpu.getUsed() - startCpu
      }
    };

    return this.currentSnapshot;
  }

  /**
   * Acesso imutável ao snapshot atual
   * @returns {Object} WorldSnapshot
   */
  current() {
    return this.currentSnapshot;
  }

  /**
   * Acesso ao snapshot anterior (para comparação)
   * @returns {Object} WorldSnapshot | null
   */
  previous() {
    return this.previousSnapshot;
  }

  /**
   * Consulta índice pré-computado
   * @param {string} indexName - nome do índice
   * @param {string} key - chave do índice
   * @returns {Array} resultado
   */
  query(indexName, key) {
    if (!this.currentSnapshot) {
      return [];
    }

    const indices = this.currentSnapshot.indices;
    if (!indices[indexName]) {
      console.warn(`[WorldModel] Unknown index: ${indexName}`);
      return [];
    }

    if (!indices[indexName][key]) {
      return [];
    }

    return indices[indexName][key];
  }

  /**
   * Retorna todas as entidades de um tipo
   * @param {string} type - 'creeps', 'structures', 'rooms'
   * @returns {Array}
   */
  entities(type) {
    if (!this.currentSnapshot) return [];
    return this.currentSnapshot.game[type] || [];
  }

  /**
   * Captura todos os creeps
   * @private
   * @returns {Array<Object>}
   */
  _captureCreeps() {
    const creeps = [];
    for (const name in Game.creeps) {
      const creep = Game.creeps[name];
      creeps.push({
        id: creep.id,
        name: creep.name,
        room: creep.room.name,
        pos: { x: creep.pos.x, y: creep.pos.y, roomName: creep.pos.roomName },
        body: creep.body.map(part => ({ type: part.type, hits: part.hits })),
        hits: creep.hits,
        hitsMax: creep.hitsMax,
        energy: creep.energy,
        energyCapacity: creep.energyCapacity,
        saying: creep.saying,
        fatigue: creep.fatigue,
        memory: creep.memory
      });
    }
    return creeps;
  }

  /**
   * Captura todas as structures
   * @private
   * @returns {Array<Object>}
   */
  _captureStructures() {
    const structures = [];
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      const structs = room.find(FIND_STRUCTURES);
      for (const struct of structs) {
        structures.push({
          id: struct.id,
          type: struct.structureType,
          room: roomName,
          pos: { x: struct.pos.x, y: struct.pos.y, roomName: struct.pos.roomName },
          hits: struct.hits,
          hitsMax: struct.hitsMax,
          energy: struct.energy,
          energyCapacity: struct.energyCapacity,
          owner: struct.owner ? struct.owner.username : null
        });
      }
    }
    return structures;
  }

  /**
   * Captura informações das rooms
   * @private
   * @returns {Array<Object>}
   */
  _captureRooms() {
    const rooms = [];
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      const roomObj = {
        name: roomName,
        energyAvailable: room.energyAvailable,
        energyCapacityAvailable: room.energyCapacityAvailable,
        controller: null,
        storage: null,
        terminal: null,
        sources: [],
        minerals: [],
        deposits: []
      };

      if (room.controller) {
        roomObj.controller = {
          id: room.controller.id,
          level: room.controller.level,
          progress: room.controller.progress,
          progressTotal: room.controller.progressTotal,
          owner: room.controller.owner ? room.controller.owner.username : null
        };
      }

      if (room.storage) {
        roomObj.storage = {
          id: room.storage.id,
          energy: room.storage.store.energy,
          resources: { ...room.storage.store }
        };
      }

      if (room.terminal) {
        roomObj.terminal = {
          id: room.terminal.id,
          energy: room.terminal.store.energy,
          resources: { ...room.terminal.store }
        };
      }

      const sources = room.find(FIND_SOURCES);
      roomObj.sources = sources.map(s => ({
        id: s.id,
        pos: { x: s.pos.x, y: s.pos.y, roomName: s.pos.roomName },
        energy: s.energy,
        energyCapacity: s.energyCapacity,
        ticksToRegeneration: s.ticksToRegeneration
      }));

      const minerals = room.find(FIND_MINERALS);
      roomObj.minerals = minerals.map(m => ({
        id: m.id,
        pos: { x: m.pos.x, y: m.pos.y, roomName: m.pos.roomName },
        mineralType: m.mineralType,
        density: m.density,
        amount: m.amount
      }));

      rooms.push(roomObj);
    }
    return rooms;
  }

  /**
   * Captura flags
   * @private
   * @returns {Array<Object>}
   */
  _captureFlags() {
    const flags = [];
    for (const flagName in Game.flags) {
      const flag = Game.flags[flagName];
      flags.push({
        name: flagName,
        pos: { x: flag.pos.x, y: flag.pos.y, roomName: flag.pos.roomName },
        color: flag.color,
        secondaryColor: flag.secondaryColor
      });
    }
    return flags;
  }

  /**
   * Captura recursos no mapa (dropped energy, etc)
   * @private
   * @returns {Array<Object>}
   */
  _captureResources() {
    const resources = [];
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      const dropped = room.find(FIND_DROPPED_RESOURCES);
      for (const res of dropped) {
        resources.push({
          id: res.id,
          type: res.resourceType,
          amount: res.amount,
          pos: { x: res.pos.x, y: res.pos.y, roomName: res.pos.roomName }
        });
      }
    }
    return resources;
  }

  /**
   * Constrói índices para consulta rápida
   * @private
   * @param {Object} game - objeto game
   * @returns {Object<string, Object>}
   */
  _buildIndices(game) {
    const indices = {};

    // creepsByRoom: { roomName => [creeps] }
    indices.creepsByRoom = {};
    for (const creep of game.creeps) {
      if (!indices.creepsByRoom[creep.room]) {
        indices.creepsByRoom[creep.room] = [];
      }
      indices.creepsByRoom[creep.room].push(creep);
    }

    // structuresByRoom: { roomName => [structures] }
    indices.structuresByRoom = {};
    for (const struct of game.structures) {
      if (!indices.structuresByRoom[struct.room]) {
        indices.structuresByRoom[struct.room] = [];
      }
      indices.structuresByRoom[struct.room].push(struct);
    }

    // structuresByType: { type => [structures] }
    indices.structuresByType = {};
    for (const struct of game.structures) {
      if (!indices.structuresByType[struct.type]) {
        indices.structuresByType[struct.type] = [];
      }
      indices.structuresByType[struct.type].push(struct);
    }

    // sourcesByRoom: { roomName => [sources] }
    indices.sourcesByRoom = {};
    for (const room of game.rooms) {
      if (room.sources.length > 0) {
        indices.sourcesByRoom[room.name] = room.sources;
      }
    }

    // creepsById: { id => creep }
    indices.creepsById = {};
    for (const creep of game.creeps) {
      indices.creepsById[creep.id] = creep;
    }

    // structuresById: { id => structure }
    indices.structuresById = {};
    for (const struct of game.structures) {
      indices.structuresById[struct.id] = struct;
    }

    return indices;
  }
}
