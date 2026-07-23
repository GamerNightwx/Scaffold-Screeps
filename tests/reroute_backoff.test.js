import { describe, it, expect, beforeEach } from 'vitest';
import Kernel from '../src/kernel/Kernel.js';
import WorkingMemory from '../src/memory/WorkingMemory.js';
import LinkManager from '../src/logistics/LinkManager.js';
import LinkCoordinator from '../src/logistics/LinkCoordinator.js';
import RerouteCoordinator from '../src/logistics/RerouteCoordinator.js';

describe('RerouteCoordinator backoff and stale cleanup', () => {
  let kernel, wm, rc, lm;
  beforeEach(() => {
    wm = new WorkingMemory();
    kernel = new Kernel({});
    kernel.register('workingMemory', () => wm);
    kernel.register('linkManager', (k) => new LinkManager(k));
    kernel.register('linkCoordinator', (k) => new LinkCoordinator(k));
    kernel.register('rerouteCoordinator', (k) => new RerouteCoordinator(k));
    lm = kernel.get('linkManager');
    rc = kernel.get('rerouteCoordinator');

    lm.registerLinks('W1', [{ id: 'link1' }]);
    lm.registerLinks('W2', [{ id: 'link2' }]);
  });

  it('applies exponential backoff between attempts', () => {
    global.Game = { time: 100 };
    // create scheduled terminal_transfer (source terminal is cooldowned)
    wm.set('terminals', { id: 'termA', data: { room: 'W1', energy: 0, capacity: 2000, cooldown: 10 } });
    wm.set('terminals', { id: 'termB', data: { room: 'W2', energy: 2000, capacity: 2000, cooldown: 0 } });

    const job = { id: 'tb1', data: { type: 'terminal_transfer', from: 'termA', to: 'termB', fromRoom: 'W1', toRoom: 'W2', amount: 500, status: 'scheduled', createdAt: 50, meta: { parentJob: 'p1' } } };
    wm.set('logistics', job);

    // first attempt allowed
    let created = rc.tick();
    expect(wm.get('logistics', 'tb1').data.meta.rerouteAttempts).toBe(1);

    // immediate second tick should not create another because of backoff
    created = rc.tick();
    expect(wm.get('logistics', 'tb1').data.meta.rerouteAttempts).toBe(1);

    // advance time beyond baseWait (default 3) so next attempt allowed
    global.Game.time = 104;
    created = rc.tick();
    expect(wm.get('logistics', 'tb1').data.meta.rerouteAttempts).toBe(2);
  });

  it('marks job stale after max attempts and stale TTL', () => {
    global.Game = { time: 200 };
    // create scheduled job with attempts already at max
    const job = { id: 'st1', data: { type: 'terminal_transfer', from: 'termA', to: 'termB', fromRoom: 'W1', toRoom: 'W2', amount: 500, status: 'scheduled', createdAt: 100, meta: { parentJob: 'p2', rerouteAttempts: 3, lastRerouteAt: 150 } } };
    wm.set('logistics', job);

    // set time past stale TTL (default 20)
    global.Game.time = 200;
    const created = rc.tick();
    const updated = wm.get('logistics', 'st1');
    expect(updated.data.status).toBe('stale');
    expect(updated.data.meta.staleAt).toBeDefined();
  });
});
