import { describe, it, expect, beforeEach } from 'vitest';
import HaulerManager from '../src/economy/HaulerManager.js';
import TaskFactory from '../src/tasks/TaskFactory.js';

describe('Goals -> Tasks priority propagation', () => {
  let wm;
  let kernel;
  let hm;
  let tf;

  beforeEach(() => {
    global.Game = { time: 123 };
    wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
    kernel = { has: (n) => n === 'workingMemory', get: (n) => n === 'workingMemory' ? wm : null };
    hm = new HaulerManager(kernel);
    tf = new TaskFactory(kernel);
  });

  it('creates a goal with numeric priority when job created', () => {
    wm._c.containers = { c1: { id: 'c1', data: { energy: 900, pos: { x: 10, y: 20 }, room: 'W1' } } };
    wm._c.storages = { s1: { id: 's1', data: { pos: { x: 5, y: 5 }, room: 'W1' } } };

    const jobs = hm.tick();
    const goals = wm.list('goals');
    expect(goals.length).toBeGreaterThan(0);
    expect(typeof goals[0].data.priority).toBe('number');
  });

  it('TaskFactory creates tasks from goals with priority preserved', () => {
    // Insert a goal manually
    const goal = { id: 'goal-1', data: { type: 'transport', priority: 123, meta: { jobId: 'j1' } } };
    wm._c.goals = { 'goal-1': goal };

    const created = tf.createTasksFromGoals();
    expect(created.length).toBe(1);
    const tasks = wm.list('tasks');
    expect(tasks.length).toBe(1);
    expect(tasks[0].data.priority).toBe(123);
  });
});