export default class SpawnManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.wm = kernel && kernel.has && kernel.has('workingMemory') ? kernel.get('workingMemory') : null;
    this.blueprints = {}; // name -> blueprint (object or function(meta) -> blueprint)
    this.queue = []; // array of spawn requests { id, blueprint, priority, meta, _enqueuedAt }
  }

  registerBlueprint(name, blueprint) {
    this.blueprints[name] = blueprint;
  }

  enqueue(request) {
    if (!request) return null;
    if (!request.id) request.id = `req-${Math.random().toString(36).slice(2,9)}`;
    if (typeof request.priority !== 'number') request.priority = 0;
    request._enqueuedAt = Date.now();
    this.queue.push(request);
    return request.id;
  }

  getQueue() {
    return this.queue.slice();
  }

  // Returns the highest-priority, oldest request
  peekNext() {
    if (!this.queue.length) return null;
    const sorted = this.queue.slice().sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a._enqueuedAt - b._enqueuedAt;
    });
    return sorted[0];
  }

  dequeueNext() {
    const next = this.peekNext();
    if (!next) return null;
    const idx = this.queue.findIndex((r) => r.id === next.id);
    if (idx >= 0) this.queue.splice(idx, 1);
    return next;
  }

  chooseBlueprint(request) {
    if (!request || !request.blueprint) return null;
    return this.blueprints[request.blueprint] || null;
  }

  // Auto-enqueue urgent logistics hauler spawn requests based on Goals and HaulerPools
  _autoEnqueueUrgentLogistics() {
    if (!this.wm || !this.wm.list) return;
    // Configurable thresholds
    const cfg = this.kernel && this.kernel.config ? this.kernel.config : {};
    const threshold = typeof cfg.haulerSpawnPriorityThreshold === 'number' ? cfg.haulerSpawnPriorityThreshold : 80;
    const maxPerGoal = typeof cfg.haulerSpawnMaxPerGoal === 'number' ? cfg.haulerSpawnMaxPerGoal : 1;

    const goals = this.wm.list('goals') || [];
    const spawns = this.wm.list('spawns') || [];

    for (const g of goals) {
      try {
        if (!g || !g.data) continue;
        if ((g.data.type || '').toLowerCase() !== 'transport') continue;
        const priority = Number(g.data.priority || 0);
        if (priority < threshold) continue;

        // Count existing spawn requests tied to this goal (in WM spawns or in local queue)
        const existing = spawns.filter(s => s.data && s.data.meta && s.data.meta && s.data.meta.originGoalId === g.id).length
                      + this.queue.filter(r => r.meta && r.meta.originGoalId === g.id).length;
        if (existing >= maxPerGoal) continue;

        // Derive rooms if possible
        const meta = g.data.meta || {};
        const sourceRoom = meta.fromRoom || meta.sourceRoom || meta.from || null;
        const targetRoom = meta.toRoom || meta.targetRoom || meta.to || null;

        // enqueue a hauler spawn request for this goal
        const req = {
          id: `hauler-req-${g.id}-${Math.random().toString(36).slice(2,6)}`,
          blueprint: 'hauler',
          priority: priority,
          meta: Object.assign({}, { sourceRoom, targetRoom, originGoalId: g.id })
        };
        this.enqueue(req);
      } catch (e) {
        // ignore per-goal errors
      }
    }

    // Auto-enqueue spawns for HaulerPools that need members
    try {
      const pools = this.wm.list('hauler_pools') || [];
      const poolPriority = typeof cfg.haulerPoolSpawnPriority === 'number' ? cfg.haulerPoolSpawnPriority : 90;
      const globalMaxPerPool = typeof cfg.haulerPoolSpawnMaxPerPool === 'number' ? cfg.haulerPoolSpawnMaxPerPool : null;

      for (const pool of pools) {
        try {
          if (!pool || !pool.jobId) continue;
          const poolMax = (pool.maxMembersPerPool && typeof pool.maxMembersPerPool === 'number') ? pool.maxMembersPerPool : (globalMaxPerPool || (this.kernel && this.kernel.config && this.kernel.config.haulerPoolMaxMembers) || 3);
          const currentMembers = (pool.members && Array.isArray(pool.members)) ? pool.members.length : 0;
          const needed = Math.max(0, poolMax - currentMembers);
          if (needed <= 0) continue;

          // Count existing spawn requests tied to this pool
          const existingForPool = spawns.filter(s => s.data && s.data.meta && s.data.meta.poolId === pool.id).length
                                + this.queue.filter(r => r.meta && r.meta.poolId === pool.id).length;
          const toCreate = Math.max(0, needed - existingForPool);
          for (let i = 0; i < toCreate; i++) {
            const req = {
              id: `hauler-pool-req-${pool.id}-${Math.random().toString(36).slice(2,6)}`,
              blueprint: 'hauler',
              priority: poolPriority,
              meta: Object.assign({}, { poolId: pool.id, originJobId: pool.jobId })
            };
            this.enqueue(req);
          }
        } catch (e) {
          // ignore pool-level errors
        }
      }
    } catch (e) {
      // ignore overall pool auto-enqueue failures
    }
  }

  // Reconcile WM spawn jobs against live creeps: mark spawned and notify hauler pools
  _reconcileSpawns() {
    if (!this.wm || !this.wm.list || !this.wm.get || !this.wm.set) return;
    try {
      const jobs = this.wm.list('spawns') || [];
      for (const job of jobs) {
        try {
          if (!job || !job.data) continue;
          const name = job.data && job.data.name;
          const status = job.data && job.data.status;
          if (!name) continue;
          // If creep exists and job not yet marked spawned, mark it
          if ((status !== 'spawned') && (typeof Game !== 'undefined') && Game.creeps && Game.creeps[name]) {
            job.data.status = 'spawned';
            job.data.spawnedAt = (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();
            if (this.wm && typeof this.wm.set === 'function') this.wm.set('spawns', job);

            // notify pool manager if this job was for a pool
            const meta = job.data.meta || {};
            const poolId = meta.poolId || null;
            if (poolId && this.kernel && this.kernel.has && this.kernel.has('haulerPool')) {
              try { this.kernel.get('haulerPool').assignMember(poolId, name); } catch (e) { /* ignore */ }
            }
          }
        } catch (e) {
          // ignore per-job errors
        }
      }
    } catch (e) {
      // ignore reconciliation failures
    }
  }

  // A lightweight tick that chooses the next spawn and returns the resolved blueprint
  // Does not attempt to use Game.spawns; it is intentionally side-effect free for unit tests.
  tick() {
    // reconcile pending spawn jobs with live creeps first
    try { this._reconcileSpawns(); } catch (e) { /* ignore */ }

    // auto-enqueue urgent haulers before resolving next request
    try { this._autoEnqueueUrgentLogistics(); } catch (e) { /* ignore */ }

    const next = this.peekNext();
    if (!next) return null;
    const bp = this.chooseBlueprint(next);
    if (!bp) return null;
    const resolved = typeof bp === 'function' ? bp(next.meta || {}, this.kernel) : bp;
    return { request: next, blueprint: resolved };
  }

  // Attempt to consume the next spawn request: persist a spawn job to WorkingMemory
  // Then try to request a spawn via kernel.spawn(job) if provided, otherwise attempt Game.spawns.spawnCreep.
  // Returns the persisted job object (with status and any attempt/result fields).
  spawnNext(options = {}) {
    const next = this.dequeueNext();
    if (!next) return null;

    const bpEntry = this.chooseBlueprint(next);
    if (!bpEntry) return null;
    const resolved = typeof bpEntry === 'function' ? bpEntry(next.meta || {}, this.kernel) : bpEntry;

    const name = (next.meta && next.meta.name) ? next.meta.name : `cr-${Math.random().toString(36).slice(2,6)}-${(Game && Game.time) ? Game.time : Date.now()%1000}`;
    const jobId = `spawnjob-${next.id}-${Math.random().toString(36).slice(2,6)}`;

    const job = {
      id: jobId,
      data: {
        requestId: next.id,
        blueprint: resolved,
        name,
        status: 'queued',
        priority: next.priority || 0,
        meta: next.meta || {},
        requestedAt: (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now()
      }
    };

    // persist job to working memory if available
    if (this.wm && typeof this.wm.set === 'function') {
      try { this.wm.set('spawns', job); } catch (e) { /* ignore WM failures */ }
    }

    // helper to notify pool manager if this job is for a pool
    const notifyPoolOnSpawn = (jobObj) => {
      try {
        if (!jobObj || !jobObj.data || !jobObj.data.meta) return;
        const meta = jobObj.data.meta || {};
        const poolId = meta.poolId || null;
        const creepName = jobObj.data.name || null;
        if (poolId && creepName && this.kernel && this.kernel.has && this.kernel.has('haulerPool')) {
          try { this.kernel.get('haulerPool').assignMember(poolId, creepName); } catch (e) { /* ignore pool errors */ }
        }
      } catch (e) {
        // ignore notifier errors
      }
    };

    // If kernel provides a spawn API, call it and record the result
    try {
      if (this.kernel && typeof this.kernel.spawn === 'function') {
        const res = this.kernel.spawn(job.data);
        job.data.status = 'requested';
        job.data.result = res;
        if (this.wm && typeof this.wm.set === 'function') this.wm.set('spawns', job);
        // Notify pool manager if applicable (kernel.spawn may have created a spawn request)
        try { notifyPoolOnSpawn(job); } catch (e) { /* ignore */ }
        return job;
      }
    } catch (e) {
      job.data.status = 'error';
      job.data.error = e.message;
      if (this.wm && typeof this.wm.set === 'function') this.wm.set('spawns', job);
      return job;
    }

    // Otherwise, attempt to use Game.spawns directly
    try {
      if (typeof Game !== 'undefined' && Game.spawns) {
        for (const sName of Object.keys(Game.spawns)) {
          const spawn = Game.spawns[sName];
          if (spawn && typeof spawn.spawnCreep === 'function') {
            const body = resolved.body || resolved;
            const spawnName = name;
            const opts = options || {};
            const code = spawn.spawnCreep(body, spawnName, opts);
            job.data.attempt = { spawn: sName, result: code };
            job.data.status = (code === 0 || code === 'OK') ? 'spawning' : 'failed';
            job.data.result = code;
            if (this.wm && typeof this.wm.set === 'function') this.wm.set('spawns', job);
            // If spawn was accepted (spawning), notify pool manager with expected name
            try { notifyPoolOnSpawn(job); } catch (e) { /* ignore */ }
            return job;
          }
        }
      }
    } catch (e) {
      job.data.status = 'error';
      job.data.error = e.message;
      if (this.wm && typeof this.wm.set === 'function') this.wm.set('spawns', job);
      return job;
    }

    // Persisted but not executed: leave as queued
    return job;
  }
}
