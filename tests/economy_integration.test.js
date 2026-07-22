import { describe, it, expect, beforeEach } from 'vitest';
import Kernel from '../src/kernel/Kernel.js';
import WorkingMemory from '../src/memory/WorkingMemory.js';
import SpawnManager from '../src/spawn/SpawnManager.js';
import HaulerManager from '../src/economy/HaulerManager.js';
import MiningManager from '../src/economy/MiningManager.js';
import FactoryManager from '../src/economy/FactoryManager.js';
import LabManager from '../src/economy/LabManager.js';
import MarketManager from '../src/economy/MarketManager.js';

describe('Economy Integration', () => {
  let kernel;
  let wm;

  beforeEach(() => {
    global.Game = { time: 100, cpu: { getUsed: () => 5 } };

    // Setup WorkingMemory
    wm = new WorkingMemory();
    
    // Initialize kernel with all economy managers
    kernel = new Kernel({ cpuBudget: 50 });
    kernel.register('workingMemory', () => wm);
    kernel.register('spawnManager', (k) => new SpawnManager(k));
    kernel.register('miningManager', (k) => new MiningManager(k));
    kernel.register('haulerManager', (k) => new HaulerManager(k));
    kernel.register('factoryManager', (k) => new FactoryManager(k));
    kernel.register('labManager', (k) => new LabManager(k));
    kernel.register('marketManager', (k) => new MarketManager(k));
  });

  it('orchestrates mining -> hauling -> factory workflow', () => {
    // Setup: miners, containers, resources
    wm.set('sources', { id: 'src1', data: { energy: 3000, room: 'W1', pos: { x: 10, y: 10 } } });
    wm.set('containers', { id: 'con1', data: { energy: 50000, room: 'W1' } });

    // Get managers
    const mm = kernel.get('miningManager');
    const hm = kernel.get('haulerManager');
    const fm = kernel.get('factoryManager');

    // Mining: tick creates job for full container
    const miningJobs = mm.tick();
    expect(miningJobs.length).toBe(1);
    expect(miningJobs[0].data.sourceId).toBe('src1');

    // Hauler: tick should create transfer job when container full
    const haulingJobs = hm.tick();
    expect(haulingJobs.length).toBe(1);
    expect(haulingJobs[0].data.type).toBe('transfer');

    // Factory: verify it can be queued
    fm.registerRecipe('simple', { inputs: {}, outputs: { energy: 100 }, time: 5 });
    const batchId = fm.enqueue({ recipe: 'simple', priority: 1 });
    expect(batchId).toBeDefined();
  });

  it('coordinates spawn requests with miner blueprints', () => {
    const sm = kernel.get('spawnManager');
    const mm = kernel.get('miningManager');

    // Register miner blueprint
    sm.registerBlueprint('miner', () => ({ body: ['WORK', 'CARRY', 'MOVE'] }));

    // Mining creates job
    wm.set('sources', { id: 'src1', data: { energy: 3000, room: 'W1' } });
    wm.set('containers', { id: 'con1', data: { energy: 50000, room: 'W1' } });
    const jobs = mm.tick();

    // Enqueue spawn request for miner
    const spawnId = sm.enqueue({ blueprint: 'miner', priority: 10, meta: { role: 'harvester' } });
    expect(spawnId).toBeDefined();

    // Peek at spawn request
    const next = sm.peekNext();
    expect(next).not.toBeNull();
    expect(next.blueprint).toBe('miner');
  });

  it('manages factory production with lab boosts', () => {
    const fm = kernel.get('factoryManager');
    const lm = kernel.get('labManager');

    // Register factory recipe
    fm.registerRecipe('OH', { inputs: { O: 100, H: 100 }, outputs: { OH: 100 }, time: 10 });

    // Register lab reaction
    lm.registerReaction('OH_boost', { inputs: { OH: 50 }, output: 'XOH', outputAmount: 50, steps: 20 });

    // Factory produces OH
    const batchId = fm.enqueue({ recipe: 'OH', priority: 5 });
    expect(batchId).toBeDefined();

    // Lab requests boost
    const boostId = lm.requestBoost('FATIGUE', 1000, 'lab1');
    expect(boostId).toBeDefined();
    expect(lm.boosts[boostId].status).toBe('pending');

    // Fulfill boost
    lm.fulfillBoost(boostId);
    expect(lm.boosts[boostId].status).toBe('fulfilled');
  });

  it('tracks market orders and prices', () => {
    const mm = kernel.get('marketManager');

    // Record price observations
    mm.recordPrice('energy', 0.5, 100);
    mm.recordPrice('energy', 0.55, 80);
    mm.recordPrice('energy', 0.6, 90);

    // Check average price
    const avg = mm.getAveragePrice('energy');
    expect(avg).toBeGreaterThan(0.5);
    expect(avg).toBeLessThan(0.6);

    // Create buy order
    const buyId = mm.createBuyOrder('energy', 1000, 0.5, 'W1');
    expect(buyId).toBeDefined();

    // Detect arbitrage
    const arb = mm.detectArbitrage('energy', 0.5, 0.7);
    expect(arb).not.toBeNull();
    expect(arb.profitRatio).toBeGreaterThan(0.1);
  });

  it('persists all manager state to WorkingMemory', () => {
    const sm = kernel.get('spawnManager');
    const mm = kernel.get('miningManager');
    const hm = kernel.get('haulerManager');

    // Create jobs
    sm.registerBlueprint('miner', () => ({ body: ['WORK'] }));
    const spawnId = sm.enqueue({ blueprint: 'miner', priority: 1 });

    wm.set('sources', { id: 'src1', data: { energy: 3000, room: 'W1' } });
    wm.set('containers', { id: 'con1', data: { energy: 50000, room: 'W1' } });
    mm.tick();

    // Verify WM persistence
    const spawnPersisted = wm.get('spawns', spawnId);
    const miningPersisted = wm.list('mining');
    expect(spawnPersisted || miningPersisted.length).toBeTruthy();
  });

  it('handles full Kernel tick with economy managers', () => {
    // Register minimal subsystems
    kernel.register('worldModel', () => ({ snapshot: () => {} }));
    kernel.register('spatialEngine', () => ({
      recordTraffic: () => {},
      getTraffic: () => 0
    }));
    kernel.register('blackboard', () => ({
      emitAlert: () => {},
      clear: () => {}
    }));
    kernel.register('decisionEngine', () => ({ tick: () => {} }));
    kernel.register('taskFactory', () => ({ tick: () => {} }));
    kernel.register('taskEngine', () => ({ tick: () => {} }));
    kernel.register('scheduler', () => ({ tick: () => {} }));
    kernel.register('agentRuntime', () => ({ tick: () => {} }));
    kernel.register('commandEngine', () => ({ tick: () => {} }));

    // Setup economy data
    const fm = kernel.get('factoryManager');
    fm.registerRecipe('test', { inputs: {}, outputs: { res: 10 }, time: 5 });
    fm.enqueue({ recipe: 'test', priority: 1 });

    // Execute full tick
    const result = kernel.tick();
    expect(result.success).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});
