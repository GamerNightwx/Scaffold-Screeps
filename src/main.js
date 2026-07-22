/**
 * main.js - Ponto de entrada do bot
 * Inicializa Kernel e subsistemas
 *
 * Uso:
 * - Na interface Screeps, atribua este arquivo como main script
 * - Ou adicione ao Memory.config.mainScript = 'dist/main'
 */

import Kernel from './kernel/Kernel.js';
import WorldModel from './core/WorldModel.js';
import SpatialEngine from './spatial/SpatialEngine.js';
import { config } from './config.js';

// Singleton global para preservar estado entre ticks
let kernelInstance = null;

function initKernel() {
  if (kernelInstance) return kernelInstance;

  kernelInstance = new Kernel({
    cpuBudget: config.kernel.cpuBudget,
    cpuReserve: config.kernel.cpuReserve,
    subsystems: {
      worldModel: (_k) => new WorldModel(),
      spatialEngine: (k) => new SpatialEngine(k),
      workingMemory: (_k) => ({ tick: () => {} }),
      blackboard: (_k) => ({ tick: () => {}, clear: () => {} }),
      decisionEngine: (_k) => ({ tick: () => {} }),
      taskFactory: (_k) => ({ tick: () => {} }),
      taskEngine: (_k) => ({ tick: () => {} }),
      scheduler: (_k) => ({ tick: () => {} }),
      agentRuntime: (_k) => ({ tick: () => {} }),
      commandEngine: (_k) => ({ tick: () => {} })
    }
  });

  return kernelInstance;
}

/**
 * Loop principal do jogo
 * Chamado pelo Screeps a cada tick
 */
export function loop() {
  try {
    const kernel = initKernel();
    const result = kernel.tick();

    if (config.logging.enabled && Game.time % config.logging.metricsInterval === 0) {
      const metrics = kernel.metrics();
      console.log(`[T${Game.time}] CPU: ${metrics.cpuUsed.toFixed(2)}/${metrics.cpuBudget} (reserve: ${metrics.cpuRemaining.toFixed(2)})`);
    }

    if (!result.success && result.errors.length > 0) {
      console.warn(`[T${Game.time}] Errors in tick:`, result.errors);
    }
  } catch (err) {
    console.error('[CRITICAL] Main loop error:', err.message);
    console.error(err.stack);
  }
}

