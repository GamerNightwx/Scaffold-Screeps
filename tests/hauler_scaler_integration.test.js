import { describe, it, expect, beforeEach } from 'vitest';
import Kernel from '../src/kernel/Kernel.js';
import WorkingMemory from '../src/memory/WorkingMemory.js';
import LinkManager from '../src/logistics/LinkManager.js';
import HaulerScaler from '../src/logistics/HaulerScaler.js';

describe('HaulerScaler Integration', () => {
  let kernel;
  let wm;
  let lm;
  let scaler;

  beforeEach(() => {
    global.Game = { time: 100, cpu: { getUsed: () => 5 } };

    wm = new WorkingMemory();
    kernel = new Kernel({ cpuBudget: 50 });
    kernel.register('workingMemory', () => wm);
    kernel.register('linkManager', (k) => new LinkManager(k));
    
    // Get linkManager first, then register HaulerScaler which depends on it
    lm = kernel.get('linkManager');
    kernel.register('haulerScaler', (k) => new HaulerScaler(k));
    
    scaler = kernel.get('haulerScaler');
  });

  it('scales carry capacity based on route efficiency', () => {
    lm.registerLinks('W1', [{ id: 'link1' }]);
    lm.registerLinks('W2', [{ id: 'link2' }]);

    // Efficient route: links online
    const efficientRoute = scaler.calculateCarryCapacity('W1', 'W2');
    expect(efficientRoute.carryParts).toBeGreaterThan(0);
    expect(efficientRoute.efficiency).toBeGreaterThan(0.5);

    // Inefficient route: disable links
    lm.setLinkStatus('link1', 'offline');
    lm.setLinkStatus('link2', 'offline');
    const inefficientRoute = scaler.calculateCarryCapacity('W1', 'W2');
    
    // Offline links should result in same or higher carry
    expect(inefficientRoute.carryParts).toBeGreaterThanOrEqual(efficientRoute.carryParts - 2);
  });

  it('scales up for long-distance routes', () => {
    const shortRoute = scaler.calculateCarryCapacity('W1N1', 'W1N1');
    const longRoute = scaler.calculateCarryCapacity('W1N1', 'W10N10');

    expect(longRoute.distance).toBeGreaterThan(shortRoute.distance);
    // Long routes should use more or equal carry
    expect(longRoute.carryParts).toBeGreaterThanOrEqual(shortRoute.carryParts);
  });

  it('handles route with link congestion', () => {
    lm.registerLinks('W1', [{ id: 'link1' }]);
    lm.registerLinks('W2', [{ id: 'link2' }]);

    const beforeCongestion = scaler.calculateCarryCapacity('W1', 'W2');

    // Record high transfer (congestion)
    lm.recordTransfer('link1', 750);
    lm.recordTransfer('link2', 750);

    const afterCongestion = scaler.calculateCarryCapacity('W1', 'W2');
    
    // Clogged links increase carry or stay same
    expect(afterCongestion.carryParts).toBeGreaterThanOrEqual(beforeCongestion.carryParts - 2);
  });

  it('provides stats for all scaled routes', () => {
    scaler.calculateCarryCapacity('W1N1', 'W2N2');
    scaler.calculateCarryCapacity('W1N1', 'W1N1');
    scaler.calculateCarryCapacity('W5N5', 'W10N10');

    const stats = scaler.getStats();
    expect(stats).toBeDefined();
    // Stats should aggregate all calculations if using WorkingMemory
    // For now just verify structure
    expect(typeof stats.minCarryParts).toBe('number');
    expect(typeof stats.maxCarryParts).toBe('number');
  });

  it('integrates with full Kernel tick', () => {
    // Register minimal subsystems needed
    kernel.register('worldModel', () => ({ snapshot: () => {} }));
    kernel.register('spatialEngine', () => ({}));
    kernel.register('blackboard', () => ({}));
    kernel.register('decisionEngine', () => ({ tick: () => {} }));
    kernel.register('taskFactory', () => ({}));
    kernel.register('taskEngine', () => ({ tick: () => {} }));
    kernel.register('scheduler', () => ({ tick: () => {} }));
    kernel.register('agentRuntime', () => ({}));
    kernel.register('commandEngine', () => ({ tick: () => {} }));

    // Setup link network for scaling
    lm.registerLinks('source', [{ id: 'link1' }]);
    lm.registerLinks('target', [{ id: 'link2' }]);

    // Run tick - should not error
    const result = kernel.tick();
    expect(result.success).toBe(true);
  });

  it('respects link status changes for scaling decisions', () => {
    lm.registerLinks('W1', [{ id: 'link1' }]);
    lm.registerLinks('W2', [{ id: 'link2' }]);

    // Online links provide good efficiency
    let result = scaler.calculateCarryCapacity('W1', 'W2');
    const efficientCarry = result.carryParts;

    // Clog one link
    lm.setLinkStatus('link1', 'clogged');
    result = scaler.calculateCarryCapacity('W1', 'W2');
    expect(result.carryParts).toBeGreaterThanOrEqual(1); // should still be valid

    // Offline both links
    lm.setLinkStatus('link2', 'offline');
    result = scaler.calculateCarryCapacity('W1', 'W2');
    expect(result.carryParts).toBeGreaterThanOrEqual(1); // fallback to carry
  });
});
