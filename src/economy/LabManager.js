export default class LabManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.wm = kernel && kernel.has && kernel.has('workingMemory') ? kernel.get('workingMemory') : null;
    // lab config
    this.labClusters = {}; // roomName -> { input1, input2, output, boosts: [] }
    this.reactions = {}; // name -> { inputs: {R1: amount, R2: amount}, output: resource, outputAmount: amount, steps: N }
    this.queue = []; // array of reaction requests { id, reaction, priority, boostId, status, progress }
    this.boosts = {}; // boostId -> { resource, amount, targetLab, status }
    this.cooldowns = {}; // labId -> cooldownTicks
  }

  _nowTick() {
    return (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();
  }

  // Register a lab cluster in a room
  registerCluster(roomName, config) {
    this.labClusters[roomName] = config;
  }

  // Register a reaction definition
  registerReaction(name, definition) {
    this.reactions[name] = definition;
  }

  // Enqueue a reaction job
  enqueue(request) {
    if (!request) return null;
    if (!request.id) request.id = `react-${Math.random().toString(36).slice(2,9)}`;
    if (typeof request.priority !== 'number') request.priority = 0;
    request._enqueuedAt = Date.now();
    request.status = 'pending';
    request.progress = 0;
    this.queue.push(request);
    // persist to WM
    if (this.wm && typeof this.wm.set === 'function') {
      try {
        this.wm.set('lab_reactions', { id: request.id, data: request });
      } catch (e) { /* ignore */ }
    }
    return request.id;
  }

  // Request a boost from a lab
  requestBoost(resource, amount, targetLab = null) {
    const boostId = `boost-${Math.random().toString(36).slice(2,9)}`;
    const boost = {
      id: boostId,
      resource,
      amount,
      targetLab,
      status: 'pending',
      requestedAt: this._nowTick()
    };
    this.boosts[boostId] = boost;
    // persist
    if (this.wm && typeof this.wm.set === 'function') {
      try {
        this.wm.set('lab_boosts', { id: boostId, data: boost });
      } catch (e) { /* ignore */ }
    }
    return boostId;
  }

  // Peek at next reaction
  peekNext() {
    if (!this.queue.length) return null;
    const sorted = this.queue.slice().sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a._enqueuedAt - b._enqueuedAt;
    });
    return sorted[0];
  }

  // Progress reaction
  tick() {
    const next = this.peekNext();
    if (!next) return null;

    const reaction = this.reactions[next.reaction];
    if (!reaction) return null;

    next.progress = (next.progress || 0) + 1;

    // If progress >= steps, mark done
    if (next.progress >= reaction.steps) {
      next.status = 'completed';
      // Create output job
      const output = {
        id: `lab-out-${next.id}`,
        data: {
          reaction: next.reaction,
          resource: reaction.output,
          amount: reaction.outputAmount,
          status: 'pending',
          createdAt: this._nowTick()
        }
      };
      if (this.wm && typeof this.wm.set === 'function') {
        try { this.wm.set('lab_outputs', output); } catch (e) { /* ignore */ }
      }
      // Remove from queue
      const idx = this.queue.findIndex(q => q.id === next.id);
      if (idx >= 0) this.queue.splice(idx, 1);
      // persist
      if (this.wm && typeof this.wm.set === 'function') {
        try {
          this.wm.set('lab_reactions', { id: next.id, data: next });
        } catch (e) { /* ignore */ }
      }
      return { reaction: next, output, boostsAvailable: Object.keys(this.boosts).length };
    }

    // persist progress
    if (this.wm && typeof this.wm.set === 'function') {
      try {
        this.wm.set('lab_reactions', { id: next.id, data: next });
      } catch (e) { /* ignore */ }
    }

    return { reaction: next, output: null };
  }

  // Fulfill a boost request
  fulfillBoost(boostId) {
    const boost = this.boosts[boostId];
    if (!boost) return false;
    boost.status = 'fulfilled';
    boost.fulfilledAt = this._nowTick();
    // persist
    if (this.wm && typeof this.wm.set === 'function') {
      try {
        this.wm.set('lab_boosts', { id: boostId, data: boost });
      } catch (e) { /* ignore */ }
    }
    return true;
  }

  // Set lab cooldown (in ticks)
  setCooldown(labId, ticks) {
    this.cooldowns[labId] = ticks;
  }

  // Decrement cooldowns
  tickCooldowns() {
    for (const labId in this.cooldowns) {
      this.cooldowns[labId]--;
      if (this.cooldowns[labId] <= 0) {
        delete this.cooldowns[labId];
      }
    }
  }

  // List pending boosts
  listPendingBoosts() {
    return Object.values(this.boosts).filter(b => b.status === 'pending');
  }
}
