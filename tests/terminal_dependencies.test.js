import { describe, it, expect, beforeEach } from 'vitest';
import TerminalManager from '../src/logistics/TerminalManager.js';

function createWM() {
  const wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = wm._c[col] || {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
  return wm;
}

describe('TerminalManager creates tasks with dependencies', () => {
  let wm, kernel, tm;

  beforeEach(() => {
    global.Game = { time: 8000 };
    wm = createWM();
    kernel = { has: (n) => n === 'workingMemory', get: (n) => n === 'workingMemory' ? wm : null, config: { terminalMinAmount: 500 } };
    tm = new TerminalManager(kernel);
  });

  it('wires task dependencies local->terminal -> terminal_transfer -> remote', () => {
    const job = { id: 'log-d1', data: { type: 'transfer', from: 's1', to: 's2', fromRoom: 'R1', toRoom: 'R2', amount: 1000, status: 'pending' } };
    wm._c.logistics = { [job.id]: job };
    wm._c.storages = { s1: { id: 's1', data: { room: 'R1' } }, s2: { id: 's2', data: { room: 'R2' } } };
    wm._c.terminals = { t1: { id: 't1', data: { room: 'R1', capacity: 2000 } }, t2: { id: 't2', data: { room: 'R2', capacity: 2000 } } };

    tm.tick();

    const taskLocal = wm.get('tasks', 'task-log-d1-to-terminal');
    const taskHop = wm.get('tasks', 'task-log-d1-terminal-hop');
    const taskRemote = wm.get('tasks', 'task-log-d1-from-terminal');

    expect(taskLocal).toBeTruthy();
    expect(taskHop).toBeTruthy();
    expect(taskRemote).toBeTruthy();

    expect(taskHop.data.meta.dependsOn).toEqual([taskLocal.id]);
    expect(taskRemote.data.meta.dependsOn).toEqual([taskHop.id]);
  });
});