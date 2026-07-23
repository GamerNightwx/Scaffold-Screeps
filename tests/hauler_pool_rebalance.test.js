import { describe, it, expect, beforeEach } from 'vitest';
import HaulerManager from '../src/economy/HaulerManager.js';
import HaulerPool from '../src/logistics/HaulerPool.js';

function createWM() {
  const wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = wm._c[col] || {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
  return wm;
}

describe('Hauler pool dynamic rebalance', () => {
  let wm, kernel, hm, hp;

  beforeEach(() => {
    global.Game = { time: 4000, creeps: {} };
    wm = createWM();
    kernel = { has: (n) => n === 'workingMemory' || n === 'haulerPool', get: (n) => n === 'workingMemory' ? wm : (n === 'haulerPool' ? hp : null), config: {} };
    hm = new HaulerManager(kernel);
    hp = new HaulerPool(kernel);
    // ensure kernel.get will return hp (set after hp constructed)
    kernel.get = (n) => n === 'workingMemory' ? wm : (n === 'haulerPool' ? hp : null);
  });

  it('redistributes evenly when member joins', () => {
    const job = { id: 'j1', data: { type: 'transfer', amount: 1000, amountRemaining: 1000, from: 'c1', to: 's1', status: 'pending' } };
    wm._c.logistics = { j1: job };

    const pool = { id: 'pool-j1-xyz', jobId: 'j1', amountTotal: 1000, amountRemaining: 1000, members: [{ id: 'A' }, { id: 'B' }], status: 'active' };
    wm._c.hauler_pools = { [pool.id]: pool };

    // initial allocation
    hm.tick();
    const tA1 = wm.get('tasks', 'task-j1-A');
    const tB1 = wm.get('tasks', 'task-j1-B');
    expect(tA1.data.meta.amount + tB1.data.meta.amount).toBe(1000);

    // simulate A progressed 300
    tA1.data.meta.remaining = 200; // was 500 -> now 200
    wm.set('tasks', tA1);
    // update pool remaining accordingly
    pool.amountRemaining = 700;
    wm.set('hauler_pools', pool);

    // new member C joins
    hp.assignMember(pool.id, 'C');
    // persist updated pool returned by assignMember
    const updatedPool = wm.get('hauler_pools', pool.id);
    expect(updatedPool.members.length).toBe(3);

    // tick to rebalance
    hm.tick();

    const tA2 = wm.get('tasks', 'task-j1-A');
    const tB2 = wm.get('tasks', 'task-j1-B');
    const tC2 = wm.get('tasks', 'task-j1-C');

    expect(tA2).toBeTruthy();
    expect(tB2).toBeTruthy();
    expect(tC2).toBeTruthy();

    const sum = (tA2.data.meta.remaining || 0) + (tB2.data.meta.remaining || 0) + (tC2.data.meta.remaining || 0);
    expect(sum).toBe(700);

    // allocations should be approximately even (233/234)
    expect(Math.abs(tA2.data.meta.remaining - tB2.data.meta.remaining)).toBeLessThanOrEqual(2);
    expect(Math.abs(tB2.data.meta.remaining - tC2.data.meta.remaining)).toBeLessThanOrEqual(2);
  });

  it('redistributes when a member leaves', () => {
    const job = { id: 'j2', data: { type: 'transfer', amount: 900, amountRemaining: 900, from: 'c2', to: 's2', status: 'pending' } };
    wm._c.logistics = { j2: job };

    const pool = { id: 'pool-j2-abc', jobId: 'j2', amountTotal: 900, amountRemaining: 900, members: [{ id: 'X' }, { id: 'Y' }, { id: 'Z' }], status: 'active' };
    wm._c.hauler_pools = { [pool.id]: pool };

    hm.tick();

    const tX1 = wm.get('tasks', 'task-j2-X');
    const tY1 = wm.get('tasks', 'task-j2-Y');
    const tZ1 = wm.get('tasks', 'task-j2-Z');
    expect(tX1 && tY1 && tZ1).toBeTruthy();

    // remove member Y
    hp.removeMember(pool.id, 'Y');
    const after = wm.get('hauler_pools', pool.id);
    expect(after.members.find(m => m.id === 'Y')).toBeUndefined();

    // tick to rebalance
    hm.tick();

    const tX2 = wm.get('tasks', 'task-j2-X');
    const tZ2 = wm.get('tasks', 'task-j2-Z');
    const tY2 = wm.get('tasks', 'task-j2-Y');

    // Y's task should either be removed or marked done
    if (tY2) expect(tY2.data.status === 'done' || tY2.data.meta.remaining === 0).toBeTruthy();

    // remaining should be split between X and Z
    const sum = (tX2.data.meta.remaining || 0) + (tZ2.data.meta.remaining || 0);
    expect(sum).toBe(900);
    expect(Math.abs(tX2.data.meta.remaining - tZ2.data.meta.remaining)).toBeLessThanOrEqual(1);
  });
});