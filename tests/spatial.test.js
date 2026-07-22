/**
 * tests/spatial.test.js
 * Testes para SpatialEngine
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import SpatialEngine from '../src/spatial/SpatialEngine.js';

// Mock do Screeps Game API
global.Game = {
  time: 100,
  cpu: {
    getUsed: () => 0,
  },
  rooms: {},
};

global.RoomPosition = function(x, y, roomName) {
  this.x = x;
  this.y = y;
  this.roomName = roomName;

  this.findPathTo = (end) => {
    // Simula pathfinding: retorna um array de posições
    const steps = [];
    let currentX = this.x;
    let currentY = this.y;

    while (currentX !== end.x || currentY !== end.y) {
      if (currentX < end.x) currentX++;
      else if (currentX > end.x) currentX--;
      else if (currentY < end.y) currentY++;
      else if (currentY > end.y) currentY--;

      steps.push({ x: currentX, y: currentY });
    }

    return steps;
  };
};

global.Room = {
  Terrain: function(roomName) {
    this.roomName = roomName;
    // Mock: tudo é walkable exceto paredes em posições específicas
    const walls = new Set(['10,10', '20,20', '30,30']);

    this.get = function(x, y) {
      if (walls.has(`${x},${y}`)) return 1; // TERRAIN_MASK_WALL
      return 0; // walkable
    };
  },
};

global.TERRAIN_MASK_WALL = 1;
global.FIND_STRUCTURES = 'find_structures';
global.STRUCTURE_SPAWN = 'spawn';
global.STRUCTURE_STORAGE = 'storage';

describe('SpatialEngine', () => {
  let engine;
  let kernel;

  beforeEach(() => {
    kernel = {
      get: vi.fn(),
    };
    engine = new SpatialEngine(kernel);
    Game.time = 100;
  });

  describe('computePath', () => {
    it('calcula caminho entre dois pontos', () => {
      const start = new RoomPosition(5, 5, 'E1N1');
      const end = new RoomPosition(10, 10, 'E1N1');

      const result = engine.computePath(start, end);

      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('cost');
      expect(result).toHaveProperty('computedTick');
      expect(result).toHaveProperty('ttl');
      expect(result.path.length).toBeGreaterThan(0);
      expect(result.cost).toBe(result.path.length);
    });

    it('cacheia caminhos e incrementa hit count', () => {
      const start = new RoomPosition(5, 5, 'E1N1');
      const end = new RoomPosition(10, 10, 'E1N1');

      engine.computePath(start, end);
      engine.computePath(start, end);

      expect(engine.metrics.pathCacheHits).toBe(1);
      expect(engine.metrics.pathCacheMisses).toBe(1);
    });

    it('respeita TTL do cache', () => {
      const start = new RoomPosition(5, 5, 'E1N1');
      const end = new RoomPosition(10, 10, 'E1N1');

      engine.computePath(start, end, { ttl: 5 });
      expect(engine.metrics.pathCacheMisses).toBe(1);

      // Avança tempo além do TTL
      Game.time = 106;

      engine.computePath(start, end, { ttl: 5 });
      expect(engine.metrics.pathCacheMisses).toBe(2);
    });
  });

  describe('distanceMatrix', () => {
    it('computa matriz de distâncias', () => {
      const origin = new RoomPosition(5, 5, 'E1N1');
      const matrix = engine.distanceMatrix('E1N1', origin);

      expect(Array.isArray(matrix)).toBe(true);
      expect(matrix.length).toBe(50);
      expect(matrix[0].length).toBe(50);
      expect(matrix[5][5]).toBe(0);
    });

    it('cacheia matrizes de distância', () => {
      const origin = new RoomPosition(5, 5, 'E1N1');

      const matrix1 = engine.distanceMatrix('E1N1', origin);
      expect(engine.metrics.distanceMatrixComputes).toBe(1);

      const matrix2 = engine.distanceMatrix('E1N1', origin);
      expect(engine.metrics.distanceMatrixComputes).toBe(1);
      expect(matrix1).toEqual(matrix2);
    });

    it('expira cache de matriz após 10 ticks', () => {
      const origin = new RoomPosition(5, 5, 'E1N1');

      engine.distanceMatrix('E1N1', origin);
      expect(engine.metrics.distanceMatrixComputes).toBe(1);

      Game.time = 111;

      engine.distanceMatrix('E1N1', origin);
      expect(engine.metrics.distanceMatrixComputes).toBe(2);
    });
  });

  describe('analyzeTopology', () => {
    it('identifica regiões topológicas', () => {
      const regions = engine.analyzeTopology('E1N1');

      expect(Array.isArray(regions)).toBe(true);
      expect(regions.length).toBeGreaterThan(0);
      const types = regions.map(r => r.type);
      // Pode ter chokepoint ou open_area dependendo da topologia
      expect(types.length).toBeGreaterThan(0);
    });

    it('cacheia análise de topologia', () => {
      engine.analyzeTopology('E1N1');
      expect(engine.metrics.topologyAnalyzes).toBe(1);

      engine.analyzeTopology('E1N1');
      expect(engine.metrics.topologyAnalyzes).toBe(1);
    });

    it('recomputa topologia após 100 ticks', () => {
      engine.analyzeTopology('E1N1');
      expect(engine.metrics.topologyAnalyzes).toBe(1);

      Game.time = 201;

      engine.analyzeTopology('E1N1');
      expect(engine.metrics.topologyAnalyzes).toBe(2);
    });
  });

  describe('cleanup', () => {
    it('remove entradas expiradas do cache', () => {
      const start = new RoomPosition(5, 5, 'E1N1');
      const end = new RoomPosition(10, 10, 'E1N1');

      engine.computePath(start, end, { ttl: 2 });
      expect(engine.pathCache.size).toBe(1);

      Game.time = 103;
      engine.cleanup();

      expect(engine.pathCache.size).toBe(0);
    });

    it('limpa matriz de distância expirada', () => {
      const origin = new RoomPosition(5, 5, 'E1N1');
      engine.distanceMatrix('E1N1', origin);
      expect(engine.distanceMatrixCache.size).toBe(1);

      Game.time = 111;
      engine.cleanup();

      expect(engine.distanceMatrixCache.size).toBe(0);
    });
  });

  describe('getMetrics', () => {
    it('retorna estatísticas de cache', () => {
      const start = new RoomPosition(5, 5, 'E1N1');
      const end = new RoomPosition(10, 10, 'E1N1');

      engine.computePath(start, end);
      engine.computePath(start, end);

      const metrics = engine.getMetrics();

      expect(metrics).toHaveProperty('pathCache');
      expect(metrics.pathCache.hits).toBe(1);
      expect(metrics.pathCache.misses).toBe(1);
      expect(metrics.pathCache.hitRate).toBe('50.0%');
    });

    it('calcula hit rate corretamente', () => {
      const start = new RoomPosition(5, 5, 'E1N1');
      const end = new RoomPosition(10, 10, 'E1N1');

      // 4 miss, 2 hit
      for (let i = 0; i < 4; i++) {
        Game.time = 100 + i;
        engine.computePath(start, end, { ttl: 1 });
      }
      for (let i = 0; i < 2; i++) {
        engine.computePath(start, end, { ttl: 1000 });
      }

      const metrics = engine.getMetrics();
      expect(metrics.pathCache.hitRate).toBe('33.3%');
    });
  });

  describe('tick', () => {
    it('executa cleanup em cada tick', () => {
      const cleanupSpy = vi.spyOn(engine, 'cleanup');

      engine.tick();

      expect(cleanupSpy).toHaveBeenCalled();
    });
  });
});
