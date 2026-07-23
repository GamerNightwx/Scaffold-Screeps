import { describe, it, expect, beforeEach } from 'vitest';
import StorageManager from '../src/logistics/StorageManager.js';
import HaulerManager from '../src/economy/HaulerManager.js';

describe('Logistics Prioritization', () => {
  let wm;
  let kernel;
  let sm;
  let hm;

  beforeEach(() => {
    wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
    kernel = { has: (n) => n === 'workingMemory', get: (n) => n === 'workingMemory' ? wm : null };
    sm = new StorageManager(kernel);
    hm = new HaulerManager(kernel);
  });

  it('hauler transfer job for same-room is low priority by default', () => {
    wm._c.containers = { c1: { id: 'c1', data: { energy: 900, pos: { x: 10, y: 20 }, room: 'W1' } } };
    wm._c.storages = { s1: { id: 's1', data: { pos: { x: 5, y: 5 }, room: 'W1' } } };

    const jobs = hm.tick();
    expect(jobs.length).toBe(1);
    expect(jobs[0].data.priority).toBeDefined();
    expect(['low','medium','high']).toContain(jobs[0].data.priority);
    expect(jobs[0].data.priority).not.toBe('high');
  });

  it('refill job for cross-room transfer is high priority', () => {
    sm.registerNetwork('W1', 'storage1');
    sm.registerNetwork('W2', 'storage2');
    sm.updateStock('W1', 'energy', 200000);
    sm.updateStock('W2', 'energy', 50000); // below refill target

    const jobs = sm.tick();
    const refill = jobs.find(j => j.data && j.data.type === 'refill');
    expect(refill).toBeDefined();
    expect(refill.data.priority).toBeDefined();
    expect(refill.data.priority).toBe('high');
  });
});