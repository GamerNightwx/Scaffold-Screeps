import { describe, it, expect, beforeEach } from 'vitest';
import HaulerManager from '../src/economy/HaulerManager.js';

describe('HaulerManager', () => {
  let wm;
  let hm;
  let kernel;

  beforeEach(() => {
    wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
    kernel = { has: (n) => n === 'workingMemory', get: (n) => n === 'workingMemory' ? wm : null };
    hm = new HaulerManager(kernel);
  });

  it('creates transfer jobs when containers exceed threshold', () => {
    wm._c.containers = { c1: { id: 'c1', data: { energy: 900, pos: { x: 10, y: 20 }, room: 'W1' } } };
    wm._c.storages = { s1: { id: 's1', data: { pos: { x: 5, y: 5 }, room: 'W1' } } };

    const jobs = hm.tick();
    expect(jobs.length).toBe(1);
    const persisted = wm.get('logistics', jobs[0].id);
    expect(persisted).not.toBeNull();
    expect(persisted.data.type).toBe('transfer');
    expect(persisted.data.from).toBe('c1');
    expect(persisted.data.to).toBe('s1');
  });

  it('assigns a hauler to a job', () => {
    // prepare a job in WM
    const job = { id: 'j1', data: { type: 'transfer', from: 'c1', to: 's1', amount: 500, status: 'pending' } };
    wm._c.logistics = { j1: job };

    const assigned = hm.assignHauler('j1', 'creepA');
    expect(assigned).not.toBeNull();
    expect(assigned.data.assignee).toBe('creepA');
    expect(assigned.data.status).toBe('assigned');
    const persisted = wm.get('logistics', 'j1');
    expect(persisted.data.assignee).toBe('creepA');
  });

  it('listPending returns only pending jobs', () => {
    wm._c.logistics = {
      j1: { id: 'j1', data: { status: 'pending' } },
      j2: { id: 'j2', data: { status: 'assigned' } }
    };
    const pending = hm.listPending();
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe('j1');
  });
});
