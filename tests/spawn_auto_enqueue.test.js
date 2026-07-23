import { describe, it, expect, beforeEach } from 'vitest';
import Kernel from '../src/kernel/Kernel.js';
import SpawnManager from '../src/spawn/SpawnManager.js';
import HaulerScaler from '../src/logistics/HaulerScaler.js';
import { registerDefaultBlueprints } from '../src/spawn/blueprints.js';

describe('SpawnManager auto-enqueue urgent logistics', () => {
  let kernel;
  let wm;
  let sm;

  beforeEach(() => {
    global.Game = { time: 300 };
    wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
    kernel = new Kernel({ cpuBudget: 50, haulerSpawnPriorityThreshold: 80 });
    kernel.register('workingMemory', () => wm);
    kernel.register('haulerScaler', (k) => new HaulerScaler(k));

    sm = new SpawnManager(kernel);
    registerDefaultBlueprints(sm, kernel);
  });

  it('auto-enqueues and returns hauler blueprint for high-priority transport goal', () => {
    const goal = { id: 'goal-urgent', data: { type: 'transport', priority: 100, meta: { from: 'W1', to: 'W2' } } };
    wm._c.goals = { 'goal-urgent': goal };

    const res = sm.tick();
    expect(res).not.toBeNull();
    expect(res.request).toBeDefined();
    expect(res.request.blueprint).toBe('hauler');
    expect(res.blueprint).toBeDefined();
  });

  it('does not auto-enqueue for low-priority transport goal', () => {
    const goal = { id: 'goal-low', data: { type: 'transport', priority: 10, meta: { from: 'W1', to: 'W2' } } };
    wm._c.goals = { 'goal-low': goal };

    const res = sm.tick();
    expect(res).toBeNull();
  });
});