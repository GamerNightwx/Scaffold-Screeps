/**
 * DecisionEngine
 * - Registers pluggable scorer functions
 * - Evaluates Goals and returns ordered list by score
 * - Does not create Tasks, only ranks Goals
 */
export default class DecisionEngine {
  constructor(kernel) {
    this.kernel = kernel;
    this.scorers = new Map(); // name => fn(goal, context) => score (number)
    this.metrics = { evaluations: 0, scorerCalls: 0, weightUpdates: 0 };
    // simple per-scorer weights used by aggregator/learning
    this.weights = new Map(); // name => weight (number)
    this.outcomes = []; // recent observed outcomes for learning
    this.config = {
      learningRate: 0.01,
      minWeight: -5,
      maxWeight: 5,
      weightDecay: 0.999
    };
    // attempt to load persisted weights from WorkingMemory (if available)
    try { this.loadWeights(); } catch (e) { /* ignore in test env */ }
  }

  /**
   * Register a scorer function
   * @param {string} name
   * @param {Function} fn - (goal, context) => number
   */
  registerScorer(name, fn) {
    if (typeof fn !== 'function') throw new Error('scorer must be function');
    this.scorers.set(name, fn);
    if (!this.weights.has(name)) this.weights.set(name, 1.0);
  }

  unregisterScorer(name) {
    this.scorers.delete(name);
    this.weights.delete(name);
  }

  /**
   * Evaluate goals and return ordered list by aggregated score
   * Aggregator: sum(weight_i * raw_score_i)
   * @param {Array<Object>} goals - each goal must have id and data
   * @param {Object} context - optional context (world, spatial, memory)
   * @returns {Array<{goal:Object,score:number}>}
   */
  evaluate(goals = [], context = {}) {
    this.metrics.evaluations++;
    const results = goals.map(goal => {
      let total = 0;
      for (const [name, fn] of this.scorers.entries()) {
        try {
          const s = Number(fn(goal, context) || 0);
          const w = Number(this.weights.get(name) || 1.0);
          total += w * s;
          this.metrics.scorerCalls = (this.metrics.scorerCalls || 0) + 1;
        } catch (e) {
          // scorer failure => zero contribution
        }
      }
      return { goal, score: total };
    });

    // Sort descending by score, tie-breaker by goal.id
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.goal.id).localeCompare(String(b.goal.id));
    });

    return results;
  }

  /**
   * Kernel tick integration: evaluate goals from workingMemory and write priority back
   * This is lightweight; heavy task creation belongs to TaskFactory
   */
  tick() {
    const wm = this.kernel.has('workingMemory') ? this.kernel.get('workingMemory') : null;
    if (!wm || !wm.list) return;

    const goals = wm.list('goals');
    if (!goals || goals.length === 0) return;

    const context = {
      world: this.kernel.has('worldModel') ? this.kernel.get('worldModel') : null,
      spatial: this.kernel.has('spatialEngine') ? this.kernel.get('spatialEngine') : null,
      workingMemory: wm,
    };

    const evaluated = this.evaluate(goals, context);

    // Persist priority ordering in working memory as metadata
    const prioritized = evaluated.map((r, idx) => ({ id: r.goal.id, score: r.score, rank: idx + 1 }));
    // store under 'goal_priorities'
    try {
      wm.set('goal_priorities', { id: `priorities_${Game ? Game.time : Date.now()}`, data: prioritized });
    } catch (e) {
      // best-effort in test env
    }
  }

  /** Learning and adaptation APIs */
  observeOutcome(id, reward) {
    // store simple tuple for later weight updates
    this.outcomes.push({ id, reward, time: Game ? Game.time : Date.now() });
    // keep recent window
    if (this.outcomes.length > 1000) this.outcomes.shift();
  }

  updateWeights(signals = null) {
    // Simple update: if signals provided, expect {scorerName: contribution}
    // Otherwise use last outcome to nudge weights proportional to scorer contributions
    let changed = 0;
    if (signals && typeof signals === 'object') {
      for (const [name, delta] of Object.entries(signals)) {
        const prev = Number(this.weights.get(name) || 0);
        const next = Math.max(this.config.minWeight, Math.min(this.config.maxWeight, prev + (delta * this.config.learningRate)));
        this.weights.set(name, next);
        if (next !== prev) changed++;
      }
    } else if (this.outcomes.length > 0) {
      // naive credit-assignment: boost all scorers slightly towards last reward
      const last = this.outcomes[this.outcomes.length - 1];
      const magnitude = (last.reward || 0) * this.config.learningRate;
      for (const name of this.scorers.keys()) {
        const prev = Number(this.weights.get(name) || 0);
        const next = Math.max(this.config.minWeight, Math.min(this.config.maxWeight, prev + magnitude * 0.1));
        this.weights.set(name, next);
        if (next !== prev) changed++;
      }
    }

    // apply decay
    for (const name of Array.from(this.weights.keys())) {
      const prev = Number(this.weights.get(name));
      const decayed = prev * this.config.weightDecay;
      this.weights.set(name, decayed);
      if (decayed !== prev) changed++;
    }

    if (changed > 0) {
      this.metrics.weightUpdates = (this.metrics.weightUpdates || 0) + 1;
      try { this.saveWeights(); } catch (e) { /* ignore */ }
    }
  }

  exportWeights() {
    const obj = {};
    for (const [k, v] of this.weights.entries()) obj[k] = v;
    return JSON.stringify({ weights: obj, config: this.config });
  }

  importWeights(json) {
    try {
      const parsed = typeof json === 'string' ? JSON.parse(json) : json;
      const w = parsed && parsed.weights ? parsed.weights : parsed;
      for (const [k, v] of Object.entries(w || {})) {
        this.weights.set(k, Number(v));
      }
      if (parsed && parsed.config) Object.assign(this.config, parsed.config);
    } catch (e) {
      // ignore
    }
  }

  getWeights() {
    const obj = {};
    for (const [k, v] of this.weights.entries()) obj[k] = v;
    return obj;
  }

  // Persist current weights into WorkingMemory under collection 'decisionengine' id 'weights'
  saveWeights() {
    try {
      if (!this.kernel || !this.kernel.has || !this.kernel.get) return;
      if (!this.kernel.has('workingMemory')) return;
      const wm = this.kernel.get('workingMemory');
      if (!wm || !wm.set) return;
      wm.set('decisionengine', { id: 'weights', data: { weights: this.getWeights(), config: this.config } });
    } catch (e) {
      // ignore persistence errors in test/runtime
    }
  }

  // Load persisted weights from WorkingMemory if present
  loadWeights() {
    try {
      if (!this.kernel || !this.kernel.has || !this.kernel.get) return;
      if (!this.kernel.has('workingMemory')) return;
      const wm = this.kernel.get('workingMemory');
      if (!wm || !wm.get) return;
      const entry = wm.get('decisionengine', 'weights');
      if (entry && entry.data) {
        this.importWeights(entry.data);
      }
    } catch (e) {
      // ignore
    }
  }

  getMetrics() {
    return Object.assign({}, this.metrics);
  }
}
