import { describe, it, expect, beforeEach } from 'vitest';
import TerminalCoordinator from '../src/logistics/TerminalCoordinator.js';
import TaskEngine from '../src/tasks/TaskEngine.js';

function createWM() {
  const wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = wm._c[col] || {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
  return wm;
}

describe('TerminalCoordinator batching', () => {
  let wm, kernel, tc, te;
  beforeEach(() => {
    global.Game = { time: 9000 };
    wm = createWM();
    kernel = { has: (n) => n === 'workingMemory', get: (n) => n === 'workingMemory' ? wm : null, config: { terminalBatchMaxAmount: 1000, terminalMinBatchAmount: 100 } };
    tc = new TerminalCoordinator(kernel);
    te = new TaskEngine(kernel);
  });

  it('batches multiple terminal_transfer jobs into one aggregated task and reconciles progress', () => {
    // two separate terminal_transfer jobs from same source terminal 'tSrc'
    const j1 = { id: 'log1', data: { type: 'terminal_transfer', from: 'tSrc', to: 'tDst1', amount: 600, amountRemaining: 600, status: 'pending', createdAt: 1 } };
    const j2 = { id: 'log2', data: { type: 'terminal_transfer', from: 'tSrc', to: 'tDst2', amount: 500, amountRemaining: 500, status: 'pending', createdAt: 2 } };
    wm._c.logistics = { log1: j1, log2: j2 };

    // terminal state: no cooldown, energy 1000
    const tSrc = { id: 'tSrc', data: { room: 'R', cooldown: 0, energy: 1000, capacity: 2000 } };
    wm._c.terminals = { tSrc: tSrc };

    // coordinator tick -> should create aggregated task of amount 1000 (limited by batchMax=1000)
    const created = tc.tick();
    expect(created.length).toBeGreaterThanOrEqual(1);

    // task exists
    const tasks = wm.list('tasks');
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    const batch = tasks.find(t => t.id && t.id.startsWith('task-terminal-batch-tSrc-'));
    expect(batch).toBeTruthy();
    expect(batch.data.meta.amount).toBe(1000);
    expect(Array.isArray(batch.data.meta.components)).toBeTruthy();

    // run TaskEngine tick twice: pending->in_progress then handler tick
    te.tick();
    te.tick();

    // after ticks, both child logistics should have been reduced
    const updated1 = wm.get('logistics', 'log1');
    const updated2 = wm.get('logistics', 'log2');
    expect(updated1.data.amountRemaining + updated2.data.amountRemaining).toBeLessThanOrEqual(1000);

    // since batchMax=1000 only 1000 moved: j1 (600) done, j2 left with 100
    expect(updated1.data.status).toBe('done');
    expect(updated2.data.amountRemaining).toBe(100);
  });
});