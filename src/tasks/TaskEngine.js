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

    if (status === 'pending') {
      // If dependencies satisfied, start
      const deps = (task.data.meta && task.data.meta.dependsOn) || [];
      const depSatisfied = deps.every(did => {
        const dep = wm.get('tasks', did);
        return dep && dep.data && dep.data.status === 'done';
      });

      if (depSatisfied) {
        task.data.status = 'in_progress';
        wm.set('tasks', task);
        return;
      }
    }

    if (status === 'in_progress') {
      // For demo, we complete short tasks immediately
      if (task.data.meta && task.data.meta.duration && task.data.meta.duration > 1) {
        task.data.meta.duration -= 1;
        wm.set('tasks', task);
      } else {
        task.data.status = 'done';
        wm.set('tasks', task);
      }
    }
  }

  createTask(task) {
    const wm = this._wm();
    if (!wm) return null;
    wm.set('tasks', task);
    return task;
  }
}
