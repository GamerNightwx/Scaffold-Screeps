import { describe, it, expect, beforeEach } from 'vitest';
import Scheduler from '../src/scheduler/Scheduler.js';

describe('Scheduler', () => {
  let kernel;
  let wm;
  let scheduler;
  
  beforeEach(() => {
    global.Game = { time: 100 };

    // WorkingMemory mock
    wm = {
      _c: {},
      list: (col) => Object.values(wm._c[col] || {}),
      set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; },
      get: (col, id) => (wm._c[col] || {})[id] || null,
    };

    // SpatialEngine mock: computePath returns cost equal to manhattan distance
    const spatial = {
      computePath: (start, end) => ({ cost: Math.abs(start.x - end.x) + Math.abs(start.y - end.y), path: [] })
    };

    // kernel mock
    kernel = {
      has: (name) => name === 'workingMemory' || name === 'spatialEngine',
      get: (name) => name === 'workingMemory' ? wm : (name === 'spatialEngine' ? spatial : null)
    };

    scheduler = new Scheduler(kernel);
  });

  it('assigns nearest agent to tasks', () => {
    // Two agents at x=0 and x=10
    global.Game.creeps = {
      agentA: { pos: { x: 0, y: 0, roomName: 'R' } },
      agentB: { pos: { x: 10, y: 0, roomName: 'R' } }
    };

    // Two tasks at x=1 and x=9
    const t1 = { id: 'task_g1', data: { goalId: 'g1', status: 'pending', meta: { target: { x: 1, y: 0, roomName: 'R' } } } };
    const t2 = { id: 'task_g2', data: { goalId: 'g2', status: 'pending', meta: { target: { x: 9, y: 0, roomName: 'R' } } } };
    wm._c.tasks = { [t1.id]: t1, [t2.id]: t2 };

    const assignments = scheduler.tick();
    expect(assignments.length).toBe(2);

    const updated1 = wm.get('tasks', t1.id);
    const updated2 = wm.get('tasks', t2.id);
    expect(updated1.data.assignee).toBe('agentA');
    expect(updated2.data.assignee).toBe('agentB');
  });

  it('considers priority to prefer high-priority tasks', () => {
    global.Game.creeps = {
      agentA: { pos: { x: 0, y: 0, roomName: 'R' } },
      agentB: { pos: { x: 10, y: 0, roomName: 'R' } }
    };

    // One far high-priority task and one near low-priority task
    const t1 = { id: 'task_far_high', data: { goalId: 'g1', status: 'pending', priority: 10, meta: { target: { x: 9, y: 0, roomName: 'R' } } } };
    const t2 = { id: 'task_near_low', data: { goalId: 'g2', status: 'pending', priority: 0, meta: { target: { x: 1, y: 0, roomName: 'R' } } } };
    wm._c.tasks = { [t1.id]: t1, [t2.id]: t2 };

    const assignments = scheduler.tick();
    expect(assignments.length).toBe(2);

    // High priority should get an agent despite distance
    const updatedFar = wm.get('tasks', t1.id);
    expect(['agentA','agentB']).toContain(updatedFar.data.assignee);
  });
});
