import { describe, it, expect, beforeEach } from 'vitest';
import HaulerManager from '../src/economy/HaulerManager.js';

describe('HaulerManager spawn reconciler', () => {
  let wm, kernel, hm;

  beforeEach(() => {
    global.Game = { time: 1000, creeps: {} };
    wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
    kernel = { has: (n) => n === 'workingMemory' || n === 'haulerPool', get: (n) => n === 'workingMemory' ? wm : null };
    // minimal haulerPool mock
    kernel.get = (n) => {
      if (n === 'workingMemory') return wm;
      if (n === 'haulerPool') return { assignMember: (pid, cid) => {
        const pool = wm.get('hauler_pools', pid);
        if (!pool) return null;
        pool.members = pool.members || [];
        pool.members.push({ id: cid, assignedAt: Game.time });
        pool.status = 'active';
        wm.set('hauler_pools', pool);
        return pool;
      } };
      return null;
    };

    hm = new HaulerManager(kernel);
  });

  it('assigns spawned creep to pool and logistics job', () => {
    // create logistics job
    const job = { id: 'j1', data: { type: 'transfer', amount: 2000, from: 'c1', to: 's1', status: 'pending' } };
    wm._c.logistics = { j1: job };

    // create pool
    const pool = { id: 'pool-j1-abc', jobId: 'j1', amountTotal: 2000, amountRemaining: 2000, members: [], status: 'pending' };
    wm._c.hauler_pools = { [pool.id]: pool };

    // create spawn job marked spawned
    const spawnJob = { id: 'spawn-1', data: { name: 'creepX', status: 'spawned', meta: { poolId: pool.id, originJobId: 'j1' } } };
    wm._c.spawns = { [spawnJob.id]: spawnJob };

    // create Game.creeps entry
    Game.creeps = { creepX: { name: 'creepX' } };

    // run tick
    hm.tick();

    const updatedJob = wm.get('logistics', 'j1');
    const updatedPool = wm.get('hauler_pools', pool.id);
    const task = wm.list('tasks').find(t => t.id === `task-j1-creepX`);

    expect(updatedJob.data.assignee).toBe('creepX');
    expect(updatedJob.data.status).toBe('assigned');
    expect(updatedPool.members.find(m => m.id === 'creepX')).toBeTruthy();
    expect(task).toBeTruthy();
    expect(task.data.assignee).toBe('creepX');
    expect(task.data.meta.jobId).toBe('j1');
  });
});