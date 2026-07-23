import { describe, it, expect, beforeEach } from 'vitest';
import TaskEngine from '../src/tasks/TaskEngine.js';

function createWM() {
  const wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = wm._c[col] || {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
  return wm;
}

describe('Task completion reconciles logistics jobs', () => {
  let wm, kernel, te;

  beforeEach(() => {
    wm = createWM();
    kernel = { has: (n) => n === 'workingMemory', get: (n) => n === 'workingMemory' ? wm : null };
    te = new TaskEngine(kernel);
  });

  it('updates logistics job amountRemaining and status when task completes', () => {
    const job = { id: 'log-complete-1', data: { type: 'transfer', amount: 500, amountRemaining: 500, status: 'pending' } };
    wm._c.logistics = { [job.id]: job };

    const task = { id: `task-${job.id}`, data: { type: 'transfer', status: 'in_progress', meta: { amount: 500 } } };
    wm._c.tasks = { [task.id]: task };

    // run engine: default transport reduces 25 per tick; set meta.remaining small to finish faster
    task.data.meta.remaining = 500; wm.set('tasks', task);

    // run until done
    for (let i = 0; i < 20; i++) te.tick();

    const updatedJob = wm.get('logistics', job.id);
    expect(updatedJob.data.amountRemaining).toBe(0);
    expect(updatedJob.data.status).toBe('done');
  });
});