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

  /**
   * Create high-level goals from constructionPlans saved by planners (e.g., RoadPlanner)
   * Idempotent: does not recreate goals that already reference the same plan
   */
  createGoalsFromConstructionPlans() {
    const wm = this._ensureWM();
    if (!wm) return [];

    const plans = wm.list('constructionPlans') || [];
    const goals = wm.list('goals') || [];
    const existingByPlan = new Set((goals || []).map(g => g.data && g.data.planId).filter(Boolean));

    const created = [];
    for (const p of plans) {
      try {
        const plan = p.data || p;
        if (!plan || !plan.room) continue;
        if (existingByPlan.has(p.id)) continue;

        const goalId = `goal_build:${p.id}`;
        const now = Game ? Game.time : Date.now();
        const goal = {
          id: goalId,
          createdTick: now,
          versionToken: `${now}-${p.id}`,
          valid: true,
          data: {
            type: 'build',
            planId: p.id,
            position: { roomName: plan.room, x: plan.x, y: plan.y },
            priority: typeof plan.count === 'number' ? plan.count : 0,
            // keep original plan for debugging
            sourcePlan: plan
          }
        };

        wm.set('goals', goal);
        created.push(goal);
      } catch (e) {
        // ignore per-plan errors
      }
    }

    return created;
  }

  /**
   * Create goals from defensePlans saved by DefensePlanner
   */
  createGoalsFromDefensePlans() {
    const wm = this._ensureWM();
    if (!wm) return [];

    const plans = wm.list('defensePlans') || [];
    const goals = wm.list('goals') || [];
    const existingByPlan = new Set((goals || []).map(g => g.data && g.data.planId).filter(Boolean));

    const created = [];
    for (const p of plans) {
      try {
        const plan = p.data || p;
        if (!plan || !plan.room) continue;
        if (existingByPlan.has(p.id)) continue;

        const goalId = `goal_defend:${p.id}`;
        const now = Game ? Game.time : Date.now();
        const goal = {
          id: goalId,
          createdTick: now,
          versionToken: `${now}-${p.id}`,
          valid: true,
          data: {
              // create a build goal for planner proposals (ramparts/walls)
              type: 'build',
              planId: p.id,
              position: { roomName: plan.room, x: plan.x, y: plan.y },
              priority: typeof plan.score === 'number' ? plan.score : 0,
              sourcePlan: plan
            }
        };

        wm.set('goals', goal);
        created.push(goal);
      } catch (e) { }
    }

    return created;
  }

  _makeTaskFromGoal(goal) {
    const taskId = `task_${goal.id}`;
    const now = Game ? Game.time : 0;
    const g = goal.data || {};

    // Normalize known types and enrich meta with sensible defaults
    const type = (g.type || 'generic').toLowerCase();
    const meta = Object.assign({}, g);

    switch (type) {
      case 'harvest':
        meta.targetId = g.targetId || g.flagId || null;
        meta.amount = typeof g.amount === 'number' ? g.amount : 50;
        meta.remaining = meta.amount;
        meta.requiredSkill = 'harvest';
        break;
      case 'build':
        meta.targetId = g.targetId || null;
        meta.progress = typeof g.progress === 'number' ? g.progress : 0;
        meta.requiredSkill = 'build';
        break;
      case 'repair':
        meta.targetId = g.targetId || null;
        meta.health = typeof g.health === 'number' ? g.health : 100;
        meta.requiredSkill = 'repair';
        break;
      case 'upgrade':
        meta.controllerId = g.controllerId || null;
        meta.ticks = typeof g.ticks === 'number' ? g.ticks : 5;
        meta.remaining = meta.ticks;
        meta.requiredSkill = 'upgrade';
        break;
      case 'transport':
      case 'carry':
        meta.from = g.from || null;
        meta.to = g.to || null;
        meta.amount = typeof g.amount === 'number' ? g.amount : 50;
        meta.remaining = meta.amount;
        meta.requiredSkill = 'carry';
        break;
      case 'claim':
      case 'reserve':
        meta.roomName = g.roomName || (g.target && g.target.roomName) || null;
        meta.requiredSkill = 'claim';
        break;
      case 'dismantle':
        meta.targetId = g.targetId || null;
        meta.requiredSkill = 'dismantle';
        break;
      case 'defend':
        meta.position = g.position || null;
        meta.duration = typeof g.duration === 'number' ? g.duration : 3;
        meta.remaining = meta.duration;
        meta.requiredSkill = 'defend';
        break;
      case 'scout':
        meta.roomName = g.roomName || null;
        meta.duration = typeof g.duration === 'number' ? g.duration : 1;
        meta.remaining = meta.duration;
        meta.requiredSkill = 'scout';
        break;
      default:
        // leave meta as-is for generic
        break;
    }

    const task = {
      id: taskId,
      createdTick: now,
      versionToken: `${now}-${goal.id}`,
      valid: true,
      data: {
        goalId: goal.id,
        type: type,
        priority: g.priority || 0,
        status: 'pending',
        assignee: null,
        meta
      }
    };

    return task;
  }

  tick() {
    // Called by Kernel: create goals from planner proposals, then create tasks
    try {
      this.createGoalsFromConstructionPlans();
    } catch (e) { /* ignore */ }

    try {
      this.createGoalsFromDefensePlans && this.createGoalsFromDefensePlans();
    } catch (e) { /* ignore */ }

    this.createTasksFromGoals();
  }
}
