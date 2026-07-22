import { describe, it, expect, beforeEach } from 'vitest';
import WorkingMemory from '../src/memory/WorkingMemory.js';

describe('WorkingMemory', () => {
  let wm;

  beforeEach(() => {
    global.Memory = { workingMemory: { collections: {} } };
    global.Game = { time: 100 };
    wm = new WorkingMemory();
  });

  it('salva e lê objetos', () => {
    const obj = { id: 'g1', data: { goal: 'mine' } };
    wm.set('goals', obj);
    const got = wm.get('goals', 'g1');
    expect(got).toBeTruthy();
    expect(got.data).toEqual(obj.data);
  });

  it('lista objetos válidos', () => {
    wm.set('goals', { id: 'g1', data: { a: 1 } });
    wm.set('goals', { id: 'g2', data: { a: 2 }, valid: false });
    const list = wm.list('goals');
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('g1');
  });

  it('delete remove item', () => {
    wm.set('goals', { id: 'g1', data: { a: 1 } });
    wm.delete('goals', 'g1');
    expect(wm.get('goals', 'g1')).toBeNull();
  });

  it('invalidateWhere invalidates matching items', () => {
    wm.set('goals', { id: 'g1', data: { a: 1 } });
    wm.set('goals', { id: 'g2', data: { a: 2 } });
    wm.invalidateWhere('goals', (o) => o.data.a === 2);
    const g1 = wm.get('goals', 'g1');
    const g2 = wm.get('goals', 'g2');
    expect(g1.valid).toBeTruthy();
    expect(g2.valid).toBeFalsy();
  });
});