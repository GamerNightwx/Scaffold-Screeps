import { describe, it, expect, beforeEach } from 'vitest';
import DecisionEngine from '../src/decision/DecisionEngine.js';

describe('DecisionEngine', () => {
  let engine;
  let kernel;
  let wm;

  beforeEach(() => {
    // minimal kernel mock with workingMemory
    wm = {
      _data: { goals: {} },
      list: (collection) => Object.values(wm._data[collection] || {}),
      set: (collection, obj) => { if (!wm._data[collection]) wm._data[collection] = {}; wm._data[collection][obj.id] = obj; },
    };
    kernel = {
      has: (name) => name === 'workingMemory',
      get: (name) => name === 'workingMemory' ? wm : null,
    };
    engine = new DecisionEngine(kernel);
  });

  it('registers and uses scorers', () => {
    engine.registerScorer('priority', (goal) => goal.data.priority || 0);
    engine.registerScorer('distancePenalty', (goal, ctx) => {
      // mock distance: smaller data.dist -> higher score
      return (100 - (goal.data.dist || 100)) / 100;
    });

    wm._data.goals = {
      g1: { id: 'g1', data: { priority: 10, dist: 50 } },
      g2: { id: 'g2', data: { priority: 5, dist: 10 } },
    };

    const res = engine.evaluate(wm.list('goals'), {});
    expect(res[0].goal.id).toBe('g1');
    expect(res[1].goal.id).toBe('g2');
  });

  it('stores prioritized list in working memory on tick', () => {
    engine.registerScorer('priority', (g) => g.data.priority || 0);
    wm._data.goals = {
      g1: { id: 'g1', data: { priority: 1 } },
      g2: { id: 'g2', data: { priority: 9 } },
    };

    global.Game = { time: 500 };
    engine.tick();

    const stored = wm._data.goal_priorities;
    expect(stored).toBeTruthy();
    const found = Object.values(stored)[0];
    expect(found.data[0].id).toBe('g2');
  });

  it('handles no goals gracefully', () => {
    wm._data.goals = {};
    engine.tick(); // should not throw
  });
});
