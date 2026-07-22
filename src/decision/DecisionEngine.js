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
    this.metrics = { evaluations: 0 };
  }

  /**
   * Register a scorer function
   * @param {string} name
   * @param {Function} fn - (goal, context) => number
   */
  registerScorer(name, fn) {
    if (typeof fn !== 'function') throw new Error('scorer must be function');
    this.scorers.set(name, fn);
  }

  /**
   * Evaluate goals and return ordered list by aggregated score
   * @param {Array<Object>} goals - each goal must have id and data
   * @param {Object} context - optional context (world, spatial, memory)
   * @returns {Array<{goal:Object,score:number}>}
   */
  evaluate(goals = [], context = {}) {
    this.metrics.evaluations++;
    const results = goals.map(goal => {
      let total = 0;
      for (const fn of this.scorers.values()) {
        try {
          const s = fn(goal, context) || 0;
          total += Number(s);
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
    wm.set('goal_priorities', { id: `priorities_${Game.time}`, data: prioritized });
  }

  getMetrics() {
    return Object.assign({}, this.metrics);
  }
}
