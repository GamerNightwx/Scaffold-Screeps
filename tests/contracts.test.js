import { describe, it, expect } from 'vitest';
import * as C from '../src/contracts/Contracts.js';

describe('Contracts shape', () => {
  it('exports expected contract classes', () => {
    const expected = ['KernelInterface','WorldModelInterface','SpatialEngineInterface','BlackboardInterface','WorkingMemoryInterface','DecisionEngineInterface','TaskFactoryInterface','TaskEngineInterface','SchedulerInterface','AgentRuntimeInterface','CommandEngineInterface'];
    for (const name of expected) {
      expect(typeof C[name]).toBe('function');
    }
  });

  it('CONTRACT_MODULES contains module list', () => {
    expect(Array.isArray(C.CONTRACT_MODULES)).toBe(true);
    expect(C.CONTRACT_MODULES.length).toBeGreaterThan(0);
  });
});