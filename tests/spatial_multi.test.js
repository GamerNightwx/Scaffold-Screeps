import { describe, it, expect, beforeEach } from 'vitest';
import SpatialEngine from '../src/spatial/SpatialEngine.js';

// Reuse existing RoomPosition mock behavior
global.Game = { time: 400, cpu: { getUsed: () => 0 }, rooms: {} };
global.RoomPosition = function(x, y, roomName) { this.x = x; this.y = y; this.roomName = roomName; this.findPathTo = function(end){ const steps=[]; let cx=this.x, cy=this.y; while(cx!==end.x||cy!==end.y){ if(cx<end.x)cx++; else if(cx>end.x)cx--; else if(cy<end.y)cy++; else if(cy>end.y)cy--; steps.push({x:cx,y:cy,roomName:this.roomName}); } return steps; } };
global.Room = { Terrain: function(roomName){ this.roomName=roomName; this.get = function(){ return 0; } } };

describe('Multi-room path support', () => {
  let engine;
  beforeEach(() => { engine = new SpatialEngine(null); Game.time = 400; });

  it('computeMultiRoomPath adds room penalty when rooms differ', () => {
    const start = new RoomPosition(1,1,'RoomA');
    const end = new RoomPosition(3,3,'RoomB');
    const res = engine.computePath(start, end);
    expect(res).toHaveProperty('path');
    expect(res).toHaveProperty('cost');
    expect(res.cost).toBeGreaterThanOrEqual(Math.abs(start.x-end.x)+Math.abs(start.y-end.y));
    expect(res.cost).toBeGreaterThan(Math.abs(start.x-end.x)+Math.abs(start.y-end.y));
  });

  it('computePath in same room behaves normally', () => {
    const start = new RoomPosition(2,2,'R');
    const end = new RoomPosition(4,4,'R');
    const res = engine.computePath(start, end);
    expect(res.cost).toBe(res.path.length);
  });
});