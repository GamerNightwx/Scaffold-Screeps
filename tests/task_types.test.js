import { describe, it, expect, beforeEach } from 'vitest';
import TaskFactory from '../src/tasks/TaskFactory.js';
import TaskEngine from '../src/tasks/TaskEngine.js';

describe('Task types mapping and handlers', () => {
  let tf, engine, kernel, wm;

  beforeEach(() => {
    global.Game = { time: 300 };
    wm = {
      _c: {},
      list: (col) => Object.values(wm._c[col] || {}),
      set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; },
      get: (col, id) => (wm._c[col] || {})[id] || null,
    };
    kernel = { has: (_name) => _name === 'workingMemory', get: (_name) => wm };
    tf = new TaskFactory(kernel);
    engine = new TaskEngine(kernel);
  });

  function createAndRun(goal) {
    wm._c.goals = wm._c.goals || {};
    wm._c.goals[goal.id] = goal;
    const created = tf.createTasksFromGoals();
    expect(created.length).toBe(1);
    const task = wm.list('tasks')[0];
    // progress engine until done or max iterations
    let iters = 0;
    while (task.data.status !== 'done' && iters < 20) {
      engine.tick();
      iters++;
    }
    return wm.get('tasks', task.id);
  }

  it('handles harvest tasks to completion', () => {
    const g = { id: 'gharvest', data: { type: 'harvest', amount: 30 } };
    const t = createAndRun(g);
    expect(t.data.status).toBe('done');
    expect(t.data.meta.remaining).toBeDefined();
    expect(t.data.meta.remaining).toBe(0);
  });

  it('handles build tasks to completion', () => {
    const g = { id: 'gbuild', data: { type: 'build', progress: 0 } };
    const t = createAndRun(g);
    expect(t.data.status).toBe('done');
    expect(t.data.meta.progress).toBeGreaterThanOrEqual(100);
  });

  it('handles repair tasks to completion', () => {
    const g = { id: 'grepair', data: { type: 'repair', health: 40 } };
    const t = createAndRun(g);
    expect(t.data.status).toBe('done');
    expect(t.data.meta.health).toBeLessThanOrEqual(0);
  });

  it('handles upgrade tasks to completion', () => {
    const g = { id: 'gupgrade', data: { type: 'upgrade', ticks: 3 } };
    const t = createAndRun(g);
    expect(t.data.status).toBe('done');
  });

  it('handles transport (carry) tasks to completion', () => {
    const g = { id: 'gtransport', data: { type: 'transport', amount: 60 } };
    const t = createAndRun(g);
    expect(t.data.status).toBe('done');
    expect(t.data.meta.remaining).toBe(0);
  });

  it('marks claim and reserve tasks done quickly', () => {
    const g1 = { id: 'gclaim', data: { type: 'claim', roomName: 'W1N1' } };
    const g2 = { id: 'greserve', data: { type: 'reserve', roomName: 'W2N2' } };
    const t1 = createAndRun(g1);
    const t2 = createAndRun(g2);
    expect(t1.data.status).toBe('done');
    expect(t2.data.status).toBe('done');
  });

  it('handles dismantle tasks', () => {
    const g = { id: 'gdismantle', data: { type: 'dismantle', targetId: 's1' } };
    const t = createAndRun(g);
    expect(t.data.status).toBe('done');
  });

  it('handles defend tasks with duration', () => {
    const g = { id: 'gdefend', data: { type: 'defend', duration: 2 } };
    const t = createAndRun(g);
    expect(t.data.status).toBe('done');
    expect(t.data.meta.remaining).toBe(0);
  });

  it('handles scout tasks with duration', () => {
    const g = { id: 'gscout', data: { type: 'scout', duration: 1 } };
    const t = createAndRun(g);
    expect(t.data.status).toBe('done');
  });

  it('creates a generic task when type unknown', () => {
    const g = { id: 'ggeneric', data: { type: 'weird' } };
    const t = createAndRun(g);
    expect(t.data.type).toBe('weird');
    expect(t.data.status).toBe('done');
  });
});