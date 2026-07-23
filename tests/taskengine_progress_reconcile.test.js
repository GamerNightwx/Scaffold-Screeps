import { describe, it, expect, beforeEach } from 'vitest';
import TaskEngine from '../src/tasks/TaskEngine.js';

function createWM() {
  const wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = wm._c[col] || {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
  return wm;
}

describe('TaskEngine incremental progress reconciles logistics jobs', () => {
  let wm, kernel, te;

  beforeEach(() => {
    wm = createWM();
    kernel = { has: (n) => n === 'workingMemory', get: (n) => n === 'workingMemory' ? wm : null };
    te = new TaskEngine(kernel);
  });

  it('updates logistics job amountRemaining on each tick with delta', () => {
    const job = { id: 'log-prog-1', data: { type: 'transfer', amount: 200, amountRemaining: 200, status: 'pending' } };
    wm._c.logistics = { [job.id]: job };

    const task = { id: `task-${job.id}`, data: { type: 'transfer', status: 'in_progress', meta: { amount: 200, remaining: 200 } } };
    wm._c.tasks = { [task.id]: task };

    // run 1 tick -> transport handler reduces 25
    te.tick();
    const updatedJob1 = wm.get('logistics', job.id);
    expect(updatedJob1.data.amountRemaining).toBe(175);

    // run another tick -> 150
    te.tick();
    const updatedJob2 = wm.get('logistics', job.id);
    expect(updatedJob2.data.amountRemaining).toBe(150);
  });
});