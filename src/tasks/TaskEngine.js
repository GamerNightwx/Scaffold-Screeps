/**
 * TaskEngine
 * - Manages lifecycle of tasks stored in WorkingMemory 'tasks'
 * - Basic states: pending -> in_progress -> done
 * - Supports dependencies via task.data.meta.dependsOn = ['task_x']
 */
export default class TaskEngine {
  constructor(kernel) {
    this.kernel = kernel;
  }

  _wm() {
    if (!this.kernel.has('workingMemory')) return null;
    return this.kernel.get('workingMemory');
  }

  tick() {
    const wm = this._wm();
    if (!wm) return;

    const tasks = wm.list('tasks');
    if (!tasks || tasks.length === 0) return;

    // Validate and progress tasks
    for (const t of tasks) {
      try {
        this._ensureState(t, wm);
      } catch (e) {
        // mark invalid
        t.valid = false;
        wm.set('tasks', t);
      }
    }
  }

  _ensureState(task, wm) {
    const status = task.data.status;
    const type = (task.data.type || 'generic').toLowerCase();

    if (status === 'pending') {
      const deps = (task.data.meta && task.data.meta.dependsOn) || [];
      const depSatisfied = deps.every(did => {
        const dep = wm.get('tasks', did);
        return dep && dep.data && dep.data.status === 'done';
      });

      if (depSatisfied) {
        task.data.status = 'in_progress';
        // initialize runtime fields if missing
        if (!task.data.meta) task.data.meta = {};
        if (typeof task.data.meta.startedTick === 'undefined') task.data.meta.startedTick = Game ? Game.time : Date.now();
        wm.set('tasks', task);
        return;
      }
    }

    if (status === 'in_progress') {
      // dispatch to type-specific handler
      const handler = this._getHandlerForType(type);
      if (handler) {
        handler.call(this, task, wm);
      } else {
        // fallback generic progression
        if (task.data.meta && typeof task.data.meta.duration === 'number' && task.data.meta.duration > 1) {
          task.data.meta.duration -= 1;
          wm.set('tasks', task);
        } else {
          task.data.status = 'done';
          wm.set('tasks', task);
        }
      }
    }
  }

  _getHandlerForType(type) {
    const map = {
      harvest: this._handleHarvest,
      build: this._handleBuild,
      repair: this._handleRepair,
      upgrade: this._handleUpgrade,
      transport: this._handleTransport,
      carry: this._handleTransport,
      claim: this._handleClaimReserve,
      reserve: this._handleClaimReserve,
      dismantle: this._handleDismantle,
      defend: this._handleDefend,
      scout: this._handleScout
    };
    return map[type] || null;
  }

  // Handlers:
  _handleHarvest(task, wm) {
    const m = task.data.meta || {};
    if (typeof m.remaining !== 'number') m.remaining = typeof m.amount === 'number' ? m.amount : 0;
    // simulate one tick harvest
    m.remaining = Math.max(0, m.remaining - 10);
    task.data.meta = m;
    if (m.remaining <= 0) task.data.status = 'done';
    wm.set('tasks', task);
  }

  _handleBuild(task, wm) {
    const m = task.data.meta || {};
    if (typeof m.progress !== 'number') m.progress = 0;
    m.progress += 20; // simulate progress
    task.data.meta = m;
    if (m.progress >= 100) task.data.status = 'done';
    wm.set('tasks', task);
  }

  _handleRepair(task, wm) {
    const m = task.data.meta || {};
    if (typeof m.health !== 'number') m.health = 0;
    m.health = Math.max(0, m.health - 20); // reduce damage remaining
    task.data.meta = m;
    if (m.health <= 0) task.data.status = 'done';
    wm.set('tasks', task);
  }

  _handleUpgrade(task, wm) {
    const m = task.data.meta || {};
    if (typeof m.remaining !== 'number') m.remaining = typeof m.ticks === 'number' ? m.ticks : 0;
    m.remaining = Math.max(0, m.remaining - 1);
    task.data.meta = m;
    if (m.remaining <= 0) task.data.status = 'done';
    wm.set('tasks', task);
  }

  _handleTransport(task, wm) {
    const m = task.data.meta || {};
    if (typeof m.remaining !== 'number') m.remaining = typeof m.amount === 'number' ? m.amount : 0;
    m.remaining = Math.max(0, m.remaining - 25);
    task.data.meta = m;
    if (m.remaining <= 0) task.data.status = 'done';
    wm.set('tasks', task);
  }

  _handleClaimReserve(task, wm) {
    // claim/reserve are typically one-shot; mark done
    task.data.status = 'done';
    wm.set('tasks', task);
  }

  _handleDismantle(task, wm) {
    // simulate rapid dismantle
    task.data.status = 'done';
    wm.set('tasks', task);
  }

  _handleDefend(task, wm) {
    const m = task.data.meta || {};
    if (typeof m.remaining !== 'number') m.remaining = typeof m.duration === 'number' ? m.duration : 0;
    m.remaining = Math.max(0, m.remaining - 1);
    task.data.meta = m;
    if (m.remaining <= 0) task.data.status = 'done';
    wm.set('tasks', task);
  }

  _handleScout(task, wm) {
    const m = task.data.meta || {};
    if (typeof m.remaining !== 'number') m.remaining = typeof m.duration === 'number' ? m.duration : 0;
    m.remaining = Math.max(0, m.remaining - 1);
    task.data.meta = m;
    if (m.remaining <= 0) task.data.status = 'done';
    wm.set('tasks', task);
  }

  createTask(task) {
    const wm = this._wm();
    if (!wm) return null;
    wm.set('tasks', task);
    return task;
  }
}
