import { describe, it, expect, beforeEach } from 'vitest';
import TaskFactory from '../src/tasks/TaskFactory.js';

describe('TaskFactory', () => {
  let tf;
  let kernel;
  let wm;

  beforeEach(() => {
    global.Game = { time: 100 };
    // simple WM mock
    wm = {
      _c: {},
      list: (col) => Object.values(wm._c[col] || {}),
      set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; },
      get: (col, id) => (wm._c[col] || {})[id] || null,
    };
    kernel = { has: (_name) => _name === 'workingMemory', get: (_name) => wm };
    tf = new TaskFactory(kernel);
  });

  it('creates tasks from goals', () => {
    wm._c.goals = { g1: { id: 'g1', data: { type: 'build' } } };
    const created = tf.createTasksFromGoals();
    expect(created.length).toBe(1);
    const tasks = wm.list('tasks');
    expect(tasks.length).toBe(1);
    expect(tasks[0].data.goalId).toBe('g1');
  });

  it('idempotent: does not recreate tasks', () => {
    wm._c.goals = { g1: { id: 'g1', data: {} } };
    tf.createTasksFromGoals();
    const second = tf.createTasksFromGoals();
    expect(second.length).toBe(0);
  });
});