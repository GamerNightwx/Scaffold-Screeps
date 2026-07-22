import { describe, it, expect, beforeEach } from 'vitest';
import Scheduler from '../src/scheduler/Scheduler.js';

describe('Scheduler traffic influence', () => {
  let kernel;
  let wm;
  let scheduler;

  beforeEach(() => {
    global.Game = { time: 200 };

    wm = {
      _c: {},
      list: (col) => Object.values(wm._c[col] || {}),
      set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; },
      get: (col, id) => (wm._c[col] || {})[id] || null,
    };

    // spatial mock: computePath returns Manhattan distance cost; getTraffic controllable
    const spatial = {
      computePath: (start, end) => ({ cost: Math.abs(start.x - end.x) + Math.abs(start.y - end.y), path: [] }),
      _traffic: {},
      getTraffic: function(roomName) { return this._traffic[roomName] || 0; },
      recordTraffic: function(roomName, w) { this._traffic[roomName] = (this._traffic[roomName] || 0) + w; }
    };

    kernel = {
      has: (name) => name === 'workingMemory' || name === 'spatialEngine',
      get: (name) => name === 'workingMemory' ? wm : (name === 'spatialEngine' ? spatial : null)
    };

    scheduler = new Scheduler(kernel);
  });

  it('prefers lower-traffic room when traffic penalty outweighs distance', () => {
    // single agent
    global.Game.creeps = {
      agent1: { pos: { x: 0, y: 0, roomName: 'S' } }
    };

    // taskHigh is closer (5) than taskLow (6)
    const tHigh = { id: 'task_high', data: { status: 'pending', meta: { target: { x: 5, y: 0, roomName: 'H' } } } };
    const tLow = { id: 'task_low', data: { status: 'pending', meta: { target: { x: 6, y: 0, roomName: 'L' } } } };

    wm._c.tasks = { [tHigh.id]: tHigh, [tLow.id]: tLow };

    // No traffic: should pick closer taskHigh
    let assignments = scheduler.tick();
    expect(assignments.length).toBe(1);
    const assignedTaskId = wm.get('tasks', assignments[0].data.taskId).id;
    expect(assignedTaskId).toBe('task_high');

    // Reset WM
    wm._c = {};
    wm._c.tasks = { [tHigh.id]: tHigh, [tLow.id]: tLow };

    // Increase traffic in room H such that traffic penalty flips preference
    const spatial = kernel.get('spatialEngine');
    spatial._traffic['H'] = 10; // trafficWeight (0.5) * 10 = 5 > distance diff (1)

    assignments = scheduler.tick();
    expect(assignments.length).toBe(1);
    const assigned2 = wm.get('tasks', assignments[0].data.taskId);
    expect(assigned2.id).toBe('task_low');
  });
});