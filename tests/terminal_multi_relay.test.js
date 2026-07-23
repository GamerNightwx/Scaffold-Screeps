import { describe, it, expect, beforeEach } from 'vitest';
import TerminalManager from '../src/logistics/TerminalManager.js';

function createWM() {
  const wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = wm._c[col] || {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
  return wm;
}

describe('Terminal pipeline relay fallback', () => {
  let wm, kernel, tm;

  beforeEach(() => {
    global.Game = { time: 7000 };
    wm = createWM();
    kernel = { has: (n) => n === 'workingMemory', get: (n) => n === 'workingMemory' ? wm : null, config: { terminalMinAmount: 500 } };
    tm = new TerminalManager(kernel);
  });

  it('uses relay terminal when destination room has no terminal', () => {
    const job = { id: 'log-x1', data: { type: 'transfer', from: 'storageA', to: 'storageB', fromRoom: 'A', toRoom: 'B', amount: 800, status: 'pending' } };
    wm._c.logistics = { [job.id]: job };

    const storageA = { id: 'storageA', data: { room: 'A' } };
    const storageB = { id: 'storageB', data: { room: 'B' } };
    wm._c.storages = { [storageA.id]: storageA, [storageB.id]: storageB };

    const termA = { id: 'termA', data: { room: 'A', capacity: 500 } };
    const hub1 = { id: 'hub1', data: { room: 'H1', capacity: 2000 } };
    const hub2 = { id: 'hub2', data: { room: 'H2', capacity: 1500 } };
    wm._c.terminals = { [termA.id]: termA, [hub1.id]: hub1, [hub2.id]: hub2 };

    const created = tm.tick();
    expect(created.length).toBeGreaterThanOrEqual(3);

    const local = wm.get('logistics', 'log-x1-to-terminal');
    // hops now are named log-x1-terminal-hop-0, -1 ... depending on chosen relays
    const hops = (wm.list('logistics') || []).filter(l => l.id && l.id.startsWith('log-x1-terminal-hop'));
    const remote = wm.get('logistics', 'log-x1-from-terminal');

    expect(local).toBeTruthy();
    expect(hops.length).toBeGreaterThanOrEqual(1);
    expect(remote).toBeTruthy();

    // final transfer should be from last hub
    const lastHop = hops[hops.length-1];
    expect(remote.data.from).toBe(lastHop.data.to || lastHop.data.to);
  });
});