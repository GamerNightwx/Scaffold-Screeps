import { describe, it, expect, beforeEach } from 'vitest';
import MiningManager from '../src/economy/MiningManager.js';

describe('MiningManager', () => {
  let wm;
  let mm;
  let kernel;

  beforeEach(() => {
    wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
    kernel = { has: (n) => n === 'workingMemory', get: (n) => n === 'workingMemory' ? wm : null };
    mm = new MiningManager(kernel);
  });

  it('creates mining jobs when container energy below threshold', () => {
    wm._c.sources = { src1: { id: 'src1', data: { energy: 3000, room: 'W1', pos: { x: 10, y: 10 } } } };
    wm._c.containers = { con1: { id: 'con1', data: { energy: 50000, room: 'W1' } } };

    const jobs = mm.tick();
    expect(jobs.length).toBe(1);
    const persisted = wm.get('mining', jobs[0].id);
    expect(persisted).not.toBeNull();
    expect(persisted.data.type).toBe('mining');
    expect(persisted.data.sourceId).toBe('src1');
    expect(persisted.data.containerIds).toContain('con1');
  });

  it('does not create duplicate mining jobs for same source', () => {
    wm._c.sources = { src1: { id: 'src1', data: { energy: 3000, room: 'W1' } } };
    wm._c.containers = { con1: { id: 'con1', data: { energy: 50000, room: 'W1' } } };
    // Create a pending job already
    wm._c.mining = { mj1: { id: 'mj1', data: { sourceId: 'src1', status: 'pending' } } };

    const jobs = mm.tick();
    expect(jobs.length).toBe(0);
  });

  it('assigns miner to job and persists', () => {
    const job = { id: 'mj1', data: { type: 'mining', sourceId: 'src1', status: 'pending' } };
    wm._c.mining = { mj1: job };

    const assigned = mm.assignMiner('mj1', 'miner1');
    expect(assigned).not.toBeNull();
    expect(assigned.data.assignee).toBe('miner1');
    expect(assigned.data.status).toBe('assigned');
    const persisted = wm.get('mining', 'mj1');
    expect(persisted.data.assignee).toBe('miner1');
  });

  it('listPending returns only pending jobs', () => {
    wm._c.mining = {
      mj1: { id: 'mj1', data: { status: 'pending' } },
      mj2: { id: 'mj2', data: { status: 'assigned' } }
    };
    const pending = mm.listPending();
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe('mj1');
  });

  it('tracks remote rooms', () => {
    mm.addRemoteRoom('E5N1');
    mm.addRemoteRoom('E5N1'); // duplicate should not be added twice
    mm.addRemoteRoom('E5N2');
    expect(mm.remoteRooms).toContain('E5N1');
    expect(mm.remoteRooms).toContain('E5N2');
    expect(mm.remoteRooms.length).toBe(2);
  });
});
