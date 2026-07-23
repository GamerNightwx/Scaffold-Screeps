import { describe, it, expect, beforeEach } from 'vitest';
import HaulerManager from '../src/economy/HaulerManager.js';

describe('HaulerManager pool task splitting', () => {
  let wm, kernel, hm;

  beforeEach(() => {
    global.Game = { time: 3000, creeps: {} };
    wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
    kernel = { has: (n) => n === 'workingMemory', get: (n) => n === 'workingMemory' ? wm : null };
    hm = new HaulerManager(kernel);
  });

  it('creates tasks per pool member with split amounts', () => {
    const job = { id: 'j1', data: { type: 'transfer', amount: 2000, amountRemaining: 2000, from: 'c1', to: 's1', status: 'pending' } };
    wm._c.logistics = { j1: job };

    const pool = { id: 'pool-j1-abc', jobId: 'j1', amountTotal: 2000, amountRemaining: 2000, members: [{ id: 'A' }, { id: 'B' }], status: 'active' };
    wm._c.hauler_pools = { [pool.id]: pool };

    // run tick to force allocation
    hm.tick();

    const taskA = wm.get('tasks', 'task-j1-A');
    const taskB = wm.get('tasks', 'task-j1-B');

    expect(taskA).toBeTruthy();
    expect(taskB).toBeTruthy();
    expect(taskA.data.assignee).toBe('A');
    expect(taskB.data.assignee).toBe('B');
    expect(taskA.data.meta.amount + taskB.data.meta.amount).toBe(2000);
  });
});