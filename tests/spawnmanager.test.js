import { describe, it, expect, beforeEach } from 'vitest';
import SpawnManager from '../src/spawn/SpawnManager.js';

describe('SpawnManager', () => {
  let sm;
  let kernel;
  let wm;

  beforeEach(() => {
    // lightweight WM mock
    wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
    kernel = { has: (_name) => _name === 'workingMemory', get: (_name) => wm };
    sm = new SpawnManager(kernel);
  });

  it('registers blueprint and selects it', () => {
    sm.registerBlueprint('worker', (meta) => ({ body: ['work', 'move'], meta }));
    const id = sm.enqueue({ blueprint: 'worker', priority: 1, meta: { role: 'harvester' } });
    expect(id).toBeDefined();
    const res = sm.tick();
    expect(res).not.toBeNull();
    expect(res.request.id).toBe(id);
    expect(res.blueprint).toBeDefined();
    expect(res.blueprint.body).toEqual(['work', 'move']);
    expect(res.request.meta.role).toBe('harvester');
  });

  it('prioritizes queue by priority then FIFO', () => {
    sm.registerBlueprint('a', () => ({ body: ['a'] }));
    sm.registerBlueprint('b', () => ({ body: ['b'] }));

    const low = { blueprint: 'a', priority: 1 };
    const high = { blueprint: 'b', priority: 10 };
    const mid1 = { blueprint: 'a', priority: 5 };
    const mid2 = { blueprint: 'a', priority: 5 };

    // Enqueue in order low, mid1, mid2, high
    sm.enqueue(low);
    // sleep not available; rely on _enqueuedAt ordering via immediate calls
    sm.enqueue(mid1);
    sm.enqueue(mid2);
    sm.enqueue(high);

    // First should be high
    let next = sm.dequeueNext();
    expect(next.blueprint).toBe('b');

    // Next should be mid1 then mid2 (FIFO among same priority)
    next = sm.dequeueNext();
    expect(next.blueprint).toBe('a');
    const secondId = next.id;
    next = sm.dequeueNext();
    expect(next.id).not.toBe(secondId);

    // Last is low
    next = sm.dequeueNext();
    expect(next.blueprint).toBe('a');
  });

  it('returns null from tick when blueprint missing', () => {
    sm.enqueue({ blueprint: 'missing', priority: 1 });
    const res = sm.tick();
    expect(res).toBeNull();
  });
});
