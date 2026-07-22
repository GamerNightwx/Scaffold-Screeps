/**
 * AgentRuntime
 * - Executes assigned tasks for each agent
 * - Per-agent perception + local caching
 * - Delegates commands to CommandEngine
 */
export default class AgentRuntime {
  constructor(kernel) {
    this.kernel = kernel;
    this.localCache = new Map();
  }

  _wm() {
    return this.kernel.has('workingMemory') ? this.kernel.get('workingMemory') : null;
  }

  _commandEngine() {
    return this.kernel.has('commandEngine') ? this.kernel.get('commandEngine') : null;
  }

  tick() {
    const wm = this._wm();
    if (!wm) return;

    const assignments = wm.list('assignments') || [];
    if (assignments.length === 0) return;

    for (const a of assignments) {
      const agentId = a.data.agentId;
      const taskId = a.data.taskId;
      const task = wm.get('tasks', taskId);
      if (!task) continue;

      // Simple execution: map task types to commandEngine calls
      const cmd = this._translateTaskToCommand(task);
      const ce = this._commandEngine();
      if (ce && cmd) {
        try {
          ce.execute(agentId, cmd);
          // On success, mark task done
          task.data.status = 'done';
          wm.set('tasks', task);
        } catch (e) {
          // On failure, emit alert
          if (this.kernel.has('blackboard')) {
            const bb = this.kernel.get('blackboard');
            bb.emitAlert({ message: `Agent ${agentId} failed task ${taskId}: ${e.message}`, severity: 'medium' });
          }
        }
      }
    }
  }

  _translateTaskToCommand(task) {
    const type = task.data.type || 'generic';
    switch (type) {
    case 'move':
      return { action: 'moveTo', target: task.data.meta.target };
    case 'harvest':
      return { action: 'harvest', targetId: task.data.meta.sourceId };
    case 'transfer':
      return { action: 'transfer', targetId: task.data.meta.targetId, resource: task.data.meta.resource };
    default:
      return { action: 'noop' };
    }
  }
}
