import { describe, it, expect } from 'vitest';
import * as C from '../src/contracts/Contracts.js';

describe('DecisionEngine contract shape', () => {
  it('DecisionEngineInterface declares learning and weight APIs', () => {
    const iface = C.DecisionEngineInterface;
    expect(typeof iface).toBe('function');
    const methods = Object.getOwnPropertyNames(iface.prototype).filter(m => m !== 'constructor');
    const expected = ['registerScorer','unregisterScorer','evaluate','tick','observeOutcome','updateWeights','exportWeights','importWeights','getWeights','getMetrics'];
    for (const m of expected) {
      expect(methods.includes(m)).toBe(true);
    }
  });
});