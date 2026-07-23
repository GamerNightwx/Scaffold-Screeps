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
import WorkingMemory from './memory/WorkingMemory.js';
import Blackboard from './blackboard/Blackboard.js';
import { config } from './config.js';
import DecisionEngine from './decision/DecisionEngine.js';
import TaskFactory from './tasks/TaskFactory.js';
import TaskEngine from './tasks/TaskEngine.js';
import Scheduler from './scheduler/Scheduler.js';
import AgentRuntime from './agent/AgentRuntime.js';
import CommandEngine from './command/CommandEngine.js';
import RoadPlanner from './RoadPlanner.js';
import DefensePlanner from './DefensePlanner.js';
import * as BlueprintPlannerModule from './BlueprintPlanner.js';
import BlueprintManager from './BlueprintManager.js';
import ConstructionManager from './ConstructionManager.js';
import ConstructionRunner from './ConstructionRunner.js';
import ConstructionExecutor from './ConstructionExecutor.js';
import ConstructionAgent from './ConstructionAgent.js';
import OverlaySubsystem from './OverlaySubsystem.js';
import Logger from './Logger.js';
import { logDiagnostics } from './PipelineDiagnostic.js';
import { bootstrapGame } from './GameBootstrap.js';

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
      workingMemory: (k) => new WorkingMemory(k),
      blackboard: (k) => new Blackboard(k),
      decisionEngine: (k) => new DecisionEngine(k),
      taskFactory: (k) => new TaskFactory(k),
      taskEngine: (k) => new TaskEngine(k),
      scheduler: (k) => new Scheduler(k),
      agentRuntime: (k) => new AgentRuntime(k),
      commandEngine: (k) => new CommandEngine(k),
      // Road planner: collects hauler path samples and proposes road construction
      roadPlanner: (k) => new RoadPlanner(k),
      defensePlanner: (k) => new DefensePlanner(k),
      blueprintPlanner: (k) => {
        // BlueprintPlanner exports tick() function; wrap with kernel context
        return {
          tick() {
            return BlueprintPlannerModule.tick(k.get('workingMemory'));
          }
        };
      },
      // Overlay subsystem: render visualOverlays -> visualShapes each tick
      overlayRenderer: (k) => new OverlaySubsystem(k),
      // Blueprint manager: convert blueprints -> constructionPlans
      blueprintManager: (k) => BlueprintManager(k),
      constructionManager: (k) => new ConstructionManager(k),
      constructionRunner: (k) => new ConstructionRunner(k),
      constructionExecutor: (k) => new ConstructionExecutor(k),
      constructionAgent: (k) => new ConstructionAgent(k)
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
    
    // Bootstrap game state on first run (or when needed)
    if (typeof Game !== 'undefined' && Game.time === 1) {
      bootstrapGame(kernel);
    }
    
    const result = kernel.tick();

    if (config.logging.enabled && Game.time % config.logging.metricsInterval === 0) {
      const metrics = kernel.metrics();
      Logger.log(`[T${Game.time}] CPU: ${metrics.cpuUsed.toFixed(2)}/${metrics.cpuBudget} (reserve: ${metrics.cpuRemaining.toFixed(2)})`);
    }

    // Diagnostic every 20 ticks
    if (typeof Game !== 'undefined' && Game.time % 20 === 0) {
      logDiagnostics(kernel);
    }

    if (!result.success && result.errors.length > 0) {
      Logger.warn(`[T${Game.time}] Errors in tick:`, result.errors);
    }
  } catch (err) {
    Logger.error('[CRITICAL] Main loop error:', err.message);
    Logger.error(err.stack);
  }
}

