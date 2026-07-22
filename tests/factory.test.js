import { describe, it, expect, beforeEach } from 'vitest';
import FactoryManager from '../src/economy/FactoryManager.js';

describe('FactoryManager', () => {
  let wm;
  let fm;
  let kernel;

  beforeEach(() => {
    wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
    kernel = { has: (n) => n === 'workingMemory', get: (n) => n === 'workingMemory' ? wm : null };
    fm = new FactoryManager(kernel);
  });

  it('registers recipes and retrieves them', () => {
    const recipe = {
      inputs: { energy: 5000, O: 100 },
      outputs: { OH: 200 },
      time: 50
    };
    fm.registerRecipe('OH_synthesis', recipe);
    const retrieved = fm.getRecipe('OH_synthesis');
    expect(retrieved).toEqual(recipe);
  });

  it('enqueues batch and persists to WM', () => {
    fm.registerRecipe('test', { inputs: {}, outputs: { resource: 100 }, time: 10 });
    const id = fm.enqueue({ recipe: 'test', priority: 5 });
    expect(id).toBeDefined();
    const persisted = wm.get('factory', id);
    expect(persisted).not.toBeNull();
    expect(persisted.data.status).toBe('pending');
  });

  it('prioritizes queue by priority then FIFO', () => {
    fm.registerRecipe('r', { outputs: { res: 1 }, time: 1 });
    const low = fm.enqueue({ recipe: 'r', priority: 1 });
    const high = fm.enqueue({ recipe: 'r', priority: 10 });
    const next = fm.peekNext();
    expect(next.id).toBe(high);
  });

  it('progresses batch and creates output jobs on completion', () => {
    const recipe = { inputs: {}, outputs: { resource: 50 }, time: 3 };
    fm.registerRecipe('test', recipe);
    const batchId = fm.enqueue({ recipe: 'test', priority: 1 });

    // tick 1, 2
    fm.tick();
    let batch = fm.peekNext();
    expect(batch.progress).toBe(1);

    fm.tick();
    batch = fm.peekNext();
    expect(batch.progress).toBe(2);

    // tick 3: completion
    const result = fm.tick();
    expect(result.batch.status).toBe('completed');
    expect(result.outputs.length).toBe(1);
    expect(result.outputs[0].data.resource).toBe('resource');
    expect(result.outputs[0].data.amount).toBe(50);

    // batch should be dequeued
    const nextAfter = fm.peekNext();
    expect(nextAfter).toBeNull();
  });

  it('lists all batches in queue', () => {
    fm.registerRecipe('r', { outputs: {}, time: 1 });
    fm.enqueue({ recipe: 'r', priority: 1 });
    fm.enqueue({ recipe: 'r', priority: 2 });
    const batches = fm.listBatches();
    expect(batches.length).toBe(2);
  });

  it('canExecute checks if batch can run', () => {
    fm.registerRecipe('test', { inputs: { energy: 100 }, outputs: {}, time: 1 });
    const id = fm.enqueue({ recipe: 'test', priority: 1 });
    expect(fm.canExecute(id)).toBe(true);
    expect(fm.canExecute('nonexistent')).toBe(false);
  });
});
