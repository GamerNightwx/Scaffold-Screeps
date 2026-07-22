/**
 * TaskFactory
 * - Converts Goals (WorkingMemory) into Tasks
 * - Ensures tasks are created once per goal
 * - Produces lightweight task templates stored in WorkingMemory 'tasks'
 */
export default class TaskFactory {
  constructor(kernel) {
    this.kernel = kernel;
  }

  _ensureWM() {
    if (!this.kernel.has('workingMemory')) return null;
    return this.kernel.get('workingMemory');
  }

  /**
   * Create tasks from goals present in working memory
   * Idempotent: does not recreate tasks that already exist
   */
  createTasksFromGoals() {
    const wm = this._ensureWM();
    if (!wm) return [];

    const goals = wm.list('goals');
    const existing = wm.list('tasks');
    const existingByGoal = new Set(existing.map(t => t.data.goalId));

    const created = [];
    for (const g of goals) {
      if (existingByGoal.has(g.id)) continue;

      const task = this._makeTaskFromGoal(g);
      // store under tasks collection
      wm.set('tasks', task);
      created.push(task);
    }

    return created;
  }

  _makeTaskFromGoal(goal) {
    // Minimal mapping: goal -> task with id and metadata
    const taskId = `task_${goal.id}`;
    const now = Game ? Game.time : 0;
    const task = {
      id: taskId,
      createdTick: now,
      versionToken: `${now}-${goal.id}`,
      valid: true,
      data: {
        goalId: goal.id,
        type: goal.data.type || 'generic',
        priority: goal.data.priority || 0,
        status: 'pending',
        assignee: null,
        meta: goal.data || {}
      }
    };

    return task;
  }

  tick() {
    // Called by Kernel: ensure tasks exist for goals
    this.createTasksFromGoals();
  }
}
