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
      if (wm && typeof wm.entities === 'function') {
        return wm.entities('creeps') || {};
      }
    }
    return Game && Game.creeps ? Game.creeps : {};
  }

  /**
   * Cost-based greedy assignment:
   * - compute cost(agent, task) using spatialEngine (path cost)
   * - incorporate task priority (higher priority reduces effective cost)
   * - sort all agent-task pairs by cost asc and greedily assign ensuring one task per agent
   */
  tick() {
    const wm = this._wm();
    if (!wm) return;

    const tasks = (wm.list('tasks') || []).filter(t => t.data && (t.data.status === 'pending' || t.data.status === 'unassigned'));
    if (tasks.length === 0) return [];

    const agentsObj = this._agents();
    const agentIds = Object.keys(agentsObj || {});
    if (agentIds.length === 0) return [];

    const spatial = this.kernel.has('spatialEngine') ? this.kernel.get('spatialEngine') : null;

    // Build list of {agentId, task, cost}
    const pairs = [];
    for (const agentId of agentIds) {
      const agent = agentsObj[agentId];
      const agentPos = agent && agent.pos ? agent.pos : null;

      for (const task of tasks) {
        const target = task.data && task.data.meta && task.data.meta.target ? task.data.meta.target : null;
        let cost = Number.POSITIVE_INFINITY;

        try {
          if (spatial && agentPos && target) {
            const entry = spatial.computePath(agentPos, target, { ignoreCreeps: true });
            cost = (entry && typeof entry.cost === 'number') ? entry.cost : (entry.path ? entry.path.length : Number.POSITIVE_INFINITY);
          } else if (agentPos && target) {
            // fallback: Manhattan distance
            cost = Math.abs(agentPos.x - target.x) + Math.abs(agentPos.y - target.y);
          }

          // incorporate priority: higher priority lowers effective cost
          const priority = (task.data && typeof task.data.priority === 'number') ? task.data.priority : 0;
          const effective = cost / (1 + priority);

          pairs.push({ agentId, task, cost: effective });
        } catch (e) {
          // ignore this pair if compute fails
        }
      }
    }

    // Sort pairs by cost asc
    pairs.sort((a, b) => a.cost - b.cost);

    const assignedAgents = new Set();
    const assignedTasks = new Set();
    const assignments = [];

    for (const p of pairs) {
      if (assignedAgents.has(p.agentId)) continue;
      if (assignedTasks.has(p.task.id)) continue;

      // assign
      const assignment = {
        id: `assign_${p.task.id}_${p.agentId}_${Game ? Game.time : 0}`,
        createdTick: Game ? Game.time : 0,
        data: { taskId: p.task.id, agentId: p.agentId }
      };

      // persist
      wm.set('assignments', assignment);

      // update task
      p.task.data.assignee = p.agentId;
      p.task.data.status = 'assigned';
      wm.set('tasks', p.task);

      assignedAgents.add(p.agentId);
      assignedTasks.add(p.task.id);
      assignments.push(assignment);
    }

    this.metrics.assignments += assignments.length;
    return assignments;
  }

  getMetrics() {
    return Object.assign({}, this.metrics);
  }
}
