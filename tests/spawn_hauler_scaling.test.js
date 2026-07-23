import { describe, it, expect, beforeEach } from 'vitest';
import Kernel from '../src/kernel/Kernel.js';
import SpawnManager from '../src/spawn/SpawnManager.js';
import { registerDefaultBlueprints } from '../src/spawn/blueprints.js';
import HaulerScaler from '../src/logistics/HaulerScaler.js';

describe('SpawnManager hauler scaling integration', () => {
  let kernel;
  let wm;
  let sm;
  let scaler;

  beforeEach(() => {
    global.Game = { time: 200 };
    wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
    kernel = new Kernel({ cpuBudget: 50 });
    kernel.register('workingMemory', () => wm);
    // register haulerScaler before blueprints so blueprint can access it
    kernel.register('haulerScaler', (k) => new HaulerScaler(k));
    sm = new SpawnManager(kernel);
    registerDefaultBlueprints(sm, kernel);
  });

  it('chooses hauler blueprint sized by HaulerScaler', () => {
    // enqueue a hauler request for cross-room transfer
    const req = { id: 'req1', blueprint: 'hauler', priority: 0, meta: { sourceRoom: 'W1N1', targetRoom: 'W5N5' } };
    sm.enqueue(req);
    const result = sm.tick();
    expect(result).not.toBeNull();
    expect(result.blueprint).toBeDefined();
    const body = result.blueprint.body;
    expect(Array.isArray(body)).toBe(true);
    const carryCount = body.filter(p => p === 'CARRY').length;
    const moveCount = body.filter(p => p === 'MOVE').length;
    expect(carryCount).toBeGreaterThan(0);
    expect(moveCount).toBeGreaterThan(0);
    // expect moves at least ceil(carry/2)
    expect(moveCount).toBeGreaterThanOrEqual(Math.ceil(carryCount/2));
  });
});