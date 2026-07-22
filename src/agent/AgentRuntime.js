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

    // role handlers: implement lightweight micro-logic per role
    this.roleHandlers = {
      harvester: this._roleHarvester.bind(this),
      builder: this._roleBuilder.bind(this),
      upgrader: this._roleUpgrader.bind(this),
      transporter: this._roleTransporter.bind(this),
      repairer: this._roleRepairer.bind(this),
      scout: this._roleScout.bind(this),
      defender: this._roleDefender.bind(this),
      claimer: this._roleClaimer.bind(this),
      dismantler: this._roleDismantler.bind(this),
      generic: this._roleGeneric.bind(this)
    };
  }

  static designBody(role, energyAvailable = 300) {
    // Returns a simple body array scaled to available energy (uses string parts for test env)
    const templates = {
      harvester: ['WORK','CARRY','MOVE'],
      builder: ['WORK','CARRY','MOVE'],
      upgrader: ['WORK','CARRY','MOVE'],
      transporter: ['CARRY','CARRY','MOVE'],
      repairer: ['WORK','CARRY','MOVE'],
      scout: ['MOVE','MOVE'],
      defender: ['TOUGH','ATTACK','MOVE'],
      claimer: ['CLAIM','MOVE'],
      dismantler: ['WORK','WORK','MOVE'],
      generic: ['MOVE','CARRY']
    };

    const base = templates[role] || templates.generic;
    // naive scaling: repeat base until energy budget (assume costs: MOVE=50, CARRY=50, WORK=100, TOUGH=10, ATTACK=80, CLAIM=600)
    const costMap = { MOVE:50, CARRY:50, WORK:100, TOUGH:10, ATTACK:80, CLAIM:600 };
    const out = [];
    let remaining = energyAvailable;
    // try at least one copy
    for (const p of base) {
      const c = costMap[p] || 50;
      if (remaining >= c) { out.push(p); remaining -= c; }
    }
    // try to add repeats while budget allows (simple)
    let idx = 0;
    while (remaining > 49) {
      const p = base[idx % base.length];
      const c = costMap[p] || 50;
      if (remaining >= c) { out.push(p); remaining -= c; }
      idx++;
      if (idx > base.length * 4) break; // avoid runaway
    }
    return out;
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

      const creep = Game && Game.creeps ? Game.creeps[agentId] : null;
      if (!creep) {
        // agent missing: emit alert and unassign task
        if (this.kernel.has('blackboard')) {
          const bb = this.kernel.get('blackboard');
          bb.emitAlert({ message: `Assigned agent ${agentId} not present for task ${taskId}`, severity: 'high' });
        }
        // clear assignment record
        if (wm.delete) wm.delete('assignments', a.id);
        // mark task pending
        if (task) { task.data.assignee = null; task.data.status = 'pending'; wm.set('tasks', task); }
        continue;
      }

      // determine role
      const role = (creep.memory && creep.memory.role) ? creep.memory.role : (task.data && task.data.meta && task.data.meta.role) ? task.data.meta.role : 'generic';
      const handler = this.roleHandlers[role] || this.roleHandlers.generic;

      try {
        const res = handler(creep, task);
        // handler may return a command for the CommandEngine
        if (res && typeof res === 'object') {
          const ce = this._commandEngine();
          if (ce) ce.execute(agentId, res);
        }

        // mark task as in_progress (TaskEngine will manage completion)
        task.data.status = task.data.status === 'in_progress' ? 'in_progress' : 'in_progress';
        wm.set('tasks', task);
      } catch (e) {
        if (this.kernel.has('blackboard')) {
          const bb = this.kernel.get('blackboard');
          bb.emitAlert({ message: `AgentRuntime error for ${agentId} on task ${taskId}: ${e.message}`, severity: 'medium' });
        }
      }
    }
  }

  // Role micro-logics: return a command object or null
  _roleHarvester(creep, task) {
    const meta = task.data.meta || {};
    if (meta.sourceId) return { action: 'harvest', targetId: meta.sourceId };
    if (meta.target) return { action: 'moveTo', target: meta.target };
    return { action: 'noop' };
  }

  _roleBuilder(creep, task) {
    const meta = task.data.meta || {};
    if (meta.targetId) return { action: 'moveTo', target: meta.targetPos || meta.target };
    if (meta.target) return { action: 'moveTo', target: meta.target };
    return { action: 'noop' };
  }

  _roleUpgrader(creep, task) {
    const meta = task.data.meta || {};
    if (meta.controllerId) return { action: 'moveTo', target: meta.controllerPos || meta.target };
    return { action: 'noop' };
  }

  _roleTransporter(creep, task) {
    const meta = task.data.meta || {};
    // attempt pickup/transfer pattern: if empty -> move to source; if carrying -> move to destination
    if (creep.store && Object.values(creep.store).reduce((a,b)=>a+(b||0),0) > 0) {
      if (meta.to) return { action: 'moveTo', target: meta.to };
      if (meta.targetId) return { action: 'transfer', targetId: meta.targetId, resource: Object.keys(creep.store)[0] };
    } else {
      if (meta.from) return { action: 'moveTo', target: meta.from };
      if (meta.sourceId) return { action: 'moveTo', target: meta.sourcePos || meta.source };
    }
    return { action: 'noop' };
  }

  _roleRepairer(creep, task) {
    const meta = task.data.meta || {};
    if (meta.targetId) return { action: 'moveTo', target: meta.targetPos || meta.target };
    if (meta.target) return { action: 'moveTo', target: meta.target };
    return { action: 'noop' };
  }

  _roleScout(creep, task) {
    const meta = task.data.meta || {};
    if (meta.roomName) return { action: 'moveTo', target: { roomName: meta.roomName, x: 25, y: 25 } };
    if (meta.target) return { action: 'moveTo', target: meta.target };
    return { action: 'noop' };
  }

  _roleDefender(creep, task) {
    const meta = task.data.meta || {};
    if (meta.position) return { action: 'moveTo', target: meta.position };
    return { action: 'noop' };
  }

  _roleClaimer(creep, task) {
    const meta = task.data.meta || {};
    if (meta.roomName) return { action: 'moveTo', target: { roomName: meta.roomName, x: 25, y: 25 } };
    if (meta.target) return { action: 'moveTo', target: meta.target };
    return { action: 'noop' };
  }

  _roleDismantler(creep, task) {
    const meta = task.data.meta || {};
    if (meta.targetId) return { action: 'moveTo', target: meta.targetPos || meta.target };
    if (meta.target) return { action: 'moveTo', target: meta.target };
    return { action: 'noop' };
  }

  _roleGeneric(creep, task) {
    // fallback: try to move towards target
    const meta = task.data.meta || {};
    if (meta.target) return { action: 'moveTo', target: meta.target };
    return { action: 'noop' };
  }
}
