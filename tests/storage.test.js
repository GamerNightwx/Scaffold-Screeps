import { describe, it, expect, beforeEach } from 'vitest';
import StorageManager from '../src/logistics/StorageManager.js';

describe('StorageManager', () => {
  let wm;
  let sm;
  let kernel;

  beforeEach(() => {
    wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
    kernel = { has: (n) => n === 'workingMemory', get: (n) => n === 'workingMemory' ? wm : null };
    sm = new StorageManager(kernel);
  });

  it('registers storage network and tracks stock', () => {
    sm.registerNetwork('W1', 'storage1', 'terminal1', ['link1', 'link2']);
    sm.updateStock('W1', 'energy', 50000);
    expect(sm.getStock('W1', 'energy')).toBe(50000);
    const net = sm.getNetwork('W1');
    expect(net.storageId).toBe('storage1');
    expect(net.terminalId).toBe('terminal1');
    expect(net.links).toContain('link1');
  });

  it('creates reservation and persists', () => {
    sm.registerNetwork('W1', 'storage1');
    const rsvId = sm.reserve('energy', 1000, 'W1', 'transfer');
    expect(rsvId).toBeDefined();
    const rsv = sm.reservations[rsvId];
    expect(rsv.resource).toBe('energy');
    expect(rsv.amount).toBe(1000);
    expect(rsv.status).toBe('reserved');
    const persisted = wm.get('storage_reservations', rsvId);
    expect(persisted).not.toBeNull();
  });

  it('calculates available capacity accounting for reservations', () => {
    sm.registerNetwork('W1', 'storage1');
    sm.updateStock('W1', 'energy', 100000);
    const rsvId = sm.reserve('energy', 50000, 'W1', 'transfer');
    const available = sm.getAvailableCapacity('W1', 'energy');
    expect(available).toBe(300000 - 100000 - 50000); // maxCap - stock - reserved
  });

  it('fulfills reservation', () => {
    const rsvId = sm.reserve('energy', 1000, 'W1', 'transfer');
    const result = sm.fulfillReservation(rsvId);
    expect(result).toBe(true);
    expect(sm.reservations[rsvId].status).toBe('fulfilled');
    const persisted = wm.get('storage_reservations', rsvId);
    expect(persisted.data.status).toBe('fulfilled');
  });

  it('cancels reservation', () => {
    const rsvId = sm.reserve('energy', 1000, 'W1', 'transfer');
    const result = sm.cancelReservation(rsvId);
    expect(result).toBe(true);
    expect(sm.reservations[rsvId].status).toBe('cancelled');
  });

  it('finds best storage for resource (load balancing)', () => {
    sm.registerNetwork('W1', 'storage1');
    sm.registerNetwork('W2', 'storage2');
    sm.registerNetwork('W3', 'storage3');

    sm.updateStock('W1', 'energy', 100000); // 200k available
    sm.updateStock('W2', 'energy', 250000); // 50k available
    sm.updateStock('W3', 'energy', 50000); // 250k available

    const best = sm.findBestStorageForResource('energy', 'source', ['W1', 'W2', 'W3']);
    expect(best).toBe('W3'); // highest available capacity
  });

  it('sets and checks refill targets', () => {
    sm.setRefillTarget('energy', 75000);
    sm.registerNetwork('W1', 'storage1');
    sm.updateStock('W1', 'energy', 50000);
    expect(sm.needsRefill('W1', 'energy')).toBe(true);

    sm.updateStock('W1', 'energy', 30000); // now 80k total
    expect(sm.needsRefill('W1', 'energy')).toBe(false);
  });

  it('creates refill jobs when stock below target', () => {
    sm.setRefillTarget('energy', 100000);
    sm.registerNetwork('W1', 'storage1');
    sm.registerNetwork('W2', 'storage2');

    sm.updateStock('W1', 'energy', 20000); // needs refill
    sm.updateStock('W2', 'energy', 200000); // excess

    const jobs = sm.tick();
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0].data.type).toBe('refill');
    expect(jobs[0].data.from).toBe('W2');
    expect(jobs[0].data.to).toBe('W1');
  });

  it('lists reservations by status and target room', () => {
    sm.reserve('energy', 1000, 'W1', 'transfer');
    sm.reserve('power', 500, 'W1', 'transfer');
    const rsv2Id = sm.reserve('mineral', 100, 'W2', 'transfer');
    sm.fulfillReservation(rsv2Id);

    const pendingW1 = sm.listReservations('reserved', 'W1');
    expect(pendingW1.length).toBe(2);

    const fulfilledAll = sm.listReservations('fulfilled');
    expect(fulfilledAll.length).toBe(1);
  });

  it('lists all storage networks', () => {
    sm.registerNetwork('W1', 'storage1', 'terminal1');
    sm.registerNetwork('W2', 'storage2', 'terminal2');
    const networks = sm.listNetworks();
    expect(networks.length).toBe(2);
    expect(networks[0].room).toBe('W1');
    expect(networks[1].room).toBe('W2');
  });
});
