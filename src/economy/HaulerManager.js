export default class HaulerManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.wm = kernel && kernel.has && kernel.has('workingMemory') ? kernel.get('workingMemory') : null;
    // thresholds
    this.containerFillThreshold = 800; // energy above which to create transfer jobs
  }

  _nowTick() {
    return (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();
  }

  // simple scan: expects workingMemory.collections.containers entries with { id, data: { energy, pos, room } }
  tick() {
    if (!this.wm) return [];
    const jobs = [];

    const containers = this.wm.list('containers') || [];
    const storages = this.wm.list('storages') || [];

    for (const c of containers) {
      const energy = (c.data && c.data.energy) || 0;
      if (energy >= this.containerFillThreshold) {
        // pick nearest storage (naive: first)
        const dest = storages[0] || null;
        const job = {
          id: `log-${c.id}-${Math.random().toString(36).slice(2,6)}`,
          data: {
            type: 'transfer',
            from: c.id,
            to: dest ? dest.id : null,
            amount: Math.min(energy, 800),
            status: 'pending',
            createdAt: this._nowTick()
          }
        };
        // persist
        try { this.wm.set('logistics', job); } catch (e) { /* ignore */ }
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
