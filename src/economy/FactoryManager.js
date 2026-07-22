export default class FactoryManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.wm = kernel && kernel.has && kernel.has('workingMemory') ? kernel.get('workingMemory') : null;
    this.recipes = {}; // name -> { inputs: {RESOURCE: amount}, outputs: {RESOURCE: amount}, time: ticks }
    this.queue = []; // array of batch requests { id, recipe, priority, _enqueuedAt, status, progress }
  }

  _nowTick() {
    return (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();
  }

  // Register a recipe
  registerRecipe(name, definition) {
    this.recipes[name] = definition;
  }

  // Enqueue a batch
  enqueue(request) {
    if (!request) return null;
    if (!request.id) request.id = `batch-${Math.random().toString(36).slice(2,9)}`;
    if (typeof request.priority !== 'number') request.priority = 0;
    request._enqueuedAt = Date.now();
    request.status = 'pending';
    request.progress = 0;
    this.queue.push(request);
    // persist to WM
    if (this.wm && typeof this.wm.set === 'function') {
      try {
        this.wm.set('factory', { id: request.id, data: request });
      } catch (e) { /* ignore */ }
    }
    return request.id;
  }

  // Get queue
  getQueue() {
    return this.queue.slice();
  }

  // Peek at highest-priority batch
  peekNext() {
    if (!this.queue.length) return null;
    const sorted = this.queue.slice().sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a._enqueuedAt - b._enqueuedAt;
    });
    return sorted[0];
  }

  // Dequeue and return next batch
  dequeueNext() {
    const next = this.peekNext();
    if (!next) return null;
    const idx = this.queue.findIndex((r) => r.id === next.id);
    if (idx >= 0) this.queue.splice(idx, 1);
    return next;
  }

  // Get a recipe
  getRecipe(name) {
    return this.recipes[name] || null;
  }

  // Tick: progress the current batch, check inputs, create output jobs
  tick() {
    const next = this.peekNext();
    if (!next) return null;

    const recipe = this.getRecipe(next.recipe);
    if (!recipe) return null;

    // Simple progression: increment progress
    next.progress = (next.progress || 0) + 1;

    // If progress >= recipe time, mark done and create output jobs
    if (next.progress >= recipe.time) {
      next.status = 'completed';
      // Create output jobs in WorkingMemory
      const outputs = [];
      if (recipe.outputs) {
        for (const [resource, amount] of Object.entries(recipe.outputs)) {
          const job = {
            id: `out-${next.id}-${resource}`,
            data: {
              type: 'output',
              recipe: next.recipe,
              resource,
              amount,
              status: 'pending',
              createdAt: this._nowTick()
            }
          };
          if (this.wm && typeof this.wm.set === 'function') {
            try { this.wm.set('factory_outputs', job); } catch (e) { /* ignore */ }
          }
          outputs.push(job);
        }
      }
      // Dequeue completed batch
      this.dequeueNext();
      // persist update
      if (this.wm && typeof this.wm.set === 'function') {
        try {
          this.wm.set('factory', { id: next.id, data: next });
        } catch (e) { /* ignore */ }
      }
      return { batch: next, outputs };
    }

    // Persist progress
    if (this.wm && typeof this.wm.set === 'function') {
      try {
        this.wm.set('factory', { id: next.id, data: next });
      } catch (e) { /* ignore */ }
    }

    return { batch: next, outputs: [] };
  }

  // Check if inputs are available for a batch
  canExecute(batchId) {
    const batch = this.queue.find(b => b.id === batchId);
    if (!batch) return false;
    const recipe = this.getRecipe(batch.recipe);
    if (!recipe || !recipe.inputs) return true; // no inputs required
    
    // naive: just check that recipe exists
    // real implementation would check storage/reserves
    return true;
  }

  // List all batches
  listBatches() {
    return this.queue.slice();
  }
}
