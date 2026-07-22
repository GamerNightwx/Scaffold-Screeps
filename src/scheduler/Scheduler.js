/**
 * Scheduler
 * - Collects pending tasks from WorkingMemory
 * - Collects available agents (creeps) from WorldModel or Game
 * - Assigns tasks to agents using simple greedy policy
 * - Writes assignments to WorkingMemory 'assignments'
 */
export default class Scheduler {
  constructor(kernel) {
    this.kernel = kernel;
    this.metrics = { assignments: 0 };
  }

  _wm() {
    return this.kernel.has('workingMemory') ? this.kernel.get('workingMemory') : null;
  }

  _agents() {
    // Prefer a worldModel-provided list, otherwise Game.creeps
    if (this.kernel.has('worldModel')) {
      const wm = this.kernel.get('worldModel');
      // worldModel should expose creepsByRoom or similar; fallback to Game.creeps
      if (wm && typeof wm.entities === 'function') {
        return wm.entities('creeps') || {};
      }
    }
    return Game && Game.creeps ? Game.creeps : {};
  }

  /**
   * Simple assignment algorithm:
   * - gather pending tasks
   * - gather idle agents
   * - assign one task per agent in order
   */
  tick() {
    const wm = this._wm();
    if (!wm) return;

    const tasks = (wm.list('tasks') || []).filter(t => t.data && t.data.status === 'pending');
    const agentsObj = this._agents();
    const agentIds = Object.keys(agentsObj || {});

    const assignments = [];

    let i = 0;
    for (const task of tasks) {
      if (agentIds.length === 0) break;
      const agentId = agentIds[i % agentIds.length];
      const assignment = {
        id: `assign_${task.id}_${agentId}_${Game ? Game.time : 0}`,
        createdTick: Game ? Game.time : 0,
        data: { taskId: task.id, agentId }
      };
      assignments.push(assignment);
      // Mark task assigned
      task.data.assignee = agentId;
      task.data.status = 'assigned';
      wm.set('tasks', task);
      i++;
    }

    // Persist assignments collection
    for (const a of assignments) wm.set('assignments', a);
    this.metrics.assignments += assignments.length;
    return assignments;
  }

  getMetrics() {
    return Object.assign({}, this.metrics);
  }
}
