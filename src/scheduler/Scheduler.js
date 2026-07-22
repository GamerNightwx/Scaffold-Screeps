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

    // include assigned tasks as candidates to allow preemption
    const tasks = (wm.list('tasks') || []).filter(t => t.data && (t.data.status === 'pending' || t.data.status === 'unassigned' || t.data.status === 'assigned'));
    if (tasks.length === 0) return [];

    // load config weights (kernel config overrides Settings)
    let cfg = {};
    try { cfg = (this.kernel && this.kernel.config) ? this.kernel.config : require('../config/Settings.js').default; } catch (e) { cfg = (this.kernel && this.kernel.config) ? this.kernel.config : {}; }
    const pathWeight = typeof cfg.pathWeight === 'number' ? cfg.pathWeight : 1.0;
    const typeWeight = typeof cfg.typeWeight === 'number' ? cfg.typeWeight : 1.0;
    const availabilityWeight = typeof cfg.availabilityWeight === 'number' ? cfg.availabilityWeight : 1.0;
    const skillWeight = typeof cfg.skillWeight === 'number' ? cfg.skillWeight : 1.0;
    const balanceWeight = typeof cfg.balanceWeight === 'number' ? cfg.balanceWeight : 10.0;
    const preemptionThreshold = typeof cfg.preemptionThreshold === 'number' ? cfg.preemptionThreshold : 5.0;
    const trafficWeightCfg = typeof cfg.trafficWeight === 'number' ? cfg.trafficWeight : 0.5;
    const missingSkillPenaltyCfg = typeof cfg.missingSkillPenalty === 'number' ? cfg.missingSkillPenalty : 1000;
    const proficiencyScale = typeof cfg.skillProficiencyScale === 'number' ? cfg.skillProficiencyScale : 1.0;
    const skillAliases = cfg.skillAliases || {};

    // common type penalties
    const typePenalties = { build:1.2, repair:1.3, move:1.0, harvest:0.9, transfer:1.0, generic:1.0 };

    // helper resolve skill (reuse logic)
    function resolveAgentSkillLevel(skillsObj, required, aliasesMap) {
      if (!skillsObj) return 0;
      if (typeof skillsObj[required] === 'number') return skillsObj[required];
      const alt = aliasesMap[required] || [];
      for (const a of alt) {
        if (typeof skillsObj[a] === 'number') return skillsObj[a];
      }
      for (const [canon, arr] of Object.entries(aliasesMap)) {
        if (Array.isArray(arr) && arr.includes(required) && typeof skillsObj[canon] === 'number') return skillsObj[canon];
      }
      return 0;
    }

    // agents and spatial engine
    const agentsObj = this._agents();
    const agentIds = Object.keys(agentsObj || {});
    if (agentIds.length === 0) return [];

    const spatial = this.kernel.has('spatialEngine') ? this.kernel.get('spatialEngine') : null;

    // current assignment counts for balancing
    const assignmentCounts = {};
    const allAssignments = wm.list('assignments') || [];
    for (const asn of allAssignments) {
      const aid = asn.data && asn.data.agentId;
      if (aid) assignmentCounts[aid] = (assignmentCounts[aid] || 0) + 1;
    }

    // Precompute agent current assigned task (if any) and its cost/priority
    const agentCurrent = {}; // agentId -> { taskId, cost, priority }
    for (const t of (wm.list('tasks') || [])) {
      if (t.data && t.data.assignee) {
        const aid = t.data.assignee;
        // compute current cost roughly using same heuristics below (best-effort)
        try {
          const agentObj = agentsObj[aid];
          const agentPos = agentObj && agentObj.pos ? agentObj.pos : null;
          const target = t.data && t.data.meta && t.data.meta.target ? t.data.meta.target : null;
          let baseCost = Number.POSITIVE_INFINITY;
          if (spatial && agentPos && target) {
            const e = spatial.computePath(agentPos, target, { ignoreCreeps: true });
            baseCost = (e && typeof e.cost === 'number') ? e.cost : (e.path ? e.path.length : Number.POSITIVE_INFINITY);
          } else if (agentPos && target) {
            baseCost = Math.abs(agentPos.x - target.x) + Math.abs(agentPos.y - target.y);
          }
          const reqEnergy = (t.data && t.data.meta && t.data.meta.requiredEnergy) || 0;
          const reqCarry = (t.data && t.data.meta && t.data.meta.requiredCarry) || 0;
          let availabilityPenalty = 0;
          const energy = (agentObj && (agentObj.energy !== undefined ? agentObj.energy : (agentObj.store && agentObj.store[RESOURCE_ENERGY] !== undefined ? agentObj.store[RESOURCE_ENERGY] : null)));
          const carry = (agentObj && agentObj.store ? Object.values(agentObj.store).reduce((a,b)=>a+(b||0),0) : null);
          if (reqEnergy && (energy === null || energy < reqEnergy)) availabilityPenalty += 1000;
          if (reqCarry && (carry === null || carry < reqCarry)) availabilityPenalty += 1000;

          const reqSkill = (t.data && t.data.meta && t.data.meta.requiredSkill) || t.data.requiredSkill || (t.data && t.data.type) || 'generic';
          const agentSkills = (agentObj && agentObj.memory && agentObj.memory.skills) ? agentObj.memory.skills : {};
          const agentSkillLevel = resolveAgentSkillLevel(agentSkills, reqSkill, skillAliases) || 0;
          const missingSkillPenalty = (agentSkillLevel <= 0) ? missingSkillPenaltyCfg : 0;
          const skillFactor = 1 / (1 + (agentSkillLevel * proficiencyScale));

          const typePenalties = { build:1.2, repair:1.3, move:1.0, harvest:0.9, transfer:1.0, generic:1.0 };
          const typePenalty = typePenalties[(t.data && t.data.type) || 'generic'] || 1.0;

          let traffic = 0;
          if (spatial && target && typeof spatial.getTraffic === 'function') { try { traffic = spatial.getTraffic(target.roomName) || 0; } catch(e) { traffic = 0; } }

          const count = assignmentCounts[aid] || 0;
          const balancePenalty = count * balanceWeight;

          const effectiveCost = (baseCost * pathWeight * typePenalty * typeWeight * skillFactor) + (availabilityPenalty * availabilityWeight) + (traffic * trafficWeightCfg) + (missingSkillPenalty) + (balancePenalty * balanceWeight);

          agentCurrent[aid] = { taskId: t.id, cost: effectiveCost, priority: (t.data && t.data.priority) || 0 };
        } catch (e) {
          // ignore
        }
      }
    }

    // Build list of {agentId, task, cost}
    const pairs = [];
    for (const agentId of agentIds) {
      const agent = agentsObj[agentId];
      const agentPos = agent && agent.pos ? agent.pos : null;

      // availability info
      const energy = (agent && (agent.energy !== undefined ? agent.energy : (agent.store && agent.store[RESOURCE_ENERGY] !== undefined ? agent.store[RESOURCE_ENERGY] : null)));
      const carry = (agent && agent.store ? Object.values(agent.store).reduce((a,b)=>a+(b||0),0) : null);
      const skills = (agent && agent.memory && agent.memory.skills) ? agent.memory.skills : {};

      for (const task of tasks) {
        const target = task.data && task.data.meta && task.data.meta.target ? task.data.meta.target : null;
        let baseCost = Number.POSITIVE_INFINITY;

        try {
          if (spatial && agentPos && target) {
            const entry = spatial.computePath(agentPos, target, { ignoreCreeps: true });
            baseCost = (entry && typeof entry.cost === 'number') ? entry.cost : (entry.path ? entry.path.length : Number.POSITIVE_INFINITY);
          } else if (agentPos && target) {
            baseCost = Math.abs(agentPos.x - target.x) + Math.abs(agentPos.y - target.y);
          }

          // Availability penalty
          const reqEnergy = (task.data && task.data.meta && task.data.meta.requiredEnergy) || 0;
          const reqCarry = (task.data && task.data.meta && task.data.meta.requiredCarry) || 0;
          let availabilityPenalty = 0;
          if (reqEnergy && (energy === null || energy < reqEnergy)) availabilityPenalty += 1000;
          if (reqCarry && (carry === null || carry < reqCarry)) availabilityPenalty += 1000;

          const taskType = task.data && task.data.type ? task.data.type : 'generic';
          const requiredSkill = (task.data && task.data.meta && task.data.meta.requiredSkill) || task.data.requiredSkill || taskType;
          const agentSkillLevel = resolveAgentSkillLevel(skills, requiredSkill, skillAliases) || 0;
          const missingSkillPenalty = (agentSkillLevel <= 0) ? missingSkillPenaltyCfg : 0;
          const skillFactor = 1 / (1 + (agentSkillLevel * proficiencyScale));

          const typePenalty = typePenalties[taskType] || 1.0;

          let traffic = 0;
          if (spatial && target && typeof spatial.getTraffic === 'function') {
            try { traffic = spatial.getTraffic(target.roomName) || 0; } catch (e) { traffic = 0; }
          }

          const count = assignmentCounts[agentId] || 0;
          const balancePenalty = count * balanceWeight;

          const effective = (baseCost * pathWeight * typePenalty * typeWeight * skillFactor)
                           + (availabilityPenalty * availabilityWeight)
                           + (traffic * trafficWeightCfg)
                           + (missingSkillPenalty)
                           + (balancePenalty * balanceWeight)
                           - (agentSkillLevel * 0.01 * skillWeight);

          pairs.push({ agentId, task, cost: effective, baseCost, agentSkillLevel });
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

    // helper to remove existing assignment for agent
    const removeExistingAssignment = (agentId) => {
      // find current task assigned to agent
      for (const t of (wm.list('tasks') || [])) {
        if (t.data && t.data.assignee === agentId) {
          t.data.assignee = null;
          t.data.status = 'pending';
          wm.set('tasks', t);
        }
      }
      // remove assignment record
      for (const asn of (wm.list('assignments') || [])) {
        if (asn.data && asn.data.agentId === agentId) {
          if (wm.delete) wm.delete('assignments', asn.id);
        }
      }
    };

    // Preemption pre-pass: allow agents to be reallocated from current task to a better one
    for (const p of pairs) {
      const current = agentCurrent[p.agentId];
      if (!current) continue;
      const newPriority = (p.task && p.task.data && typeof p.task.data.priority === 'number') ? p.task.data.priority : 0;
      const currentPriority = current.priority || 0;
      if (p.task.data && p.task.data.status === 'assigned') continue; // skip already assigned tasks
      if ((p.cost + preemptionThreshold) < current.cost && newPriority > currentPriority) {
        // perform preemption immediately
        removeExistingAssignment(p.agentId);
        const prevTask = wm.get('tasks', current.taskId);
        if (prevTask) { prevTask.data.assignee = null; prevTask.data.status = 'pending'; wm.set('tasks', prevTask); }

        const assignment = { id: `assign_${p.task.id}_${p.agentId}_${Game ? Game.time : 0}`, createdTick: Game ? Game.time : 0, data: { taskId: p.task.id, agentId: p.agentId } };
        wm.set('assignments', assignment);
        p.task.data.assignee = p.agentId;
        p.task.data.status = 'assigned';
        wm.set('tasks', p.task);

        assignedAgents.add(p.agentId);
        assignedTasks.add(p.task.id);
        // block previous task from being reassigned this tick
        if (current && current.taskId) assignedTasks.add(current.taskId);
        assignments.push(assignment);
        // update counts and agentCurrent
        assignmentCounts[p.agentId] = (assignmentCounts[p.agentId] || 0) + 1;
        agentCurrent[p.agentId] = { taskId: p.task.id, cost: p.cost, priority: newPriority };
      }
    }


    for (const p of pairs) {
      const agentAssigned = assignedAgents.has(p.agentId);
      const taskAssigned = assignedTasks.has(p.task.id) || (p.task.data && p.task.data.assignee && p.task.data.assignee !== p.agentId);

      if (!agentAssigned && !taskAssigned && (!p.task.data.assignee || p.task.data.assignee === null)) {
        // free agent & free task -> assign
        const assignment = { id: `assign_${p.task.id}_${p.agentId}_${Game ? Game.time : 0}`, createdTick: Game ? Game.time : 0, data: { taskId: p.task.id, agentId: p.agentId } };
        wm.set('assignments', assignment);
        p.task.data.assignee = p.agentId;
        p.task.data.status = 'assigned';
        wm.set('tasks', p.task);
        assignedAgents.add(p.agentId);
        assignedTasks.add(p.task.id);
        // mark assigned tasks so preempted/old tasks aren't immediately reassigned
        // (preemption pass blocks previous tasks explicitly)
        assignments.push(assignment);
        // increment local count for balancing
        assignmentCounts[p.agentId] = (assignmentCounts[p.agentId] || 0) + 1;
        continue;
      }

      // if agent already has assignment, consider preemption: can this new task preempt existing one?
      const current = agentCurrent[p.agentId];
      if (current && !taskAssigned) {
        const currentPriority = current.priority || 0;
        const newPriority = (p.task && p.task.data && typeof p.task.data.priority === 'number') ? p.task.data.priority : 0;
        // allow preemption if new cost better by threshold and newPriority > currentPriority
        if ((p.cost + preemptionThreshold) < current.cost && newPriority > currentPriority) {
          // preempt: remove existing assignment and assign new
          removeExistingAssignment(p.agentId);
          // mark previous task as pending (agentCurrent stored taskId)
          const prevTask = wm.get('tasks', current.taskId);
          if (prevTask) { prevTask.data.assignee = null; prevTask.data.status = 'pending'; wm.set('tasks', prevTask); }

          const assignment = { id: `assign_${p.task.id}_${p.agentId}_${Game ? Game.time : 0}`, createdTick: Game ? Game.time : 0, data: { taskId: p.task.id, agentId: p.agentId } };
          wm.set('assignments', assignment);
          p.task.data.assignee = p.agentId;
          p.task.data.status = 'assigned';
          wm.set('tasks', p.task);

          assignedAgents.add(p.agentId);
          assignedTasks.add(p.task.id);
          assignments.push(assignment);
          // update agentCurrent entry
          agentCurrent[p.agentId] = { taskId: p.task.id, cost: p.cost, priority: newPriority };
        }
      }
    }

    this.metrics.assignments += assignments.length;
    return assignments;
  }


  getMetrics() {
    return Object.assign({}, this.metrics);
  }
}
