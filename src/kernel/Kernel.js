/**
 * Kernel - Orquestrador central do bot
 * Gerencia ciclo de tick, CPU, inicialização e subsistemas
 */

import Logger from '../Logger.js';

export default class Kernel {
  /**
   * @param {Object} config
   * @param {number} config.cpuBudget - CPU máximo por tick (default: 19)
   * @param {number} config.cpuReserve - CPU reservado para emergências (default: 2)
   * @param {Object<string, Function>} config.subsystems - Map de subsistemas
   */
  constructor(config = {}) {
    this.config = config;
    this.cpuBudget = config.cpuBudget || 19;
    this.cpuReserve = config.cpuReserve || 2;

    this.subsystems = new Map();
    this.initialized = false;
    this.lastTickMetrics = null;

    if (config.subsystems) {
      Object.entries(config.subsystems).forEach(([name, initFn]) => {
        this.register(name, initFn);
      });
    }
  }

  /**
   * Registra um subsistema
   * @param {string} name
   * @param {Function} initFn - (kernel) => subsystemInstance
   */
  register(name, initFn) {
    if (typeof initFn !== 'function') {
      throw new Error(`Subsystem ${name} init function must be a function`);
    }
    this.subsystems.set(name, { initFn, instance: null });
  }

  /**
   * Retorna subsistema por nome (lazy initialization)
   * @param {string} name
   * @returns {Object}
   */
  get(name) {
    const entry = this.subsystems.get(name);
    if (!entry) {
      throw new Error(`Subsystem '${name}' not registered`);
    }

    if (!entry.instance) {
      entry.instance = entry.initFn(this);
    }

    return entry.instance;
  }

