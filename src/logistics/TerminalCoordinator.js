export default class TerminalCoordinator {
  constructor(kernel) {
    this.kernel = kernel;
    this.wm = kernel && kernel.has && kernel.has('workingMemory') ? kernel.get('workingMemory') : null;
    this.cfg = (kernel && kernel.config) || {};
    this.batchMax = this.cfg.terminalBatchMaxAmount || 10000;
    this.minBatch = this.cfg.terminalMinBatchAmount || 100;
  }

  _now() { return (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now(); }

  tick() {
    if (!this.wm || !this.wm.list || !this.wm.set || !this.wm.get) return [];
    const createdTasks = [];

    // gather pending terminal_transfer logistics jobs
    const jobs = (this.wm.list('logistics') || []).filter(j => j && j.data && j.data.type === 'terminal_transfer' && j.data.status === 'pending');

    // group by source terminal
    const bySrc = {};
    for (const j of jobs) {
      const src = j.data.from;
      if (!src) continue;
      bySrc[src] = bySrc[src] || [];
      bySrc[src].push(j);
    }

    for (const src in bySrc) {
      try {
        const srcTerm = this.wm.get('terminals', src) || (this.wm.list('terminals') || []).find(t => t.id === src);
        if (!srcTerm || !srcTerm.data) continue;
        const cooldown = typeof srcTerm.data.cooldown === 'number' ? srcTerm.data.cooldown : 0;
        const energy = typeof srcTerm.data.energy === 'number' ? srcTerm.data.energy : (srcTerm.data && srcTerm.data.capacity ? srcTerm.data.capacity : this.batchMax);
        if (cooldown > 0) continue; // wait until terminal free

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
        const taskId = `task-terminal-batch-${src}-${this._now()}`;
        const task = {
          id: taskId,
          data: {
            type: 'terminal_transfer',
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
