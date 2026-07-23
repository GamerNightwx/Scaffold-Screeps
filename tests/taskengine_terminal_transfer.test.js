import { describe, it, expect, beforeEach } from 'vitest';
import TaskEngine from '../src/tasks/TaskEngine.js';

function createWM() {
  const wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = wm._c[col] || {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
  return wm;
}

describe('TaskEngine terminal_transfer handler', () => {
  let wm, kernel, te;

  beforeEach(() => {
    wm = createWM();
    kernel = { has: (n) => n === 'workingMemory', get: (n) => n === 'workingMemory' ? wm : null, config: { terminalTransferRate: 400 } };
    te = new TaskEngine(kernel);
  });

  it('reduces remaining by configured transfer rate and completes', () => {
    const task = { id: 't-term-1', data: { type: 'terminal_transfer', status: 'in_progress', amount: 1200, meta: { amount: 1200 } } };
    wm._c.tasks = { [task.id]: task };

    te.tick();
    const t1 = wm.get('tasks', 't-term-1');
    expect(t1.data.meta.remaining).toBe(800);
    expect(t1.data.status).toBe('in_progress');

    // run 2 more ticks -> should complete
    te.tick();
    te.tick();
    const t2 = wm.get('tasks', 't-term-1');
    expect(t2.data.meta.remaining).toBe(0);
    expect(t2.data.status).toBe('done');
  });
});