  /**
   * Verifica se subsistema está registrado
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this.subsystems.has(name);
  }

  /**
   * Executa um tick completo
   * @returns {Object} { success: boolean, cpuUsed: number, cpuRemaining: number, errors: Array }
   */
  tick() {
    const startCpu = Game.cpu.getUsed();
    const errors = [];

    try {
      // Etapa 1: atualizar WorldModel
      if (this.has('worldModel')) {
        const worldModel = this.get('worldModel');
        if (worldModel.snapshot) {
          try {
            worldModel.snapshot();
          } catch (err) {
            errors.push({ subsystem: 'worldModel', error: err.message, stack: err.stack });
            Logger.error(`[Kernel] Error in worldModel (snapshot):`, err.message);
          }
        }
      }

      // Etapa 2: executar ordem registrada de subsistemas
      const order = [
        'worldModel',
        'spatialEngine',
        'workingMemory',
        'blackboard',
        'decisionEngine',
        'taskFactory',
        'taskEngine',
        'scheduler',
        'agentRuntime',
        'commandEngine',
        // Planners & overlays
        'roadPlanner',
        'defensePlanner',
        'blueprintPlanner',
        'blueprintManager',
        'overlayRenderer',
        // Logistics managers (before economy)
        'storageManager',
        'linkManager',
        'linkCoordinator',
        'rerouteCoordinator',
        'haulerScaler',
        // Economy managers
        'spawnManager',
        'miningManager',
        'haulerManager',
        'factoryManager',
        'labManager',
        'marketManager',
        // Construction pipeline (promote plans -> sites -> world)
        'constructionManager',
        'constructionRunner',
        'constructionExecutor',
        'constructionAgent'
      ];

      for (const subsystemName of order) {
        if (!this.has(subsystemName)) continue;

        const cpu = Game.cpu.getUsed();
        if (cpu >= this.cpuBudget - this.cpuReserve) {
          Logger.log(`[Kernel] CPU limit reached. Stopping at ${subsystemName}`);
          break;
        }

        try {
          const subsystem = this.get(subsystemName);
          // Se subsistema tem método tick(), executar
          if (subsystem.tick && typeof subsystem.tick === 'function') {
            const res = subsystem.tick();
            // capture linkCoordinator batches created (tick returns array of created tasks)
            try {
            if (!this._tickTemp) this._tickTemp = {};

            if (subsystemName === 'linkCoordinator' && Array.isArray(res)) {
              // attach to metrics temporarily
              this._tickTemp.linkBatchesCreated = res.length;
            }

            // capture rerouteCoordinator metrics (may return object with counts)
            if (subsystemName === 'rerouteCoordinator') {
              if (Array.isArray(res)) this._tickTemp.reroutesCreated = res.length;
              else if (res && typeof res === 'object') this._tickTemp.rerouteMetrics = res;
            }

          // capture constructionExecutor metrics
          if (subsystemName === 'constructionExecutor') {
            if (Array.isArray(res)) this._tickTemp.constructionCreated = res.length;
            else if (res && typeof res === 'object') this._tickTemp.constructionMetrics = res;
          }

          // capture linkManager stats if available
          if (subsystemName === 'linkManager' && typeof subsystem.getLinkStats === 'function') {
            this._tickTemp.linkStats = subsystem.getLinkStats();
          }
          } catch (e) { /* ignore metric capture */ }
          }
        } catch (err) {
          errors.push({
            subsystem: subsystemName,
            error: err.message,
            stack: err.stack
          });
          Logger.error(`[Kernel] Error in ${subsystemName}:`, err.message);
        }
      }

      // Etapa 3: limpar Blackboard
      if (this.has('blackboard')) {
        const blackboard = this.get('blackboard');
        if (blackboard.clear && typeof blackboard.clear === 'function') {
          blackboard.clear();
        }
      }

      const endCpu = Game.cpu.getUsed();
      const cpuUsed = endCpu - startCpu;
      const cpuRemaining = this.cpuBudget - endCpu;

      // collect link metrics and queue lengths if workingMemory present
      const linkMetrics = {};
      try {
        if (this._tickTemp && this._tickTemp.linkBatchesCreated) linkMetrics.batchesCreated = this._tickTemp.linkBatchesCreated;
        if (this._tickTemp && this._tickTemp.linkStats) linkMetrics.stats = this._tickTemp.linkStats;
      } catch (e) { }

      // construction/defense plan metrics
      const planMetrics = {};
      try {
        if (this.has('workingMemory')) {
          const wm = this.get('workingMemory');

          // link queues
          const jobs = wm.list('logistics') || [];
          const pending = jobs.filter(j => j && j.data && (j.data.type === 'link_transfer') && j.data.status === 'pending').length;
          const scheduled = jobs.filter(j => j && j.data && (j.data.type === 'link_transfer') && j.data.status === 'scheduled').length;
          linkMetrics.pending = pending;
          linkMetrics.scheduled = scheduled;

          // planner proposals
          const constructionPlans = wm.list('constructionPlans') || [];
          const defensePlans = wm.list('defensePlans') || [];
          planMetrics.constructionPlans = constructionPlans.length;
          planMetrics.defensePlans = defensePlans.length;
 
          // blueprint, overlay and rendered shape counts
          try {
            const blueprints = wm.list('blueprints') || [];
            const overlays = wm.list('visualOverlays') || [];
            const shapes = wm.list('visualShapes') || [];
            planMetrics.blueprints = blueprints.length;
            planMetrics.visualOverlays = overlays.length;
            planMetrics.visualShapes = shapes.length;
          } catch (e) { /* ignore if WM doesn't support these collections */ }
 
          // construction sites
          const constructionSites = wm.list('constructionSites') || [];
          planMetrics.sitesPlanned = constructionSites.filter(s => s && s.data && (s.data.status === 'planned' || s.data.status === 'pending')).length;
          planMetrics.sitesCreated = constructionSites.filter(s => s && s.data && s.data.status === 'created').length;
        planMetrics.sitesFailed = constructionSites.filter(s => s && s.data && s.data.status === 'failed').length;
 
        // world-construction-sites (executor)
        const worldSites = wm.list('worldConstructionSites') || [];
        planMetrics.worldSites = worldSites.length;
 
        // construction errors collection
        const errors = wm.list('constructionErrors') || [];
        planMetrics.creationErrors = errors.length;
        }
      } catch (e) { }

      const rerouteMetrics = (this._tickTemp && this._tickTemp.rerouteMetrics) ? this._tickTemp.rerouteMetrics : (this._tickTemp && typeof this._tickTemp.reroutesCreated === 'number' ? { createdCount: this._tickTemp.reroutesCreated } : undefined);

      this.lastTickMetrics = {
        tickId: Game.time,
        success: errors.length === 0,
        cpuUsed,
        cpuRemaining,
        cpuBudget: this.cpuBudget,
        errors: errors.length,
        timestamp: Date.now(),
        linkMetrics,
        rerouteMetrics,
        planMetrics
      };

      // Debug logging for construction pipeline
      if (planMetrics && (planMetrics.blueprints > 0 || planMetrics.constructionPlans > 0 || planMetrics.sitesPlanned > 0 || planMetrics.sitesCreated > 0)) {
       if (typeof Game !== 'undefined' && Game.time && Game.time % 10 === 0) {
         Logger.log(`[T${Game.time}] Construction pipeline: blueprints=${planMetrics.blueprints}, plans=${planMetrics.constructionPlans}, sitesPlanned=${planMetrics.sitesPlanned}, sitesCreated=${planMetrics.sitesCreated}, shapes=${planMetrics.visualShapes || 0}`);
       }
      }

      // clear temp
      this._tickTemp = null;

      return {
        success: errors.length === 0,
        cpuUsed,
        cpuRemaining,
        errors
      };
    } catch (err) {
      Logger.error('[Kernel] Critical error:', err.message);
      return {
        success: false,
        cpuUsed: Game.cpu.getUsed() - startCpu,
        cpuRemaining: this.cpuBudget - Game.cpu.getUsed(),
        errors: [{ subsystem: 'kernel', error: err.message }]
      };
    }
  }

  /**
   * Retorna métricas do último tick
   * @returns {Object}
   */
  metrics() {
    return this.lastTickMetrics;
  }

  /**
   * Valida que todos os subsistemas necessários estão registrados
   * @returns {Object} { valid: boolean, missing: Array<string> }
   */
  validate() {
    const required = [
      'worldModel',
      'blackboard',
      'commandEngine'
    ];

    const missing = required.filter(name => !this.has(name));

    return {
      valid: missing.length === 0,
      missing
    };
  }
}
