import { describe, it, expect, beforeEach } from 'vitest';
import SpawnManager from '../src/spawn/SpawnManager.js';
import { blueprints, registerDefaultBlueprints } from '../src/spawn/blueprints.js';
import AgentRuntime from '../src/agent/AgentRuntime.js';

describe('Blueprints - miner', () => {
  it('uses provided kernel.agentRuntime.designBody when available', () => {
    // stub agentRuntime with a custom designBody
    const stubAR = { constructor: { designBody: (role, energy) => {
      // return a recognizable pattern
      const n = Math.max(1, Math.floor(energy / 200));
      return Array(n).fill('MINE');
    } } };

    const kernel = { has: (n) => n === 'agentRuntime', get: (n) => n === 'agentRuntime' ? stubAR : null };
    const result = blueprints.miner({ energyAvailable: 600 }, kernel);
    expect(result).toBeDefined();
    expect(result.body).toEqual(['MINE','MINE','MINE']);
  });

  it('falls back to AgentRuntime.designBody when no agentRuntime provided', () => {
    const kernel = { has: (_n) => false };
    const res = blueprints.miner({ energyAvailable: 600 }, kernel);
    // AgentRuntime.designBody for 600 should produce at least more than base (base 3 parts)
    const fallback = AgentRuntime.designBody('harvester', 600);
    expect(res.body).toEqual(fallback);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
  });

  it('can be registered into SpawnManager and selected via tick', () => {
    const wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
    // kernel with agentRuntime using standard AgentRuntime
    const kernel = { has: (n) => n === 'workingMemory' || n === 'agentRuntime', get: (n) => n === 'workingMemory' ? wm : (n === 'agentRuntime' ? new AgentRuntime(null) : null) };

    const sm = new SpawnManager(kernel);
    registerDefaultBlueprints(sm, kernel);

    const id = sm.enqueue({ blueprint: 'miner', priority: 2, meta: { energyAvailable: 500 } });
    const tickRes = sm.tick();
    expect(tickRes).not.toBeNull();
    expect(tickRes.request.id).toBe(id);
    expect(tickRes.blueprint.body.length).toBeGreaterThan(0);
  });
});
