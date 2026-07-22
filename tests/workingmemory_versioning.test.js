import { describe, it, expect, beforeEach } from 'vitest';
import WorkingMemory from '../src/memory/WorkingMemory.js';

describe('WorkingMemory versioning and invalidation', () => {
  let wm;
  beforeEach(() => {
    global.Game = { time: 1 };
    global.Memory = { workingMemory: { collections: {} } };
    wm = new WorkingMemory({ historySize: 3 });
  });

  it('stores history of previous versions up to historySize', () => {
    wm.set('col', { id: 'x', data: { a: 1 } });
    wm.set('col', { id: 'x', data: { a: 2 } });
    wm.set('col', { id: 'x', data: { a: 3 } });
    wm.set('col', { id: 'x', data: { a: 4 } });

    const current = wm.get('col', 'x');
    expect(current.data.a).toBe(4);
    const history = wm.getHistory('col', 'x');
    expect(history.length).toBeLessThanOrEqual(3);
    expect(history[0].data.a).toBe(3);
  });

  it('invalidateWhere marks valid=false and updates versionToken and history', () => {
    wm.set('col', { id: 'a', data: { v: 1 } });
    const before = wm.get('col', 'a');
    wm.invalidateWhere('col', (o) => o.data && o.data.v === 1);
    const after = wm.get('col', 'a');
    expect(after.valid).toBe(false);
    expect(after.versionToken).not.toBe(before.versionToken);
    const h = wm.getHistory('col', 'a');
    expect(h.length).toBeGreaterThan(0);
  });
});