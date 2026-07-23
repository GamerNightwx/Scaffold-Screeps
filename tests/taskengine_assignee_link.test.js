import { describe, it, expect, beforeEach } from 'vitest';
import TaskEngine from '../src/tasks/TaskEngine.js';

function createWM() {
  const wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = wm._c[col] || {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
  return wm;
}

describe('TaskEngine links assignee to logistics job on start', () => {
  let wm, kernel, te;

  beforeEach(() => {
    wm = createWM();
    kernel = { has: (n) => n === 'workingMemory', get: (n) => n === 'workingMemory' ? wm : null };
    te = new TaskEngine(kernel);
  });

  it('sets logistics job.assignee when task moves to in_progress', () => {
    const job = { id: 'log-assign-2', data: { type: 'transfer', amount: 100, amountRemaining: 100, status: 'pending' } };
    wm._c.logistics = { [job.id]: job };

    const task = { id: `task-${job.id}`, data: { type: 'transfer', status: 'pending', assignee: 'CreepX', meta: { amount: 100, remaining: 100, parentJob: job.id } } };
    wm._c.tasks = { [task.id]: task };

    te.tick(); // move pending -> in_progress
    te.tick(); // process in_progress handlers which will reconcile and assign
    const updatedJob = wm.get('logistics', job.id);
    expect(updatedJob.data.assignee).toBe('CreepX');
    expect(['assigned','in_progress']).toContain(updatedJob.data.status);
  });
});