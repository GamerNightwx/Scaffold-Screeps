import { describe, it, expect, beforeEach } from 'vitest';
import WorldModel from '../src/core/WorldModel.js';

describe('WorldModel spec conformance', () => {
  beforeEach(() => {
    // minimal global mocks
    global.Game = { time: 100, creeps: {}, rooms: {}, flags: {}, cpu: { getUsed: () => 0 } };
    global.Memory = {};
  });

  it('WorldModel implements required interface methods', () => {
    const wm = new WorldModel();
    expect(typeof wm.snapshot).toBe('function');
    expect(typeof wm.current).toBe('function');
    expect(typeof wm.previous).toBe('function');
    expect(typeof wm.query).toBe('function');
    expect(typeof wm.entities).toBe('function');
  });

  it('snapshot returns expected shape with indices', () => {
    const wm = new WorldModel();
    const snap = wm.snapshot();
    expect(snap).toHaveProperty('tickId');
    expect(snap).toHaveProperty('game');
    expect(snap).toHaveProperty('indices');
    const indices = snap.indices;
    expect(indices).toHaveProperty('creepsByRoom');
    expect(indices).toHaveProperty('structuresByRoom');
    expect(indices).toHaveProperty('structuresByType');
    expect(indices).toHaveProperty('creepsById');
    expect(typeof indices.creepsByRoom).toBe('object');
  });

  it('entities returns array for known types', () => {
    const wm = new WorldModel();
    wm.snapshot();
    expect(Array.isArray(wm.entities('creeps'))).toBe(true);
    expect(Array.isArray(wm.entities('structures'))).toBe(true);
    expect(Array.isArray(wm.entities('rooms'))).toBe(true);
  });
});