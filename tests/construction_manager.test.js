import { describe, it, expect, beforeEach } from 'vitest';
import Kernel from '../src/kernel/Kernel.js';
import WorkingMemory from '../src/memory/WorkingMemory.js';
import ConstructionManager from '../src/ConstructionManager.js';

describe('ConstructionManager', () => {
  let kernel, wm, cm;
  beforeEach(() => {
    global.Game = { time: 200 };
    wm = new WorkingMemory();
    kernel = new Kernel({});
    kernel.register('workingMemory', () => wm);
    kernel.register('constructionManager', (k) => new ConstructionManager(k));
    cm = kernel.get('constructionManager');
  });

  it('creates construction sites up to maxPerTick and is idempotent', () => {
    // create 5 plans
    for (let i=0;i<5;i++) {
      const p = { id: `plan${i}`, data: { room: 'R1', x: i+1, y: i+2, type: 'rampart' } };
      wm.set('constructionPlans', p);
    }

    // default maxPerTick is 2
    const created = cm.tick();
    expect(created.length).toBeGreaterThan(0);
    expect(created.length).toBeLessThanOrEqual(2);

    // subsequent tick should create more up to limit
    const created2 = cm.tick();
    expect(created2.length).toBeLessThanOrEqual(2);

    // ensure no duplicate sites for same plan
    const allSites = wm.list('constructionSites');
    const ids = allSites.map(s => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
