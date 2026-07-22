/**
 * Contracts (JSDoc + abstract classes) for core modules
 * Implementations should match these public methods (duck-typed).
 */

// ----- Kernel -----
/**
 * @interface KernelInterface
 */
export class KernelInterface {
  /** @returns {Object} */
  tick() { throw new Error('Kernel.tick() not implemented'); }
  metrics() { throw new Error('Kernel.metrics() not implemented'); }
  register() { throw new Error('Kernel.register() not implemented'); }
  get() { throw new Error('Kernel.get() not implemented'); }
  has() { throw new Error('Kernel.has() not implemented'); }
}

// ----- WorldModel -----
/**
 * @typedef {Object} WorldSnapshot
 * @property {number} tickId
 * @property {Object} game - captured immutable game state (creeps, structures, rooms, flags, resources)
 * @property {Object} memory - shallow copy of Memory for inspection
 * @property {Object<string, Object>} indices - precomputed indices (creepsByRoom, structuresByType, etc.)
 * @property {Object} meta - metadata (timestamp, cpuUsed, etc.)
 */

/**
 * @interface WorldModelInterface
 * Responsibilities:
 * - snapshot(): capture a full immutable snapshot of the Game state for this tick
 * - current(): return last snapshot
 * - previous(): return prior snapshot
 * - query(indexName, key): lookup precomputed indices
 * - entities(type): return list of entities of given type (creeps/structures/rooms/flags/resources)
 * - history(range): (optional) return array of snapshots for given tick range
 */
export class WorldModelInterface {
  /** @returns {WorldSnapshot} */
  snapshot() { throw new Error('WorldModel.snapshot() not implemented'); }
  /** @returns {WorldSnapshot} */
  current() { throw new Error('WorldModel.current() not implemented'); }
  /** @returns {WorldSnapshot|null} */
  previous() { throw new Error('WorldModel.previous() not implemented'); }
  /**
   * @param {string} indexName
   * @param {string} key
   * @returns {Array}
   */
  query() { throw new Error('WorldModel.query() not implemented'); }
  /**
   * @param {string} type
   * @returns {Array}
   */
  entities() { throw new Error('WorldModel.entities() not implemented'); }
  /**
   * Optional: return historical snapshots between ticks [from, to]
   * @param {number} fromTick
   * @param {number} toTick
   * @returns {WorldSnapshot[]}
   */
  history() { throw new Error('WorldModel.history() not implemented'); }
}

// ----- SpatialEngine -----
export class SpatialEngineInterface {
  computePath() { throw new Error('SpatialEngine.computePath() not implemented'); }
  distanceMatrix() { throw new Error('SpatialEngine.distanceMatrix() not implemented'); }
  analyzeTopology() { throw new Error('SpatialEngine.analyzeTopology() not implemented'); }
  getTraffic() { throw new Error('SpatialEngine.getTraffic() not implemented'); }
  cleanup() { throw new Error('SpatialEngine.cleanup() not implemented'); }
  getMetrics() { throw new Error('SpatialEngine.getMetrics() not implemented'); }
}

// ----- Blackboard -----
export class BlackboardInterface {
  emitEvent() { throw new Error('Blackboard.emitEvent() not implemented'); }
  events() { throw new Error('Blackboard.events() not implemented'); }
  emitAlert() { throw new Error('Blackboard.emitAlert() not implemented'); }
  alerts() { throw new Error('Blackboard.alerts() not implemented'); }
  clear() { throw new Error('Blackboard.clear() not implemented'); }
  addMetric() { throw new Error('Blackboard.addMetric() not implemented'); }
  metrics() { throw new Error('Blackboard.metrics() not implemented'); }
}

// ----- WorkingMemory -----
export class WorkingMemoryInterface {
  set() { throw new Error('WorkingMemory.set() not implemented'); }
  get() { throw new Error('WorkingMemory.get() not implemented'); }
  list() { throw new Error('WorkingMemory.list() not implemented'); }
  delete() { throw new Error('WorkingMemory.delete() not implemented'); }
  invalidateWhere() { throw new Error('WorkingMemory.invalidateWhere() not implemented'); }
}

// ----- DecisionEngine -----
export class DecisionEngineInterface {
  registerScorer() { throw new Error('DecisionEngine.registerScorer() not implemented'); }
  evaluate() { throw new Error('DecisionEngine.evaluate() not implemented'); }
  tick() { throw new Error('DecisionEngine.tick() not implemented'); }
  getMetrics() { throw new Error('DecisionEngine.getMetrics() not implemented'); }
}

// ----- TaskFactory / TaskEngine -----
export class TaskFactoryInterface {
  createTasksFromGoals() { throw new Error('TaskFactory.createTasksFromGoals() not implemented'); }
  tick() { throw new Error('TaskFactory.tick() not implemented'); }
}

export class TaskEngineInterface {
  tick() { throw new Error('TaskEngine.tick() not implemented'); }
  createTask() { throw new Error('TaskEngine.createTask() not implemented'); }
}

// ----- Scheduler / AgentRuntime / CommandEngine -----
export class SchedulerInterface {
  tick() { throw new Error('Scheduler.tick() not implemented'); }
  getMetrics() { throw new Error('Scheduler.getMetrics() not implemented'); }
}

export class AgentRuntimeInterface {
  tick() { throw new Error('AgentRuntime.tick() not implemented'); }
}

export class CommandEngineInterface {
  execute() { throw new Error('CommandEngine.execute() not implemented'); }
}

// Helper list for tooling
export const CONTRACT_MODULES = [
  'Kernel', 'WorldModel', 'SpatialEngine', 'Blackboard', 'WorkingMemory',
  'DecisionEngine', 'TaskFactory', 'TaskEngine', 'Scheduler', 'AgentRuntime', 'CommandEngine'
];
