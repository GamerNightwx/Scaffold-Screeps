/**
 * TaskEngine
 * - Manages lifecycle of tasks stored in WorkingMemory 'tasks'
 * - Basic states: pending -> in_progress -> done
 * - Supports dependencies via task.data.meta.dependsOn = ['task_x']
 */
export default class TaskEngine {
  constructor(kernel) {
    this.kernel = kernel;
  }

  _wm() {
    if (!this.kernel.has('workingMemory')) return null;
    return this.kernel.get('workingMemory');
  }

  tick() {
    const wm = this._wm();
    if (!wm) return;

    const tasks = wm.list('tasks');
    if (!tasks || tasks.length === 0) return;

    // Validate and progress tasks
    for (const t of tasks) {
      try {
        this._ensureState(t, wm);
      } catch (e) {
        // mark invalid
        t.valid = false;
        wm.set('tasks', t);
      }
    }
  }

  _ensureState(task, wm) {
    const prevStatus = task.data.status;
    const status = task.data.status;
    const type = (task.data.type || 'generic').toLowerCase();

    if (status === 'pending') {
      const deps = (task.data.meta && task.data.meta.dependsOn) || [];
      const depSatisfied = deps.every(did => {
        const dep = wm.get('tasks', did);
        return dep && dep.data && dep.data.status === 'done';
      });

      if (depSatisfied) {
        task.data.status = 'in_progress';
        // initialize runtime fields if missing
        if (!task.data.meta) task.data.meta = {};
        if (typeof task.data.meta.startedTick === 'undefined') task.data.meta.startedTick = Game ? Game.time : Date.now();
        wm.set('tasks', task);

        // link assignee to logistics job if present
        try {
          this._assignTaskToJob(task, wm);
          // fallback: try inferring job id from task id and assign if still missing
          if (task.data && task.data.assignee) {
            const meta = task.data.meta || {};
            let jobId = meta.parentJob || meta.jobId || null;
            if (!jobId && task.id && task.id.startsWith('task-')) {
              let suffix = task.id.slice(5);
              while (suffix) {
                const lj = wm.get('logistics', suffix);
                if (lj) { jobId = suffix; break; }
                const idx = suffix.lastIndexOf('-');
                if (idx === -1) break;
                suffix = suffix.slice(0, idx);
              }
            }
            if (jobId) {
              try {
                const job = wm.get('logistics', jobId);
                if (job && job.data && !job.data.assignee) {
                  job.data.assignee = task.data.assignee;
                  job.data.assignedAt = (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();
                  job.data.status = job.data.status === 'pending' ? 'assigned' : job.data.status;
                  wm.set('logistics', job);
                }
              } catch (e) { /* ignore */ }
            }
          }

        } catch (e) { /* ignore */ }

        return;
      }
    }

    if (status === 'in_progress') {
      // dispatch to type-specific handler
      const handler = this._getHandlerForType(type);

      // capture pre-handler remaining to compute delta
      const preMeta = task.data.meta || {};
      const oldRemaining = (typeof preMeta.remaining === 'number') ? preMeta.remaining : (typeof task.data.amount === 'number' ? task.data.amount : 0);

      if (handler) {
        handler.call(this, task, wm);
      } else {
        // fallback generic progression
        if (task.data.meta && typeof task.data.meta.duration === 'number' && task.data.meta.duration > 1) {
          task.data.meta.duration -= 1;
          wm.set('tasks', task);
        } else {
          task.data.status = 'done';
          wm.set('tasks', task);
        }
      }

      // after handler, compute delta progress and reconcile
      try {
        const updated = wm.get('tasks', task.id) || task;
        const postMeta = (updated.data && updated.data.meta) || {};
        const newRemaining = (typeof postMeta.remaining === 'number') ? postMeta.remaining : (typeof updated.data.amount === 'number' ? updated.data.amount : 0);
        const delta = Math.max(0, (oldRemaining - newRemaining));
        if (delta > 0) {
          this._reconcileProgress(updated, delta, wm);
        }

        // If task transitioned to done on this tick, run final reconciliation
        if (prevStatus !== 'done' && updated && updated.data && updated.data.status === 'done') {
          this._onTaskDone(updated, wm);
        }
      } catch (e) {
        // ignore reconciliation failures
      }
    }

  }

  _getHandlerForType(type) {
    const map = {
      harvest: this._handleHarvest,
      build: this._handleBuild,
      repair: this._handleRepair,
      upgrade: this._handleUpgrade,
      transport: this._handleTransport,
      transfer: this._handleTransport,
      carry: this._handleTransport,
      terminal_transfer: this._handleTerminalTransfer,
      claim: this._handleClaimReserve,
      reserve: this._handleClaimReserve,
      dismantle: this._handleDismantle,
      defend: this._handleDefend,
      scout: this._handleScout
    };
    return map[type] || null;
  }

  // Handlers:
  _handleHarvest(task, wm) {
    const m = task.data.meta || {};
    if (typeof m.remaining !== 'number') m.remaining = typeof m.amount === 'number' ? m.amount : 0;
    // simulate one tick harvest
    m.remaining = Math.max(0, m.remaining - 10);
    task.data.meta = m;
    if (m.remaining <= 0) task.data.status = 'done';
    wm.set('tasks', task);
  }

  _handleBuild(task, wm) {
    const m = task.data.meta || {};
    if (typeof m.progress !== 'number') m.progress = 0;
    m.progress += 20; // simulate progress
    task.data.meta = m;
    if (m.progress >= 100) task.data.status = 'done';
    wm.set('tasks', task);
  }

  _handleRepair(task, wm) {
    const m = task.data.meta || {};
    if (typeof m.health !== 'number') m.health = 0;
    m.health = Math.max(0, m.health - 20); // reduce damage remaining
    task.data.meta = m;
    if (m.health <= 0) task.data.status = 'done';
    wm.set('tasks', task);
  }

  _handleUpgrade(task, wm) {
    const m = task.data.meta || {};
    if (typeof m.remaining !== 'number') m.remaining = typeof m.ticks === 'number' ? m.ticks : 0;
    m.remaining = Math.max(0, m.remaining - 1);
    task.data.meta = m;
    if (m.remaining <= 0) task.data.status = 'done';
    wm.set('tasks', task);
  }

  _handleTransport(task, wm) {
    const m = task.data.meta || {};
    if (typeof m.remaining !== 'number') m.remaining = typeof m.amount === 'number' ? m.amount : 0;
    m.remaining = Math.max(0, m.remaining - 25);
    task.data.meta = m;
    if (m.remaining <= 0) task.data.status = 'done';
    wm.set('tasks', task);
  }

  // Simulate terminal-to-terminal transfer (hop). Uses kernel.config.terminalTransferRate if present.
  _handleTerminalTransfer(task, wm) {
    const m = task.data.meta || {};
    if (typeof m.remaining !== 'number') m.remaining = typeof task.data.amount === 'number' ? task.data.amount : (m.amount || 0);
    const rate = (this.kernel && this.kernel.config && this.kernel.config.terminalTransferRate) ? this.kernel.config.terminalTransferRate : 1000;
    m.remaining = Math.max(0, m.remaining - rate);
    task.data.meta = m;
    if (m.remaining <= 0) task.data.status = 'done';
    wm.set('tasks', task);
  }

  _handleClaimReserve(task, wm) {
    // claim/reserve are typically one-shot; mark done
    task.data.status = 'done';
    wm.set('tasks', task);
  }

  _handleDismantle(task, wm) {
    // simulate rapid dismantle
    task.data.status = 'done';
    wm.set('tasks', task);
  }

  _handleDefend(task, wm) {
    const m = task.data.meta || {};
    if (typeof m.remaining !== 'number') m.remaining = typeof m.duration === 'number' ? m.duration : 0;
    m.remaining = Math.max(0, m.remaining - 1);
    task.data.meta = m;
    if (m.remaining <= 0) task.data.status = 'done';
    wm.set('tasks', task);
  }

  _handleScout(task, wm) {
    const m = task.data.meta || {};
    if (typeof m.remaining !== 'number') m.remaining = typeof m.duration === 'number' ? m.duration : 0;
    m.remaining = Math.max(0, m.remaining - 1);
    task.data.meta = m;
    if (m.remaining <= 0) task.data.status = 'done';
    wm.set('tasks', task);
  }

  createTask(task) {
    const wm = this._wm();
    if (!wm) return null;
    wm.set('tasks', task);
    return task;
  }

  // Called when a task finishes; reconcile with logistics jobs and parent jobs
  _assignTaskToJob(task, wm) {
    if (!task || !task.data) return;
    const meta = task.data.meta || {};
    const assignee = task.data.assignee || null;
    const jobId = meta.parentJob || meta.jobId || null;
    if (!jobId || !assignee) return;
    try {
      const job = wm.get('logistics', jobId);
      if (job && job.data) {
        job.data.assignee = assignee;
        job.data.assignedAt = (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();
        job.data.status = job.data.status === 'pending' ? 'assigned' : job.data.status;
        // best-effort: update internal structure directly if available
        try { if (wm._c && wm._c.logistics && wm._c.logistics[jobId]) { wm._c.logistics[jobId].data = job.data; } } catch (e) {}
        wm.set('logistics', job);
      }
    } catch (e) { /* ignore */ }
  }

  _reconcileProgress(task, delta, wm) {
    if (!task || !task.data || !delta) return;
    const meta = task.data.meta || {};

    // If this is an aggregated batch with components, distribute delta across components
    if (Array.isArray(meta.components) && meta.components.length > 0) {
      let remainingDelta = delta;
      for (const comp of meta.components) {
        if (remainingDelta <= 0) break;
        try {
          const child = wm.get('logistics', comp.jobId);
          if (!child || !child.data) continue;
          // determine child's remaining
          const childRemaining = typeof child.data.amountRemaining === 'number' ? child.data.amountRemaining : (child.data.amount || comp.amount || 0);
          const applied = Math.min(childRemaining, remainingDelta);
          if (applied <= 0) continue;
          // subtract
          if (typeof child.data.amountRemaining === 'number') child.data.amountRemaining = Math.max(0, child.data.amountRemaining - applied);
          else child.data.amountRemaining = Math.max(0, (child.data.amount || 0) - applied);
          child.data.status = child.data.amountRemaining <= 0 ? 'done' : (child.data.status === 'pending' ? 'in_progress' : child.data.status);
          wm.set('logistics', child);

          // deduct energy & set cooldown on source terminal for this applied amount
          try {
            const term = wm.get('terminals', child.data.from);
            if (term && term.data) {
              const cap = typeof term.data.capacity === 'number' ? term.data.capacity : (term.data.energy || 0);
              term.data.energy = Math.max(0, (typeof term.data.energy === 'number' ? term.data.energy : cap) - applied);
              const cd = (this.kernel && this.kernel.config && this.kernel.config.terminalCooldownTicks) ? this.kernel.config.terminalCooldownTicks : 10;
              term.data.cooldown = cd;
              wm.set('terminals', term);
            }
          } catch (e) { /* ignore energy deduction */ }

          // If this child is a link_transfer, record the transfer on LinkManager
          try {
            const lm = (this.kernel && this.kernel.has && this.kernel.has('linkManager')) ? this.kernel.get('linkManager') : null;
            if (lm && child.data && child.data.type === 'link_transfer' && typeof lm.recordTransfer === 'function') {
              try { lm.recordTransfer(child.data.from, applied); } catch (e) { /* ignore */ }
            }
          } catch (e) { /* ignore link recording */ }

          // propagate to parent if any
          const parentJobId = child.data && child.data.meta && child.data.meta.parentJob;
          if (parentJobId) {
            const parent = wm.get('logistics', parentJobId);
            if (parent && parent.data) {
              if (typeof parent.data.amountRemaining === 'number') parent.data.amountRemaining = Math.max(0, parent.data.amountRemaining - applied);
              else parent.data.amountRemaining = Math.max(0, (parent.data.amount || 0) - applied);
              parent.data.status = parent.data.amountRemaining <= 0 ? 'done' : (parent.data.status === 'pending' ? 'in_progress' : parent.data.status);
              wm.set('logistics', parent);
            }
          }

          remainingDelta -= applied;
        } catch (e) { /* ignore per-component */ }
      }
      return;
    }

    // fallback: single job inference (existing behavior)
    let jobId = meta.parentJob || meta.jobId || null;
    if (!jobId) {
      if (task.id && task.id.startsWith('task-')) {
        let suffix = task.id.slice(5);
        while (suffix) {
          const lj = wm.get('logistics', suffix);
          if (lj) { jobId = suffix; break; }
          const idx = suffix.lastIndexOf('-');
          if (idx === -1) break;
          suffix = suffix.slice(0, idx);
        }
      }
    }
    if (!jobId) return;

    try {
      const job = wm.get('logistics', jobId);
      if (job && job.data) {
        if (typeof job.data.amountRemaining === 'number') {
          job.data.amountRemaining = Math.max(0, job.data.amountRemaining - delta);
        } else if (typeof job.data.amount === 'number') {
          job.data.amountRemaining = Math.max(0, (job.data.amount || 0) - delta);
        }
        job.data.status = job.data.status === 'pending' ? 'in_progress' : job.data.status;
        // propagate assignee if task has one
        if (task.data.assignee) {
          job.data.assignee = task.data.assignee;
          job.data.assignedAt = (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();
        }
        wm.set('logistics', job);

        // If this job is a link_transfer, record the transfer on LinkManager
        try {
          const lm = (this.kernel && this.kernel.has && this.kernel.has('linkManager')) ? this.kernel.get('linkManager') : null;
          if (lm && job.data && job.data.type === 'link_transfer' && typeof lm.recordTransfer === 'function') {
            try { lm.recordTransfer(job.data.from, delta); } catch (e) { /* ignore */ }
          }
        } catch (e) { /* ignore link recording */ }

        const parentJobId = job.data && job.data.meta && job.data.meta.parentJob;
        if (parentJobId) {
          const parent = wm.get('logistics', parentJobId);
          if (parent && parent.data) {
            if (typeof parent.data.amountRemaining === 'number') {
              parent.data.amountRemaining = Math.max(0, parent.data.amountRemaining - delta);
            } else if (typeof parent.data.amount === 'number') {
              parent.data.amountRemaining = Math.max(0, (parent.data.amount || 0) - delta);
            }
            parent.data.status = parent.data.status === 'pending' ? 'in_progress' : parent.data.status;
            if (task.data.assignee) {
              parent.data.assignee = task.data.assignee;
              parent.data.assignedAt = (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();
            }
            wm.set('logistics', parent);
          }
        }
      }
    } catch (e) { /* ignore */ }
  }

  _onTaskDone(task, wm) {
    if (!task || !task.data) return;
    const meta = task.data.meta || {};
    let moved = 0;
    if (typeof meta.amount === 'number') moved = meta.amount;
    else if (typeof task.data.amount === 'number') moved = task.data.amount;

    // Determine logistics job id
    let jobId = meta.parentJob || meta.jobId || null;
    if (!jobId) {
      // Try to infer from task id: strip 'task-'
      if (task.id && task.id.startsWith('task-')) {
        let suffix = task.id.slice(5);
        // try longest match in logistics
        while (suffix) {
          const lj = wm.get('logistics', suffix);
          if (lj) { jobId = suffix; break; }
          // remove trailing -segment
          const idx = suffix.lastIndexOf('-');
          if (idx === -1) break;
          suffix = suffix.slice(0, idx);
        }
      }
    }

    if (!jobId) return; // nothing to reconcile

    try {
      const job = wm.get('logistics', jobId);
      if (job && job.data) {
        // update amountRemaining if present
        if (typeof job.data.amountRemaining === 'number') {
          job.data.amountRemaining = Math.max(0, job.data.amountRemaining - moved);
        } else if (typeof job.data.amount === 'number') {
          job.data.amountRemaining = Math.max(0, (job.data.amount || 0) - moved);
        }
        if (typeof job.data.amountRemaining === 'number' && job.data.amountRemaining <= 0) {
          job.data.status = 'done';
          job.data.completedAt = (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();
        } else {
          job.data.status = job.data.status === 'pending' ? 'in_progress' : job.data.status;
        }

        // If the task carried an assignee, reflect it on the logistics job
        if (task.data && task.data.assignee) {
          job.data.assignee = task.data.assignee;
          job.data.assignedAt = (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();
        }

        wm.set('logistics', job);

        // If this job itself is a child of another (parentJob), update parent job as well
        const parentJobId = job.data && job.data.meta && job.data.meta.parentJob;
        if (parentJobId) {
          const parent = wm.get('logistics', parentJobId);
          if (parent && parent.data) {
            if (typeof parent.data.amountRemaining === 'number') {
              parent.data.amountRemaining = Math.max(0, parent.data.amountRemaining - moved);
            } else if (typeof parent.data.amount === 'number') {
              parent.data.amountRemaining = Math.max(0, (parent.data.amount || 0) - moved);
            }
            if (typeof parent.data.amountRemaining === 'number' && parent.data.amountRemaining <= 0) parent.data.status = 'done';
            else parent.data.status = parent.data.status === 'pending' ? 'in_progress' : parent.data.status;

            // propagate assignee if present
            if (task.data && task.data.assignee) {
              parent.data.assignee = task.data.assignee;
              parent.data.assignedAt = (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();
            }

            wm.set('logistics', parent);
          }
        }
      }
    } catch (e) {
      // ignore reconciliation errors
    }
  }
}

