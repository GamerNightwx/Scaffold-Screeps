/**
 * Kernel - Orquestrador central do bot
 * Gerencia ciclo de tick, CPU, inicialização e subsistemas
 */

export default class Kernel {
  /**
   * @param {Object} config
   * @param {number} config.cpuBudget - CPU máximo por tick (default: 19)
   * @param {number} config.cpuReserve - CPU reservado para emergências (default: 2)
   * @param {Object<string, Function>} config.subsystems - Map de subsistemas
   */
  constructor(config = {}) {
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
          worldModel.snapshot();
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
        'commandEngine'
      ];

      for (const subsystemName of order) {
        if (!this.has(subsystemName)) continue;

        const cpu = Game.cpu.getUsed();
        if (cpu >= this.cpuBudget - this.cpuReserve) {
          console.log(`[Kernel] CPU limit reached. Stopping at ${subsystemName}`);
          break;
        }

        try {
          const subsystem = this.get(subsystemName);
          // Se subsistema tem método tick(), executar
          if (subsystem.tick && typeof subsystem.tick === 'function') {
            subsystem.tick();
          }
        } catch (err) {
          errors.push({
            subsystem: subsystemName,
            error: err.message,
            stack: err.stack
          });
          console.error(`[Kernel] Error in ${subsystemName}:`, err.message);
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

      this.lastTickMetrics = {
        tickId: Game.time,
        success: errors.length === 0,
        cpuUsed,
        cpuRemaining,
        cpuBudget: this.cpuBudget,
        errors: errors.length,
        timestamp: Date.now()
      };

      return {
        success: errors.length === 0,
        cpuUsed,
        cpuRemaining,
        errors
      };
    } catch (err) {
      console.error('[Kernel] Critical error:', err.message);
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
