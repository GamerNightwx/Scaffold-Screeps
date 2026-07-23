import { describe, it, expect, beforeEach } from 'vitest';
import Kernel from '../src/kernel/Kernel.js';
import WorkingMemory from '../src/memory/WorkingMemory.js';
import LinkManager from '../src/logistics/LinkManager.js';
import LinkCoordinator from '../src/logistics/LinkCoordinator.js';

describe('LinkCoordinator', () => {
  let kernel, wm, lm, lc;
  beforeEach(() => {
    global.Game = { time: 100 };
    wm = new WorkingMemory();
    kernel = new Kernel({});
    kernel.register('workingMemory', () => wm);
    kernel.register('linkManager', (k) => new LinkManager(k));
    kernel.register('linkCoordinator', (k) => new LinkCoordinator(k));
    lm = kernel.get('linkManager');
    lc = kernel.get('linkCoordinator');

    // register links in WM and LinkManager
    const link1 = { id: 'link1', data: { room: 'W1', energy: 2000, capacity: 2000, cooldown: 0 } };
    const link2 = { id: 'link2', data: { room: 'W2', energy: 2000, capacity: 2000, cooldown: 0 } };
    wm.set('links', link1);
    wm.set('links', link2);
    lm.registerLinks('W1', [{ id: 'link1' }]);
    lm.registerLinks('W2', [{ id: 'link2' }]);
  });

  it('batches pending link_transfer jobs by source link', () => {
    // create pending link_transfer logistics jobs
    const j1 = { id: 'job1', data: { type: 'link_transfer', from: 'link1', to: 'link2', amount: 500, status: 'pending', createdAt: 10 } };
    const j2 = { id: 'job2', data: { type: 'link_transfer', from: 'link1', to: 'link2', amount: 800, status: 'pending', createdAt: 20 } };
    wm.set('logistics', j1); wm.set('logistics', j2);

    const tasks = lc.tick();
    expect(tasks.length).toBe(1);
    const task = tasks[0];
    expect(task.data.type).toBe('link_transfer');
    expect(task.data.meta.from).toBe('link1');
    expect(task.data.meta.amount).toBeGreaterThanOrEqual(1300);

    // constituent jobs should be marked scheduled
    const c1 = wm.get('logistics', 'job1');
    const c2 = wm.get('logistics', 'job2');
    expect(c1.data.status).toBe('scheduled');
    expect(c2.data.status).toBe('scheduled');
    expect(c1.data.meta.scheduledTask).toBe(task.id);
    expect(c2.data.meta.scheduledTask).toBe(task.id);
  });

  it('respects cooldown and energy caps', () => {
    // mark link1 cooldown so batching skips
    const link1 = wm.get('links', 'link1'); link1.data.cooldown = 2; wm.set('links', link1);
    const j1 = { id: 'job3', data: { type: 'link_transfer', from: 'link1', to: 'link2', amount: 500, status: 'pending', createdAt: 10 } };
    wm.set('logistics', j1);
    const tasks = lc.tick();
    expect(tasks.length).toBe(0);
  });
});
