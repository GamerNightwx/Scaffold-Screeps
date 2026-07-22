import { describe, it, expect, beforeEach } from 'vitest';
import LinkManager from '../src/logistics/LinkManager.js';

describe('LinkManager', () => {
  let lm;
  let kernel;

  beforeEach(() => {
    kernel = { has: (_n) => false };
    lm = new LinkManager(kernel);
  });

  it('registers links in room', () => {
    const links = [
      { id: 'link1', pos: { x: 10, y: 10 } },
      { id: 'link2', pos: { x: 20, y: 20 } }
    ];
    lm.registerLinks('W1', links);
    expect(lm.links['W1'].length).toBe(2);
    expect(lm.status['link1'].status).toBe('online');
    expect(lm.capacity['link1']).toBe(800);
  });

  it('chooses carry for same room', () => {
    lm.registerLinks('W1', [{ id: 'link1', pos: { x: 10, y: 10 } }]);
    const route = lm.chooseRoute('W1', 'W1', { x: 5, y: 5 }, { x: 15, y: 15 });
    expect(route.useLink).toBe(false);
    expect(route.reason).toBe('same_room');
  });

  it('chooses carry when no links available', () => {
    const route = lm.chooseRoute('W1', 'W2');
    expect(route.useLink).toBe(false);
    expect(route.reason).toBe('no_links');
  });

  it('prefers link for cross-room long distance', () => {
    lm.registerLinks('W1', [{ id: 'link1', pos: { x: 10, y: 10 } }]);
    lm.registerLinks('W2', [{ id: 'link2', pos: { x: 10, y: 10 } }]);
    const route = lm.chooseRoute('W1', 'W2', { x: 0, y: 0 }, { x: 0, y: 0 });
    expect(route.useLink).toBe(true);
    expect(route.reason).toBe('distance_efficient');
  });

  it('registers link chain', () => {
    lm.registerChain('chain1', ['link1', 'link2'], { x: 5, y: 5 }, { x: 45, y: 45 });
    const chain = lm.chains['chain1'];
    expect(chain.links).toContain('link1');
    expect(chain.input).toEqual({ x: 5, y: 5 });
  });

  it('sets and tracks link status', () => {
    lm.registerLinks('W1', [{ id: 'link1' }]);
    lm.setLinkStatus('link1', 'offline', 'maintenance');
    expect(lm.status['link1'].status).toBe('offline');
    expect(lm.status['link1'].statusReason).toBe('maintenance');
  });

  it('detects congestion and marks link clogged', () => {
    lm.registerLinks('W1', [{ id: 'link1' }]);
    const highTransfer = 800 * 0.9; // 90% utilization
    lm.recordTransfer('link1', highTransfer);
    expect(lm.status['link1'].status).toBe('clogged');
    expect(lm.status['link1'].lastTransfer).toBe(highTransfer);
  });

  it('recovers clogged link after cooldown', () => {
    lm.registerLinks('W1', [{ id: 'link1' }]);
    lm.setLinkStatus('link1', 'clogged');
    // Mark old transfer
    lm.status['link1'].lastTransferAt = lm._nowTick() - 15;
    lm.tick();
    expect(lm.status['link1'].status).toBe('online');
  });

  it('calculates route efficiency (online links)', () => {
    lm.registerLinks('W1', [{ id: 'link1' }]);
    lm.registerLinks('W2', [{ id: 'link2' }]);
    const eff = lm.getRouteEfficiency('W1', 'W2');
    expect(eff).toBeGreaterThan(0.9);
  });

  it('reduces efficiency when link is clogged', () => {
    lm.registerLinks('W1', [{ id: 'link1' }]);
    lm.registerLinks('W2', [{ id: 'link2' }]);
    lm.recordTransfer('link1', 800 * 0.9); // mark clogged
    const eff = lm.getRouteEfficiency('W1', 'W2');
    expect(eff).toBeLessThan(0.9);
  });

  it('provides fallback route when primary link offline', () => {
    lm.registerLinks('W1', [{ id: 'link1' }]);
    lm.registerLinks('W2', [{ id: 'link2' }]);
    lm.setLinkStatus('link1', 'offline');
    const fallback = lm.getFallbackRoute('W1', 'W2');
    expect(fallback.useLink).toBe(false);
    expect(fallback.fallback).toBe(true);
  });

  it('caches routes', () => {
    lm.registerLinks('W1', [{ id: 'link1' }]);
    lm.registerLinks('W2', [{ id: 'link2' }]);
    const route1 = lm.chooseRoute('W1', 'W2');
    const route2 = lm.chooseRoute('W1', 'W2');
    expect(route1).toBe(route2); // same object reference (cached)
  });

  it('returns link statistics', () => {
    lm.registerLinks('W1', [{ id: 'link1' }, { id: 'link2' }]);
    lm.setLinkStatus('link2', 'offline');
    const stats = lm.getLinkStats();
    expect(stats.total).toBe(2);
    expect(stats.online).toBe(1);
    expect(stats.offline).toBe(1);
    expect(stats.healthPercent).toBe(50);
  });

  it('lists all links with status', () => {
    lm.registerLinks('W1', [{ id: 'link1', pos: { x: 10, y: 10 } }]);
    lm.registerLinks('W2', [{ id: 'link2', pos: { x: 20, y: 20 } }]);
    const allLinks = lm.listLinks();
    expect(allLinks.length).toBe(2);
    expect(allLinks[0].roomName).toBe('W1');
    expect(allLinks[1].roomName).toBe('W2');
  });

  it('clears route cache', () => {
    lm.registerLinks('W1', [{ id: 'link1' }]);
    lm.registerLinks('W2', [{ id: 'link2' }]);
    lm.chooseRoute('W1', 'W2');
    expect(Object.keys(lm.routeCache).length).toBeGreaterThan(0);
    lm.clearRouteCache();
    expect(Object.keys(lm.routeCache).length).toBe(0);
  });
});
