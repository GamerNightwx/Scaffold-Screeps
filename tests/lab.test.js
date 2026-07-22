import { describe, it, expect, beforeEach } from 'vitest';
import LabManager from '../src/economy/LabManager.js';

describe('LabManager', () => {
  let wm;
  let lm;
  let kernel;

  beforeEach(() => {
    wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
    kernel = { has: (n) => n === 'workingMemory', get: (n) => n === 'workingMemory' ? wm : null };
    lm = new LabManager(kernel);
  });

  it('registers lab clusters', () => {
    const cluster = { input1: 'lab1', input2: 'lab2', output: 'lab3', boosts: [] };
    lm.registerCluster('W1', cluster);
    expect(lm.labClusters['W1']).toEqual(cluster);
  });

  it('registers reactions and retrieves them', () => {
    const reaction = {
      inputs: { O: 100, H: 100 },
      output: 'OH',
      outputAmount: 100,
      steps: 10
    };
    lm.registerReaction('OH_synthesis', reaction);
    expect(lm.reactions['OH_synthesis']).toEqual(reaction);
  });

  it('enqueues reaction job and persists to WM', () => {
    lm.registerReaction('test', { inputs: {}, output: 'res', outputAmount: 50, steps: 5 });
    const id = lm.enqueue({ reaction: 'test', priority: 3 });
    expect(id).toBeDefined();
    const persisted = wm.get('lab_reactions', id);
    expect(persisted).not.toBeNull();
    expect(persisted.data.status).toBe('pending');
  });

  it('progresses reaction and creates output on completion', () => {
    lm.registerReaction('test', { inputs: {}, output: 'boost', outputAmount: 30, steps: 3 });
    const reactionId = lm.enqueue({ reaction: 'test', priority: 1 });

    // Tick through progression
    lm.tick(); // progress = 1
    let current = lm.peekNext();
    expect(current.progress).toBe(1);

    lm.tick(); // progress = 2
    current = lm.peekNext();
    expect(current.progress).toBe(2);

    // Final tick: completion
    const result = lm.tick();
    expect(result.reaction.status).toBe('completed');
    expect(result.output).not.toBeNull();
    expect(result.output.data.resource).toBe('boost');
    expect(result.output.data.amount).toBe(30);

    // should be dequeued
    expect(lm.peekNext()).toBeNull();
  });

  it('requests and fulfills boosts', () => {
    const boostId = lm.requestBoost('FATIGUE', 1000, 'targetLab1');
    expect(boostId).toBeDefined();
    const boost = lm.boosts[boostId];
    expect(boost.resource).toBe('FATIGUE');
    expect(boost.amount).toBe(1000);
    expect(boost.status).toBe('pending');

    // Fulfill it
    const fulfilled = lm.fulfillBoost(boostId);
    expect(fulfilled).toBe(true);
    expect(lm.boosts[boostId].status).toBe('fulfilled');

    // Persisted in WM
    const persisted = wm.get('lab_boosts', boostId);
    expect(persisted).not.toBeNull();
    expect(persisted.data.status).toBe('fulfilled');
  });

  it('lists pending boosts only', () => {
    const b1 = lm.requestBoost('RES1', 100);
    const b2 = lm.requestBoost('RES2', 200);
    lm.fulfillBoost(b1);

    const pending = lm.listPendingBoosts();
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe(b2);
  });

  it('manages lab cooldowns', () => {
    lm.setCooldown('lab1', 10);
    expect(lm.cooldowns['lab1']).toBe(10);

    lm.tickCooldowns();
    expect(lm.cooldowns['lab1']).toBe(9);

    // Tick to zero and expiry
    for (let i = 0; i < 9; i++) lm.tickCooldowns();
    expect(lm.cooldowns['lab1']).toBeUndefined();
  });
});
