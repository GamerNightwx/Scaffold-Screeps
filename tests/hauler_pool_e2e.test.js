import { describe, it, expect, beforeEach } from 'vitest';
import HaulerManager from '../src/economy/HaulerManager.js';
import HaulerPool from '../src/logistics/HaulerPool.js';

function createWM() {
  const wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = wm._c[col] || {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
  return wm;
}

describe('Hauler pool E2E spawn -> reconcile -> rebalance', () => {
  let wm, kernel, hm, hp;

  beforeEach(() => {
    global.Game = { time: 5000, creeps: {} };
    wm = createWM();
    hp = new HaulerPool({ has: () => true, get: () => wm });
    kernel = { has: (n) => n === 'workingMemory' || n === 'haulerPool', get: (n) => n === 'workingMemory' ? wm : (n === 'haulerPool' ? hp : null), config: {} };
    hm = new HaulerManager(kernel);
  });

  it('creates tasks on spawn assign and rebalances across joins and progress', () => {
    const job = { id: 'j3', data: { type: 'transfer', amount: 1200, amountRemaining: 1200, from: 'c3', to: 's3', status: 'pending' } };
    wm._c.logistics = { j3: job };

    const pool = { id: 'pool-j3-1', jobId: 'j3', amountTotal: 1200, amountRemaining: 1200, members: [], status: 'pending' };
    wm._c.hauler_pools = { [pool.id]: pool };

    // spawn1 appears for pool
    const spawn1 = { id: 'spawn-job-1', data: { name: 'creep1', status: 'spawned', meta: { poolId: pool.id } } };
    wm._c.spawns = { [spawn1.id]: spawn1 };

    // tick: reconcile spawns -> assign member -> ensure tasks
    hm.tick();

    const t1 = wm.get('tasks', 'task-j3-creep1');
    expect(t1).toBeTruthy();
    expect(t1.data.meta.remaining).toBe(1200);

    // second spawn appears
    const spawn2 = { id: 'spawn-job-2', data: { name: 'creep2', status: 'spawned', meta: { poolId: pool.id } } };
    wm._c.spawns[spawn2.id] = spawn2;

    hm.tick();

    const t2 = wm.get('tasks', 'task-j3-creep2');
    expect(t2).toBeTruthy();
    // after 2 members, each should have half remaining
    expect((wm.get('tasks', 'task-j3-creep1').data.meta.remaining + t2.data.meta.remaining)).toBe(1200);

    // simulate creep1 moved 400
    const t1now = wm.get('tasks', 'task-j3-creep1');
    t1now.data.meta.remaining = 200; // was 600 -> now 200
    wm.set('tasks', t1now);
    // update pool remaining accordingly
    const p = wm.get('hauler_pools', pool.id);
    p.amountRemaining = 800;
    wm.set('hauler_pools', p);

    // new spawn creep3 joins
    const spawn3 = { id: 'spawn-job-3', data: { name: 'creep3', status: 'spawned', meta: { poolId: pool.id } } };
    wm._c.spawns[spawn3.id] = spawn3;

    hm.tick();

    const ta = wm.get('tasks', 'task-j3-creep1');
    const tb = wm.get('tasks', 'task-j3-creep2');
    const tc = wm.get('tasks', 'task-j3-creep3');

    expect(ta && tb && tc).toBeTruthy();

    const sumRemaining = (ta.data.meta.remaining || 0) + (tb.data.meta.remaining || 0) + (tc.data.meta.remaining || 0);
    expect(sumRemaining).toBe(800);

    // ensure creep1 preserved completed amount = 400
    const completed1 = ta.data.meta.amount - ta.data.meta.remaining;
    expect(completed1).toBe(400);
  });
});