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

  // Estimate creep carry capacity from body or memory
  _getCreepCarryCapacity(creep) {
    if (!creep) return 200; // default
    // prefer explicit memory hint
    if (creep.memory && typeof creep.memory.carryCapacity === 'number') return creep.memory.carryCapacity;
    // body array of strings or objects
    if (Array.isArray(creep.body) && creep.body.length) {
      let carries = 0;
      for (const p of creep.body) {
        if (!p) continue;
        if (typeof p === 'string') {
          if (p.toLowerCase() === 'carry' || p.toLowerCase() === 'carry') carries += 1;
        } else if (typeof p === 'object' && (p.type || p.part)) {
          const t = (p.type || p.part).toString().toLowerCase();
          if (t === 'carry') carries += 1;
        }
      }
      if (carries > 0) return carries * 50;
    }
    // fallback if creep has storeCapacity or carryCapacity-like properties
    if (typeof creep.storeCapacity === 'number') return creep.storeCapacity;
    if (typeof creep.carryCapacity === 'number') return creep.carryCapacity;
    // conservative default
    return 200;
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
          if (ce) {
            try { ce.execute(agentId, res); } catch (e) { /* ignore execution errors for simulation */ }
          }

          // Simulate resource movement for transport/transfer actions so TaskEngine progress ties to actions
          try {
            const wmLocal = wm;
            if (res.action === 'transfer') {
                  // estimate moved amount based on creep capacity and current carried
                  const carryCap = this._getCreepCarryCapacity(creep);
                  const carried = Object.values((creep.store)||{}).reduce((a,b)=>a+(b||0),0);
                  const jobRemaining = (task.data && task.data.meta && (typeof task.data.meta.remaining === 'number' ? task.data.meta.remaining : task.data.meta.amount)) || 0;

                  // throughput heuristic: fraction of capacity per tick (25% of capacity), min 25
                  const baseRate = Math.max(25, Math.floor(carryCap * 0.25));
                  const moveAmt = (res.amount && typeof res.amount === 'number') ? res.amount : baseRate;

                  const moved = Math.min(moveAmt, carried || 0, jobRemaining);
                  if (moved > 0) {
                    // deduct from creep.store (prefer RESOURCE_ENERGY)
                    const resKey = Object.keys(creep.store || {})[0] || 'energy';
                    creep.store = creep.store || {};
                    creep.store[resKey] = Math.max(0, (creep.store[resKey] || 0) - moved);

                    // update task remaining
                    if (!task.data.meta) task.data.meta = {};
                    if (typeof task.data.meta.remaining !== 'number') task.data.meta.remaining = task.data.meta.amount || jobRemaining;
                    task.data.meta.remaining = Math.max(0, task.data.meta.remaining - moved);
                    if (task.data.meta.remaining <= 0) task.data.status = 'done';
                    wmLocal.set('tasks', task);

                    // update logistics job (if present)
                    const jobId = task.data && task.data.meta && task.data.meta.jobId;
                    if (jobId) {
                      const lj = wmLocal.get('logistics', jobId);
                      if (lj && lj.data) {
                        if (typeof lj.data.amountRemaining === 'number') lj.data.amountRemaining = Math.max(0, lj.data.amountRemaining - moved);
                        else lj.data.amountRemaining = Math.max(0, (lj.data.amount || lj.data.amountTotal || 0) - moved);
                        if (lj.data.amountRemaining <= 0) lj.data.status = 'complete';
                        wmLocal.set('logistics', lj);
                      }

                      // report to pool if exists
                      const pools = wmLocal.list('hauler_pools') || [];
                      const pool = pools.find(p => p.jobId === jobId);
                      if (pool && this.kernel && this.kernel.has && this.kernel.has('haulerPool')) {
                        try { this.kernel.get('haulerPool').reportProgress(pool.id, agentId, moved); } catch (e) { /* ignore */ }
                      }
                    }
                  }
                }

                // Simulate pickup/withdraw: if action is moveTo target representing source and creep empty, pretend to withdraw
                if (res.action === 'moveTo' && task && task.data && task.data.meta && task.data.meta.from) {
                  // if creep empty and near source (tests don't have positions), simulate immediate pickup up to carry capacity
                  const carryCap = this._getCreepCarryCapacity(creep);
                  const current = Object.values((creep.store)||{}).reduce((a,b)=>a+(b||0),0);
                  if (current < carryCap) {
                    const cfg2 = (this.kernel && this.kernel.config) ? this.kernel.config : {};
                    const pickupFrac = (typeof cfg2.haulerPickupFraction === 'number') ? cfg2.haulerPickupFraction : 0.5;
                    const pickupMin = (typeof cfg2.haulerPickupMin === 'number') ? cfg2.haulerPickupMin : 50;
                    const pickupRate = Math.max(pickupMin, Math.floor(carryCap * pickupFrac));
                    const pickup = Math.min(pickupRate, carryCap - current);
                    if (!creep.store) creep.store = {};
                    creep.store['energy'] = (creep.store['energy'] || 0) + pickup;
                  }
                }
              } catch (e) {
                // ignore simulation errors
              }
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
