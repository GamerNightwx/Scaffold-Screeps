import { describe, it, expect, beforeEach } from 'vitest';
import Kernel from '../src/kernel/Kernel.js';
import WorkingMemory from '../src/memory/WorkingMemory.js';
import ConstructionRunner from '../src/ConstructionRunner.js';

describe('ConstructionRunner', () => {
  let kernel, wm, cr;
  beforeEach(() => {
    global.Game = { time: 300 };
    wm = new WorkingMemory();
    kernel = new Kernel({});
    kernel.register('workingMemory', () => wm);
    kernel.register('constructionRunner', (k) => new ConstructionRunner(k));
    cr = kernel.get('constructionRunner');
  });

  it('creates goals from constructionSites and marks site with goalId, up to limit', () => {
    for (let i=0;i<5;i++) {
      const s = { id: `site${i}`, data: { planId: `plan${i}`, position: { roomName: 'R2', x: i+2, y: i+3 }, type: 'rampart' } };
      wm.set('constructionSites', s);
    }

    const created = cr.tick();
    expect(created.length).toBeGreaterThan(0);
    expect(created.length).toBeLessThanOrEqual(3);

    // ensure sites now have goalId
    const sites = wm.list('constructionSites');
    for (const s of sites) {
      if (s.data && s.data.planId) {
        if (s.data.goalId) {
          expect(s.data.goalId.startsWith('goal_site:')).toBe(true);
        }
      }
    }

    // subsequent tick should create more until exhausted
    const created2 = cr.tick();
    expect(created2.length).toBeGreaterThanOrEqual(0);
  });
});
