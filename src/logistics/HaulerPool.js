export default class HaulerPool {
  constructor(kernel) {
    this.kernel = kernel;
    this.wm = kernel && kernel.has && kernel.has('workingMemory') ? kernel.get('workingMemory') : null;

    // internal config
    this.poolThreshold = (kernel && kernel.config && kernel.config.haulerPoolThreshold) || 1600; // amount above which pooling is considered
    this.maxMembersPerPool = (kernel && kernel.config && kernel.config.haulerPoolMaxMembers) || 3;
  }

  _now() {
    return (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();
  }

  // Simple tick: examine logistics jobs (wm.list('logistics')) and create pools for large transfers
  tick() {
    if (!this.wm || !this.wm.list) return [];

    const jobs = this.wm.list('logistics') || [];
    const created = [];
    for (const j of jobs) {
      try {
        if (!j || !j.data) continue;
        const type = j.data.type || '';
        if (type !== 'transfer' && type !== 'refill') continue;
        const amount = j.data.amount || 0;
        if (amount < this.poolThreshold) continue;

        // Check if pool already exists for this job
        if (this._findPoolByJobId(j.id)) continue;

        const pool = this._createPool(j);
        created.push(pool);
        if (this.wm && typeof this.wm.set === 'function') this.wm.set('hauler_pools', pool);
      } catch (e) {
        // ignore individual job errors
      }
    }

    return created;
  }

  _createPool(job) {
    const id = `pool-${job.id}-${Math.random().toString(36).slice(2,6)}`;
    const members = [];
    const pool = {
      id,
      createdAt: this._now(),
      jobId: job.id,
      resource: job.data && job.data.resource ? job.data.resource : 'energy',
      amountTotal: job.data.amount || 0,
      amountRemaining: job.data.amount || 0,
      members, // array of { id: creepId, assignedAt }
      status: 'pending'
    };
    return pool;
  }

  _findPoolByJobId(jobId) {
    const pools = (this.wm && typeof this.wm.list === 'function') ? (this.wm.list('hauler_pools') || []) : [];
    return pools.find(p => p.jobId === jobId) || null;
  }

  // Assign a creep to a pool (if space)
  assignMember(poolId, creepId) {
    if (!this.wm || !this.wm.get) return null;
    const pool = this.wm.get('hauler_pools', poolId);
    if (!pool) return null;
    if (pool.members.find(m => m.id === creepId)) return pool;
    if (pool.members.length >= this.maxMembersPerPool) return pool;

    pool.members.push({ id: creepId, assignedAt: this._now() });
    pool.status = 'active';
    if (this.wm && typeof this.wm.set === 'function') this.wm.set('hauler_pools', pool);
    return pool;
  }

  // Report progress: amount moved by a member
  reportProgress(poolId, creepId, amount) {
    if (!this.wm || !this.wm.get) return null;
    const pool = this.wm.get('hauler_pools', poolId);
    if (!pool) return null;
    const moved = Number(amount || 0);
    pool.amountRemaining = Math.max(0, (pool.amountRemaining || 0) - moved);
    if (pool.amountRemaining === 0) pool.status = 'complete';
    if (this.wm && typeof this.wm.set === 'function') this.wm.set('hauler_pools', pool);
    return pool;
  }

  // Remove member (e.g., creep died)
  removeMember(poolId, creepId) {
    if (!this.wm || !this.wm.get) return null;
    const pool = this.wm.get('hauler_pools', poolId);
    if (!pool) return null;
    pool.members = (pool.members || []).filter(m => m.id !== creepId);
    if (pool.members.length === 0 && pool.amountRemaining > 0) pool.status = 'pending';
    if (this.wm && typeof this.wm.set === 'function') this.wm.set('hauler_pools', pool);
    return pool;
  }

  // Stats for monitoring
  getStats() {
    const pools = (this.wm && typeof this.wm.list === 'function') ? (this.wm.list('hauler_pools') || []) : [];
    return {
      totalPools: pools.length,
      active: pools.filter(p => p.status === 'active').length,
      pending: pools.filter(p => p.status === 'pending').length,
      complete: pools.filter(p => p.status === 'complete').length
    };
  }
}
