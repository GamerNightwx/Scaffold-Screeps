import { describe, it, expect, beforeEach } from 'vitest';
import SpatialEngine from '../src/spatial/SpatialEngine.js';

global.Game = { time: 300, cpu: { getUsed: () => 0 }, rooms: {} };

global.RoomPosition = function(x, y, roomName) { this.x = x; this.y = y; this.roomName = roomName; };

global.Room = {
  Terrain: function(roomName) {
    this.roomName = roomName;
    this.get = function(x, y) { return 0; };
  }
};

global.TERRAIN_MASK_WALL = 1;

describe('Flow field generation', () => {
  let engine;
  beforeEach(() => { engine = new SpatialEngine(null); Game.time = 300; });

  it('computes flow field pointing towards goal', () => {
    const goal = new RoomPosition(5,5,'R');
    const matrix = engine.computeFlowField('R', [goal]);
    expect(Array.isArray(matrix)).toBe(true);
    expect(matrix[5][5]).toEqual({ dx: 0, dy: 0 });
    // neighbor below should point up
    expect(matrix[6][5]).toEqual({ dx: 0, dy: -1 });
  });

  it('caches flow field and respects ttl', () => {
    const goal = new RoomPosition(10,10,'R');
    const m1 = engine.computeFlowField('R', [goal], { ttl: 5 });
    Game.time = 302;
    const m2 = engine.computeFlowField('R', [goal], { ttl: 5 });
    expect(m1).toBe(m2);
    Game.time = 310;
    const m3 = engine.computeFlowField('R', [goal], { ttl: 5 });
    expect(m3).not.toBe(m2);
  });
});