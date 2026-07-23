export default class HaulerManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.wm = kernel && kernel.has && kernel.has('workingMemory') ? kernel.get('workingMemory') : null;
    // thresholds
    this.containerFillThreshold = 800; // energy above which to create transfer jobs
  }

  _computePriority(sourceRoom, destRoom, amount = 0) {
    // Default priority levels returned as strings: 'low', 'medium', 'high'
    if (!sourceRoom || !destRoom) return 'medium';

    if (sourceRoom !== destRoom) {
      try {
        const lm = this.kernel && this.kernel.has && this.kernel.has('linkManager') ? this.kernel.get('linkManager') : null;
        if (lm && typeof lm.getRouteEfficiency === 'function') {
          const eff = lm.getRouteEfficiency(sourceRoom, destRoom);
          if (eff < 0.6) return 'high';
          if (eff < 0.8) return 'medium';
          return 'medium';
        }
      } catch (e) {
        return 'high';
      }
      return 'high';
    }

    if (amount >= 800) return 'medium';
    return 'low';
  }

  _priorityToNumber(p) {
    if (typeof p === 'number') return p;
    switch (p) {
      case 'high': return 100;
      case 'medium': return 50;
      case 'low': return 10;
      default: return 50;
    }
  }

  _nowTick() {
    return (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();
  }

  // reconcile WM spawn jobs: when a creep appears, assign it to pool/job if applicable
  _reconcileSpawnedCreeps() {
    if (!this.wm || !this.wm.list || !this.wm.get || !this.wm.set) return;
    try {
      const spawns = this.wm.list('spawns') || [];
      for (const s of spawns) {
        try {
          if (!s || !s.data) continue;
          const name = s.data && s.data.name;
          const status = s.data && s.data.status;
          const meta = s.data && s.data.meta ? s.data.meta : {};
          if (!name || status !== 'spawned') continue;

          // If assigned to a pool, ensure pool membership
          const poolId = meta.poolId || null;
          if (poolId && this.kernel && this.kernel.has && this.kernel.has('haulerPool')) {
            try { this.kernel.get('haulerPool').assignMember(poolId, name); } catch (e) { /* ignore */ }
          }

          // If this spawn was created for a specific job/goal, assign creep to that logistics job
          const originJobId = meta.originJobId || meta.jobId || null;
          if (originJobId) {
            // try to find logistics job in WM
            const lj = this.wm.get('logistics', originJobId) || (this.wm.list('logistics') || []).find(j => j.id === originJobId);
            if (lj && lj.data) {
              // assign if pending
              if (!lj.data.assignee || lj.data.assignee === null) {
                lj.data.assignee = name;
                lj.data.status = 'assigned';
                lj.data.assignedAt = (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();
                this.wm.set('logistics', lj);

                // derive expected carry capacity from spawn job blueprint/meta and set creep memory hint
                try {
                  const expected = (s && s.data && s.data.meta && s.data.meta.expectedCarryCapacity) || (s && s.data && s.data.blueprint && s.data.blueprint.meta && s.data.blueprint.meta && s.data.blueprint.meta.expectedCarryCapacity) || (s && s.data && s.data.blueprint && s.data.blueprint.info && s.data.blueprint.info.carryParts ? s.data.blueprint.info.carryParts * 50 : null);
                  if (expected && Game && Game.creeps && Game.creeps[name]) {
                    Game.creeps[name].memory = Game.creeps[name].memory || {};
                    Game.creeps[name].memory.carryCapacity = expected;
                  }
                } catch (e) { /* ignore */ }

                // create a concrete task for this assignee so Scheduler/AgentRuntime can act
                try {
                  const taskId = `task-${lj.id}-${name}`;
                  const priorityNumeric = typeof lj.data.priority === 'number' ? lj.data.priority : this._priorityToNumber(lj.data.priority || 'medium');
                  const task = {
                    id: taskId,
                    data: {
                      type: 'transfer',
                      assignee: name,
                      status: 'assigned',
                      priority: priorityNumeric,
                      meta: Object.assign({}, { jobId: lj.id, target: { id: lj.data.to, room: (lj.data && lj.data.toRoom) || null }, requiredCarry: lj.data.amount || 0, amount: lj.data.amount || lj.data.amountTotal || 0 })
                    }
                  };
                  // persist task
                  this.wm.set('tasks', task);
                } catch (e) {
                  // ignore task creation errors
                }
              }
            }
          }
        } catch (e) {
          // ignore per-spawn errors
        }
      }
    } catch (e) {
      // ignore reconciliation failures
    }
  }

  // Ensure pool members have per-member tasks that split the pool amount
  _ensurePoolTasks() {
    if (!this.wm || !this.wm.list || !this.wm.set || !this.wm.get) return;
    try {
      const pools = this.wm.list('hauler_pools') || [];
      for (const pool of pools) {
        try {
          if (!pool || !pool.jobId) continue;
          const members = (pool.members && Array.isArray(pool.members)) ? pool.members.map(m => m.id) : [];
          if (members.length === 0) continue;

          const job = this.wm.get('logistics', pool.jobId) || (this.wm.list('logistics') || []).find(j => j.id === pool.jobId);
          if (!job || !job.data) continue;

          // remaining amount to split
          const remaining = (typeof pool.amountRemaining === 'number') ? pool.amountRemaining : (typeof job.data.amountRemaining === 'number' ? job.data.amountRemaining : (job.data.amount || job.data.amountTotal || 0));
          if (remaining <= 0) {
            // mark pool complete and ensure member tasks are done
            pool.status = 'complete';
            this.wm.set('hauler_pools', pool);
            for (const mid of members) {
              const tid = `task-${pool.jobId}-${mid}`;
              const t = this.wm.get('tasks', tid);
              if (t && t.data && t.data.status !== 'done') {
                t.data.status = 'done';
                this.wm.set('tasks', t);
              }
            }
            continue;
          }

          // Distribute remaining evenly among current members each tick.
          // This ensures dynamic rebalance when members join/leave or when pool.amountRemaining changes.
          const n = members.length;
          const base = Math.floor(remaining / n);
          let rem = remaining - base * n;

          // Build allocations array to ensure sum equals remaining
          const allocations = [];
          for (let i = 0; i < n; i++) {
            const alloc = base + (rem > 0 ? 1 : 0);
            if (rem > 0) rem -= 1;
            allocations.push(alloc);
          }

          for (let i = 0; i < n; i++) {
            const mid = members[i];
            const alloc = allocations[i];

            const tid = `task-${pool.jobId}-${mid}`;
            const existing = this.wm.get('tasks', tid);

            // compute completed work for this member (if any)
            let completed = 0;
            if (existing && existing.data && existing.data.meta) {
              const prevAmount = typeof existing.data.meta.amount === 'number' ? existing.data.meta.amount : 0;
              const prevRemaining = typeof existing.data.meta.remaining === 'number' ? existing.data.meta.remaining : prevAmount;
              completed = Math.max(0, prevAmount - prevRemaining);
            }

            if (alloc <= 0) {
              // If no allocation for this member, mark existing task done/skip
              if (existing && existing.data && existing.data.status !== 'done') {
                existing.data.status = 'done';
                if (existing.data.meta) existing.data.meta.remaining = 0;
                this.wm.set('tasks', existing);
              }
              continue;
            }

            // New remaining for this member is alloc; amount becomes completed + alloc
            const newRemaining = alloc;
            const newAmount = completed + newRemaining;

            if (existing && existing.data) {
              if (existing.data.status !== 'done') {
                existing.data.meta = existing.data.meta || {};
                existing.data.meta.amount = newAmount;
                existing.data.meta.remaining = newRemaining;
                existing.data.assignee = mid;
                existing.data.status = existing.data.status || 'assigned';
                this.wm.set('tasks', existing);
              }
            } else {
              const priorityNumeric = typeof job.data.priority === 'number' ? job.data.priority : this._priorityToNumber(job.data.priority || 'medium');
              const task = {
                id: tid,
                data: {
                  type: 'transfer',
                  assignee: mid,
                  status: 'assigned',
                  priority: priorityNumeric,
                  meta: { jobId: pool.jobId, amount: newAmount, remaining: newRemaining, from: job.data.from, to: job.data.to }
                }
              };
              this.wm.set('tasks', task);
            }
          }

          // Mark any leftover tasks for this job whose assignee is no longer in members as done
          try {
            const allTasks = (this.wm.list('tasks') || []);
            for (const t of allTasks) {
              if (!t || !t.data || !t.id) continue;
              if (!t.id.startsWith(`task-${pool.jobId}-`)) continue;
              const assignee = t.data.assignee;
              if (!assignee) continue;
              if (!members.includes(assignee) && t.data.status !== 'done') {
                t.data.status = 'done';
                if (t.data.meta) t.data.meta.remaining = 0;
                this.wm.set('tasks', t);
              }
            }
          } catch (e) { /* ignore */ }
        } catch (e) {
          // ignore per-pool errors
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // simple scan: expects workingMemory.collections.containers entries with { id, data: { energy, pos, room } }
  tick() {
    // reconcile spawned creeps first
    try { this._reconcileSpawnedCreeps(); } catch (e) { /* ignore */ }

    // ensure pool tasks exist and are allocated
    try { this._ensurePoolTasks(); } catch (e) { /* ignore */ }

    if (!this.wm) return [];
    const jobs = [];

    const containers = this.wm.list('containers') || [];
    const storages = this.wm.list('storages') || [];

    for (const c of containers) {
      const energy = (c.data && c.data.energy) || 0;
      if (energy >= this.containerFillThreshold) {
        // pick nearest storage (naive: first)
        const dest = storages[0] || null;
        const amount = Math.min(energy, 800);
        const sourceRoom = c.data && c.data.room;
        const destRoom = dest && dest.data && dest.data.room;
        const job = {
          id: `log-${c.id}-${Math.random().toString(36).slice(2,6)}`,
          data: {
            type: 'transfer',
            from: c.id,
            to: dest ? dest.id : null,
            amount,
            priority: this._computePriority(sourceRoom, destRoom, amount),
            status: 'pending',
            createdAt: this._nowTick()
          }
        };
        // persist
        try { this.wm.set('logistics', job); } catch (e) { /* ignore */ }

        // Also create a corresponding Goal in working memory so DecisionEngine/TaskFactory can create tasks
        try {
          const priorityStr = job.data.priority || 'medium';
          const numeric = this._priorityToNumber(priorityStr);
          const goal = {
            id: `goal-${job.id}`,
            data: {
              type: 'transport',
              priority: numeric,
              createdFrom: job.id,
              meta: { jobId: job.id, from: job.data.from, to: job.data.to, amount: job.data.amount }
            }
          };
          this.wm.set('goals', goal);
        } catch (e) { /* ignore */ }

        jobs.push(job);
      }
    }

    return jobs;
  }

  // Assign a creep to a job
  assignHauler(jobId, creepId) {
    if (!this.wm) return null;
    const job = this.wm.get('logistics', jobId);
    if (!job) return null;
    job.data.assignee = creepId;
    job.data.status = 'assigned';
    job.data.assignedAt = this._nowTick();
    this.wm.set('logistics', job);
    return job;
  }

  // List pending jobs
  listPending() {
    if (!this.wm) return [];
    return (this.wm.list('logistics') || []).filter(j => j.data && j.data.status === 'pending');
  }
}
