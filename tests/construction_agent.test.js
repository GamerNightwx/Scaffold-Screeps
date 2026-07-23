import { describe, it, expect, beforeEach } from 'vitest';
import Kernel from '../src/kernel/Kernel.js';
import WorkingMemory from '../src/memory/WorkingMemory.js';
import ConstructionAgent from '../src/ConstructionAgent.js';

describe('ConstructionAgent', () => {
  let kernel, wm, ca;
  beforeEach(() => {
    global.Game = { time: 500 };
    wm = new WorkingMemory();
    kernel = new Kernel({});
    kernel.register('workingMemory', () => wm);
    kernel.register('constructionAgent', (k) => new ConstructionAgent(k));
    ca = kernel.get('constructionAgent');
  });

  it('creates build tasks for created construction sites and is idempotent', () => {
    const s = { id: 'siteY', data: { planId: 'planY', position: { roomName: 'R4', x: 5, y: 5 }, type: 'rampart', status: 'created' } };
    wm.set('constructionSites', s);

    const created = ca.tick();
    expect(created.length).toBe(1);
    const tasks = wm.list('tasks');
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    const t = tasks.find(tsk => tsk.data && tsk.data.meta && tsk.data.meta.siteId === 'siteY');
    expect(t).toBeDefined();

    // second tick should not create duplicate
    const created2 = ca.tick();
    expect(created2.length).toBe(0);
  });
});
