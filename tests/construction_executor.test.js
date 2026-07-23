import { describe, it, expect, beforeEach } from 'vitest';
import Kernel from '../src/kernel/Kernel.js';
import WorkingMemory from '../src/memory/WorkingMemory.js';
import ConstructionExecutor from '../src/ConstructionExecutor.js';

describe('ConstructionExecutor', () => {
  let kernel, wm, ce;
  beforeEach(() => {
    global.Game = { time: 400 };
    wm = new WorkingMemory();
    kernel = new Kernel({});
    kernel.register('workingMemory', () => wm);
    kernel.register('constructionExecutor', (k) => new ConstructionExecutor(k));
    ce = kernel.get('constructionExecutor');
  });

  it('marks planned constructionSites as created and records worldConstructionSites', () => {
    const s = { id: 'siteX', data: { planId: 'planX', position: { roomName: 'R3', x: 10, y: 11 }, type: 'rampart', status: 'planned' } };
    wm.set('constructionSites', s);

    const created = ce.tick();
    expect(created.length).toBe(1);
    const site = wm.get('constructionSites', 'siteX');
    expect(site.data.status).toBe('created');
    const world = wm.get('worldConstructionSites', 'world:siteX');
    expect(world).toBeDefined();
    expect(world.data.room).toBe('R3');
  });
});
