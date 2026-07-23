export default class LinkCoordinator {
  constructor(kernel) {
    this.kernel = kernel;
    this.wm = kernel && kernel.has && kernel.has('workingMemory') ? kernel.get('workingMemory') : null;
    this.linkManager = kernel && kernel.has && kernel.has('linkManager') ? kernel.get('linkManager') : null;
    this.cfg = (kernel && kernel.config) || {};
    this.batchMax = this.cfg.linkBatchMaxAmount || 2000; // max amount per link batch
    this.minBatch = this.cfg.linkMinBatchAmount || 50;    // min amount to create a batch
  }

  _now() { return (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now(); }

  tick() {
    if (!this.wm || !this.wm.list || !this.wm.set || !this.wm.get) return [];
    const createdTasks = [];

    // gather pending link_transfer logistics jobs
    const jobs = (this.wm.list('logistics') || []).filter(j => j && j.data && j.data.type === 'link_transfer' && j.data.status === 'pending');

    // group by source link
    const bySrc = {};
    for (const j of jobs) {
      const src = j.data.from;
      if (!src) continue;
      bySrc[src] = bySrc[src] || [];
      bySrc[src].push(j);
    }

    for (const src in bySrc) {
      try {
        const srcLink = this.wm.get('links', src) || (this.wm.list('links') || []).find(l => l.id === src) || null;
        const lmStatus = this.linkManager && this.linkManager.status && this.linkManager.status[src] ? this.linkManager.status[src] : null;
        const cooldown = srcLink && srcLink.data && typeof srcLink.data.cooldown === 'number' ? srcLink.data.cooldown : (lmStatus && typeof lmStatus.cooldown === 'number' ? lmStatus.cooldown : 0);
        const energy = srcLink && srcLink.data && typeof srcLink.data.energy === 'number' ? srcLink.data.energy : (srcLink && srcLink.data && srcLink.data.capacity ? srcLink.data.capacity : this.batchMax);
        if (cooldown > 0) continue; // wait until link free

        const candidates = bySrc[src];
        // sort by createdAt to batch oldest first
        candidates.sort((a,b) => (a.data.createdAt||0) - (b.data.createdAt||0));

        let remainingCap = Math.min(this.batchMax, energy);
        const components = [];
        for (const c of candidates) {
          const amt = c.data && (c.data.amount || c.data.amountRemaining || 0);
          if (!amt || amt <= 0) continue;
          if (components.length > 0 && remainingCap <= 0) break;
          const take = Math.min(amt, remainingCap);
          if (take <= 0) continue;
          components.push({ jobId: c.id, amount: take, to: c.data.to });
          remainingCap -= take;
        }

        const total = components.reduce((s, x) => s + x.amount, 0);
        if (total < this.minBatch) continue; // don't schedule too small batches

        // Create aggregated task for this batch
        const taskId = `task-link-batch-${src}-${this._now()}`;
        const task = {
          id: taskId,
          data: {
            type: 'link_transfer',
            status: 'pending',
            meta: { components, from: src, amount: total, remaining: total }
          }
        };
        this.wm.set('tasks', task);
        createdTasks.push(task);

        // mark constituent jobs as scheduled and attach scheduledTask
        for (const comp of components) {
          try {
            const child = this.wm.get('logistics', comp.jobId);
            if (child && child.data) {
              child.data.status = 'scheduled';
              child.data.meta = child.data.meta || {};
              child.data.meta.scheduledTask = taskId;
              this.wm.set('logistics', child);
            }
          } catch (e) { /* ignore per-job */ }
        }

      } catch (e) {
        // ignore per-src failures
      }
    }

    return createdTasks;
  }
}
