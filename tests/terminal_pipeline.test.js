import { describe, it, expect, beforeEach } from 'vitest';
import TerminalManager from '../src/logistics/TerminalManager.js';

function createWM() {
  const wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = wm._c[col] || {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
  return wm;
}

describe('Terminal pipeline manager', () => {
  let wm, kernel, tm;

  beforeEach(() => {
    global.Game = { time: 6000 };
    wm = createWM();
    kernel = { has: (n) => n === 'workingMemory', get: (n) => n === 'workingMemory' ? wm : null, config: { terminalMinAmount: 500 } };
    tm = new TerminalManager(kernel);
  });

  it('creates local->terminal, terminal-hop, and terminal->dest jobs for cross-room transfer', () => {
    const job = { id: 'log-j1', data: { type: 'transfer', from: 'storageR1', to: 'storageR2', fromRoom: 'R1', toRoom: 'R2', amount: 1200, status: 'pending' } };
    wm._c.logistics = { [job.id]: job };

    const storageR1 = { id: 'storageR1', data: { room: 'R1' } };
    const storageR2 = { id: 'storageR2', data: { room: 'R2' } };
    wm._c.storages = { [storageR1.id]: storageR1, [storageR2.id]: storageR2 };

    const termR1 = { id: 'termR1', data: { room: 'R1', capacity: 10000 } };
    const termR2 = { id: 'termR2', data: { room: 'R2', capacity: 10000 } };
    wm._c.terminals = { [termR1.id]: termR1, [termR2.id]: termR2 };

    const created = tm.tick();
    expect(created.length).toBeGreaterThanOrEqual(3);

    const local = wm.get('logistics', 'log-j1-to-terminal');
    const hop = wm.get('logistics', 'log-j1-terminal-hop');
    const remote = wm.get('logistics', 'log-j1-from-terminal');

    expect(local).toBeTruthy();
    expect(hop).toBeTruthy();
    expect(remote).toBeTruthy();

    expect(local.data.to).toBe('termR1');
    expect(hop.data.from).toBe('termR1');
    expect(hop.data.to).toBe('termR2');
    expect(remote.data.from).toBe('termR2');

    // original job marked as handled
    const orig = wm.get('logistics', 'log-j1');
    expect(orig.data._terminalPipelineHandled).toBeTruthy();
  });
});