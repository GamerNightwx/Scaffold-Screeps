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

  // A lightweight tick that chooses the next spawn and returns the resolved blueprint
  // Does not attempt to use Game.spawns; it is intentionally side-effect free for unit tests.
  tick() {
    const next = this.peekNext();
    if (!next) return null;
    const bp = this.chooseBlueprint(next);
    if (!bp) return null;
    const resolved = typeof bp === 'function' ? bp(next.meta || {}) : bp;
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

    // If kernel provides a spawn API, call it and record the result
    try {
      if (this.kernel && typeof this.kernel.spawn === 'function') {
        const res = this.kernel.spawn(job.data);
        job.data.status = 'requested';
        job.data.result = res;
        if (this.wm && typeof this.wm.set === 'function') this.wm.set('spawns', job);
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
