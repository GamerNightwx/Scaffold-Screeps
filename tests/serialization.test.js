import { describe, it, expect, beforeEach } from 'vitest';
import WorkingMemory from '../src/memory/WorkingMemory.js';

function isSerializable(obj) {
  try {
    // JSON.stringify returns undefined for undefined input, so explicitly check
    const s = JSON.stringify(obj);
    if (typeof s !== 'string') return false;
    JSON.parse(s);
    return true;
  } catch (e) {
    return false;
  }
}

describe('Memory serialization checks', () => {
  beforeEach(() => {
    global.Memory = { workingMemory: { collections: {} } };
    global.Game = { time: 1 };
  });

  it('WorkingMemory constructor ensures Memory.workingMemory exists', () => {
    global.Memory = undefined;
    new WorkingMemory();
    expect(typeof Memory).toBe('object');
    expect(typeof Memory.workingMemory).toBe('object');
    expect(typeof Memory.workingMemory.collections).toBe('object');
  });

  it('Memory.workingMemory must be JSON-serializable after normal usage', () => {
    const wm = new WorkingMemory();
    wm.set('goals', { id: 'g1', data: { a: 1 } });
    wm.set('tasks', { id: 't1', data: { type: 'move', target: { x: 10, y: 20 } } });

    expect(isSerializable(Memory.workingMemory)).toBe(true);
  });

  it('Detects non-serializable entries (circular) and fails test', () => {
    const wm = new WorkingMemory();
    const circular = {};
    circular.self = circular;
    // store circular data
    wm.set('bad', { id: 'c1', data: circular });
    // JSON.stringify on Memory.workingMemory should fail for circular content
    expect(isSerializable(Memory.workingMemory)).toBe(false);
  });
});