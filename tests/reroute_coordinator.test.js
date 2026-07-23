import { describe, it, expect, beforeEach } from 'vitest';
import Kernel from '../src/kernel/Kernel.js';
import WorkingMemory from '../src/memory/WorkingMemory.js';
import LinkManager from '../src/logistics/LinkManager.js';
import LinkCoordinator from '../src/logistics/LinkCoordinator.js';
import RerouteCoordinator from '../src/logistics/RerouteCoordinator.js';

describe('RerouteCoordinator', () => {
  let kernel, wm, lm, lc, rc;
  beforeEach(() => {
    global.Game = { time: 100 };
    wm = new WorkingMemory();
    kernel = new Kernel({});
    kernel.register('workingMemory', () => wm);
    kernel.register('linkManager', (k) => new LinkManager(k));
    kernel.register('linkCoordinator', (k) => new LinkCoordinator(k));
    kernel.register('rerouteCoordinator', (k) => new RerouteCoordinator(k));
    lm = kernel.get('linkManager');
    lc = kernel.get('linkCoordinator');
    rc = kernel.get('rerouteCoordinator');

    // create terminals and links
    wm.set('terminals', { id: 'termA', data: { room: 'W1', energy: 0, capacity: 2000, cooldown: 10 } });
    wm.set('terminals', { id: 'termB', data: { room: 'W2', energy: 2000, capacity: 2000, cooldown: 0 } });
    wm.set('links', { id: 'link1', data: { room: 'W1', energy: 2000, capacity: 2000, cooldown: 0 } });
    wm.set('links', { id: 'link2', data: { room: 'W2', energy: 2000, capacity: 2000, cooldown: 0 } });

    lm.registerLinks('W1', [{ id: 'link1' }]);
    lm.registerLinks('W2', [{ id: 'link2' }]);

  });

  it('creates link fallback when terminal source is cooldowned for too long', () => {
    // create scheduled terminal_transfer that's old
    const job = { id: 'tjob1', data: { type: 'terminal_transfer', from: 'termA', to: 'termB', fromRoom: 'W1', toRoom: 'W2', amount: 500, status: 'scheduled', createdAt: 50, meta: { parentJob: 'parent1' } } };
    wm.set('logistics', job);

    const created = rc.tick();
    // should create fallback link pipeline
    const linkHop = wm.get('logistics', `${job.id}-fallback-link-hop`);
    expect(linkHop).toBeDefined();
    expect(linkHop.data.type).toBe('link_transfer');

    const updated = wm.get('logistics', 'tjob1');
    expect(updated.data.meta.rerouteAttempts).toBeGreaterThanOrEqual(1);
  });

  it('creates terminal fallback when link is offline', () => {
    // create scheduled link_transfer job that is stuck
    const job = { id: 'ljob1', data: { type: 'link_transfer', from: 'link1', to: 'link2', fromRoom: 'W1', toRoom: 'W2', amount: 500, status: 'scheduled', createdAt: 50, meta: { parentJob: 'parent2' } } };
    wm.set('logistics', job);
    // mark link offline in linkManager
    lm.setLinkStatus('link1', 'offline');

    const created = rc.tick();
    const termHop = wm.get('logistics', `${job.id}-fallback-term-hop`);
    expect(termHop).toBeDefined();
    expect(termHop.data.type).toBe('terminal_transfer');

    const updated = wm.get('logistics', 'ljob1');
    expect(updated.data.meta.rerouteAttempts).toBeGreaterThanOrEqual(1);
  });
});
