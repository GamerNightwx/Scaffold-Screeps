import { describe, it, expect, beforeEach } from 'vitest';
import HaulerPool from '../src/logistics/HaulerPool.js';

describe('HaulerPool', () => {
  let wm;
  let kernel;
  let hp;

  beforeEach(() => {
    wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
    kernel = { has: (n) => n === 'workingMemory', get: (n) => n === 'workingMemory' ? wm : null, config: { haulerPoolThreshold: 1000, haulerPoolMaxMembers: 3 } };
    hp = new HaulerPool(kernel);
  });

  it('creates pool for large transfer jobs', () => {
    const job = { id: 'j1', data: { type: 'transfer', amount: 2000, from: 'c1', to: 's1' } };
    wm._c.logistics = { j1: job };

    const created = hp.tick();
    expect(created.length).toBe(1);
    const pools = wm.list('hauler_pools');
    expect(pools.length).toBe(1);
    expect(pools[0].amountTotal).toBe(2000);
    expect(pools[0].status).toBe('pending');
  });

  it('assigns members and progresses pool', () => {
    const pool = { id: 'pool-j1-abc', jobId: 'j1', amountTotal: 2000, amountRemaining: 2000, members: [], status: 'pending' };
    wm._c.hauler_pools = { [pool.id]: pool };

    const assigned = hp.assignMember(pool.id, 'creepA');
    expect(assigned.members.length).toBe(1);
    expect(assigned.status).toBe('active');

    hp.reportProgress(pool.id, 'creepA', 800);
    const updated = wm.get('hauler_pools', pool.id);
    expect(updated.amountRemaining).toBe(1200);

    // assign another and finish
    hp.assignMember(pool.id, 'creepB');
    hp.reportProgress(pool.id, 'creepB', 1200);
    const done = wm.get('hauler_pools', pool.id);
    expect(done.amountRemaining).toBe(0);
    expect(done.status).toBe('complete');
  });

  it('removes member and resets to pending if no members left', () => {
    const pool = { id: 'pool-j2-xyz', jobId: 'j2', amountTotal: 1500, amountRemaining: 1500, members: [{ id: 'c1' }], status: 'active' };
    wm._c.hauler_pools = { [pool.id]: pool };
    const after = hp.removeMember(pool.id, 'c1');
    expect(after.members.length).toBe(0);
    expect(after.status).toBe('pending');
  });

  it('reports stats correctly', () => {
    wm._c.hauler_pools = {
      'p1': { id: 'p1', status: 'pending' },
      'p2': { id: 'p2', status: 'active' },
      'p3': { id: 'p3', status: 'complete' }
    };
    const stats = hp.getStats();
    expect(stats.totalPools).toBe(3);
    expect(stats.active).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.complete).toBe(1);
  });
});