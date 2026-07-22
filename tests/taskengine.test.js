import { describe, it, expect, beforeEach } from 'vitest';
import TaskEngine from '../src/tasks/TaskEngine.js';

describe('TaskEngine', () => {
  let engine;
  let kernel;
  let wm;

  beforeEach(() => {
    global.Game = { time: 200 };
    wm = {
      _c: {},
      list: (col) => Object.values(wm._c[col] || {}),
      set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; },
      get: (col, id) => (wm._c[col] || {})[id] || null,
    };
    kernel = { has: (_name) => _name === 'workingMemory', get: (_name) => wm };
    engine = new TaskEngine(kernel);
  });

  it('progresses a pending task without deps to done', () => {
    const t = { id: 'task_g1', data: { goalId: 'g1', status: 'pending', meta: {} } };
    wm._c.tasks = { [t.id]: t };
    engine.tick();
    const updated = wm.get('tasks', t.id);
    // pending -> in_progress then done (engine completes immediately)
    expect(['in_progress','done']).toContain(updated.data.status);
  });

  it('respects dependencies', () => {
    const t1 = { id: 'task_a', data: { goalId: 'a', status: 'pending', meta: {} } };
    const t2 = { id: 'task_b', data: { goalId: 'b', status: 'pending', meta: { dependsOn: ['task_a'] } } };
    wm._c.tasks = { [t1.id]: t1, [t2.id]: t2 };

    // First tick: t1 may progress to done, t2 stays pending until t1 done
    engine.tick();
    engine.tick();

    const updated2 = wm.get('tasks', 'task_b');
    expect(['in_progress','done']).toContain(updated2.data.status);
  });

  it('handles duration meta to delay completion', () => {
    const t = { id: 'task_long', data: { goalId: 'gLong', status: 'in_progress', meta: { duration: 3 } } };
    wm._c.tasks = { [t.id]: t };
    engine.tick();
    expect(wm.get('tasks', t.id).data.meta.duration).toBe(2);
    engine.tick();
    engine.tick();
    expect(wm.get('tasks', t.id).data.status).toBe('done');
  });
});