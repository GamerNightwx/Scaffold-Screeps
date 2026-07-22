import { describe, it, expect, beforeEach } from 'vitest';
import Kernel from '../src/kernel/Kernel.js';
import WorkingMemory from '../src/memory/WorkingMemory.js';
import StorageManager from '../src/logistics/StorageManager.js';
import LinkManager from '../src/logistics/LinkManager.js';
import HaulerManager from '../src/economy/HaulerManager.js';

describe('Logistics Integration', () => {
  let kernel;
  let wm;
  let sm;
  let lm;
  let hm;

  beforeEach(() => {
    global.Game = { time: 100, cpu: { getUsed: () => 5 } };

    // Setup WorkingMemory and managers
    wm = new WorkingMemory();
    kernel = new Kernel({ cpuBudget: 50 });
    kernel.register('workingMemory', () => wm);
    kernel.register('storageManager', (k) => new StorageManager(k));
    kernel.register('linkManager', (k) => new LinkManager(k));
    kernel.register('haulerManager', (k) => new HaulerManager(k));

    sm = kernel.get('storageManager');
    lm = kernel.get('linkManager');
    hm = kernel.get('haulerManager');
  });

  it('coordinates storage networks across rooms', () => {
    sm.registerNetwork('W1', 'storage1', 'terminal1', ['link1']);
    sm.registerNetwork('W2', 'storage2', 'terminal2', ['link2']);

    sm.updateStock('W1', 'energy', 50000);
    sm.updateStock('W2', 'energy', 100000);

    expect(sm.getStock('W1', 'energy')).toBe(50000);
    expect(sm.getStock('W2', 'energy')).toBe(100000);

    const networks = sm.listNetworks();
    expect(networks.length).toBe(2);
  });

  it('creates refill jobs when storage below threshold', () => {
    sm.registerNetwork('W1', 'storage1');
    sm.registerNetwork('W2', 'storage2');

    sm.setRefillTarget('energy', 75000);
    sm.updateStock('W1', 'energy', 20000); // below threshold
    sm.updateStock('W2', 'energy', 200000); // excess

    const jobs = sm.tick();
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0].data.type).toBe('refill');
    expect(jobs[0].data.from).toBe('W2');
    expect(jobs[0].data.to).toBe('W1');
  });

  it('integrates link routing with storage decisions', () => {
    // Setup storage networks with links
    sm.registerNetwork('W1', 'storage1', 'terminal1', ['link1']);
    sm.registerNetwork('W2', 'storage2', 'terminal2', ['link2']);

    lm.registerLinks('W1', [{ id: 'link1', pos: { x: 10, y: 10 } }]);
    lm.registerLinks('W2', [{ id: 'link2', pos: { x: 20, y: 20 } }]);

    // Request cross-room transfer
    const route = lm.chooseRoute('W1', 'W2');
    expect(route.useLink).toBe(true); // prefer link for cross-room
    expect(route.reason).toBe('distance_efficient');

    // Find best storage for resource (W2 should have more available despite higher stock)
    sm.updateStock('W1', 'energy', 50000);
    sm.updateStock('W2', 'energy', 100000);
    const best = sm.findBestStorageForResource('energy', 'source', ['W1', 'W2']);
    expect(best).toBe('W1'); // W1 has more available capacity (250k vs 200k)
  });

  it('handles link congestion affecting route efficiency', () => {
    sm.registerNetwork('W1', 'storage1');
    sm.registerNetwork('W2', 'storage2');

    lm.registerLinks('W1', [{ id: 'link1' }]);
    lm.registerLinks('W2', [{ id: 'link2' }]);

    // Initial efficiency when no transfers
    const effBefore = lm.getRouteEfficiency('W1', 'W2');
    expect(effBefore).toBeGreaterThanOrEqual(0.5);

    // Record high-volume transfer (congestion on both links)
    lm.recordTransfer('link1', 800 * 0.9); // 90% utilization
    lm.recordTransfer('link2', 800 * 0.9); // also congested
    const effAfter = lm.getRouteEfficiency('W1', 'W2');
    // Efficiency should be lower after congestion
    expect(effAfter).toBeLessThanOrEqual(effBefore);
  });

  it('creates reservations for hauling jobs', () => {
    sm.registerNetwork('W1', 'storage1');
    const rsvId = sm.reserve('energy', 1000, 'W1', 'hauling');
    expect(rsvId).toBeDefined();
    const rsv = sm.reservations[rsvId];
    expect(rsv.status).toBe('reserved');

    // Verify capacity accounting
    const available = sm.getAvailableCapacity('W1', 'energy');
    expect(available).toBe(300000 - 1000); // maxCap - reserved

    // Fulfill reservation
    sm.fulfillReservation(rsvId);
    expect(sm.reservations[rsvId].status).toBe('fulfilled');
  });

  it('coordinates link fallback with storage routing', () => {
    sm.registerNetwork('W1', 'storage1');
    sm.registerNetwork('W2', 'storage2');

    lm.registerLinks('W1', [{ id: 'link1' }]);
    lm.registerLinks('W2', [{ id: 'link2' }]);

    // Primary route prefers link
    const primary = lm.chooseRoute('W1', 'W2');
    expect(primary.useLink).toBe(true);

    // Simulate link failure
    lm.setLinkStatus('link1', 'offline');

    // Fallback route
    const fallback = lm.getFallbackRoute('W1', 'W2');
    expect(fallback.useLink).toBe(false);
    expect(fallback.fallback).toBe(true);
  });

  it('tracks link health and generates stats', () => {
    lm.registerLinks('W1', [
      { id: 'link1', pos: { x: 10, y: 10 } },
      { id: 'link2', pos: { x: 20, y: 20 } }
    ]);
    lm.registerLinks('W2', [
      { id: 'link3', pos: { x: 30, y: 30 } }
    ]);

    lm.setLinkStatus('link2', 'offline');
    lm.setLinkStatus('link3', 'clogged');

    const stats = lm.getLinkStats();
    expect(stats.total).toBe(3);
    expect(stats.online).toBe(1);
    expect(stats.offline).toBe(1);
    expect(stats.clogged).toBe(1);
    expect(stats.healthPercent).toBeCloseTo(33.333, 2);
  });

  it('handles multi-step logistics workflow', () => {
    // Setup 3-room supply chain
    sm.registerNetwork('Harvest', 'storage_h', 'term_h', ['link_h']);
    sm.registerNetwork('Process', 'storage_p', 'term_p', ['link_p']);
    sm.registerNetwork('Store', 'storage_s', 'term_s', ['link_s']);

    lm.registerLinks('Harvest', [{ id: 'link_h' }]);
    lm.registerLinks('Process', [{ id: 'link_p' }]);
    lm.registerLinks('Store', [{ id: 'link_s' }]);

    // Stock progression
    sm.updateStock('Harvest', 'energy', 200000); // excess
    sm.updateStock('Process', 'energy', 30000); // below target
    sm.updateStock('Store', 'energy', 100000);

    sm.setRefillTarget('energy', 100000);

    // Step 1: Harvest → Process
    const route1 = lm.chooseRoute('Harvest', 'Process');
    expect(route1.useLink).toBe(true);

    // Step 2: Check refill need for Process
    expect(sm.needsRefill('Process', 'energy')).toBe(true);

    // Step 3: Create refill job from Harvest to Process
    const refillJobs = sm.tick();
    expect(refillJobs.length).toBeGreaterThan(0);
    expect(refillJobs[0].data.from).toBe('Harvest');
    expect(refillJobs[0].data.to).toBe('Process');
  });

  it('handles full Kernel tick with logistics managers', () => {
    // Register minimal subsystems
    kernel.register('worldModel', () => ({ snapshot: () => {} }));
    kernel.register('spatialEngine', () => ({ tick: () => {} }));
    kernel.register('blackboard', () => ({ emitAlert: () => {}, clear: () => {} }));
    kernel.register('decisionEngine', () => ({ tick: () => {} }));
    kernel.register('taskFactory', () => ({ tick: () => {} }));
    kernel.register('taskEngine', () => ({ tick: () => {} }));
    kernel.register('scheduler', () => ({ tick: () => {} }));
    kernel.register('agentRuntime', () => ({ tick: () => {} }));
    kernel.register('commandEngine', () => ({ tick: () => {} }));
    kernel.register('spawnManager', () => ({ tick: () => {} }));
    kernel.register('miningManager', () => ({ tick: () => {} }));
    kernel.register('factoryManager', () => ({ tick: () => {} }));
    kernel.register('labManager', () => ({ tick: () => {} }));
    kernel.register('marketManager', () => ({ tick: () => {} }));

    // Setup logistics state
    sm.registerNetwork('W1', 'storage1', 'terminal1');
    lm.registerLinks('W1', [{ id: 'link1' }]);

    // Execute full tick
    const result = kernel.tick();
    expect(result.success).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});
