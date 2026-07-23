/**
 * Pipeline Diagnostic Tool
 * Verifica cada etapa do gameplay pipeline para debugar por que nada está acontecendo
 */

import Logger from './Logger.js';

export function diagnoseGameplay(kernel) {
  if (!kernel) return { error: 'Kernel not available' };

  const wm = kernel.has('workingMemory') ? kernel.get('workingMemory') : null;
  if (!wm) return { error: 'WorkingMemory not available' };

  const diagnostics = {
    time: typeof Game !== 'undefined' ? Game.time : 0,
    rooms: typeof Game !== 'undefined' && Game.rooms ? Object.keys(Game.rooms).length : 0
  };

  // 1. Check WorldModel - room snapshots
  try {
    const worldModel = kernel.get('worldModel');
    diagnostics.worldModel = {
      available: !!worldModel,
      hasSnapshot: worldModel && typeof worldModel.snapshot === 'function'
    };
  } catch (e) {
    diagnostics.worldModel = { error: e.message };
  }

  // 2. Check Goals - should have some initial goals
  try {
    const goals = wm.list ? wm.list('goals') : (wm._goals || []);
    diagnostics.goals = {
      count: (goals || []).length,
      types: goals && goals.length > 0 ? [...new Set(goals.map(g => g.data && g.data.type).filter(Boolean))].slice(0, 5) : []
    };
  } catch (e) {
    diagnostics.goals = { error: e.message };
  }

  // 3. Check Tasks - should be created from goals
  try {
    const tasks = wm.list ? wm.list('tasks') : (wm._tasks || []);
    diagnostics.tasks = {
      count: (tasks || []).length,
      types: tasks && tasks.length > 0 ? [...new Set(tasks.map(t => t.data && t.data.type).filter(Boolean))].slice(0, 5) : [],
      statuses: tasks && tasks.length > 0 ? [...new Set(tasks.map(t => t.data && t.data.status).filter(Boolean))].slice(0, 5) : []
    };
  } catch (e) {
    diagnostics.tasks = { error: e.message };
  }

  // 4. Check Spawns - should queue creep spawn requests
  try {
    const spawns = wm.list ? wm.list('spawns') : (wm._spawns || []);
    diagnostics.spawns = {
      count: (spawns || []).length,
      types: spawns && spawns.length > 0 ? [...new Set(spawns.map(s => s.data && s.data.type).filter(Boolean))].slice(0, 5) : []
    };
  } catch (e) {
    diagnostics.spawns = { error: e.message };
  }

  // 5. Check Creeps - actual creatures
  try {
    const creeps = wm.list ? wm.list('creeps') : (wm._creeps || []);
    diagnostics.creeps = {
      count: (creeps || []).length,
      roles: creeps && creeps.length > 0 ? [...new Set(creeps.map(c => c.data && c.data.role).filter(Boolean))].slice(0, 5) : []
    };
  } catch (e) {
    diagnostics.creeps = { error: e.message };
  }

  // 6. Check Construction Pipeline
  try {
    const blueprints = wm.list ? wm.list('blueprints') : (wm._blueprints || []);
    const plans = wm.list ? wm.list('constructionPlans') : (wm._constructionPlans || []);
    const sites = wm.list ? wm.list('constructionSites') : (wm._constructionSites || []);
    diagnostics.construction = {
      blueprints: (blueprints || []).length,
      constructionPlans: (plans || []).length,
      constructionSites: (sites || []).length,
      worldSites: wm.list ? (wm.list('worldConstructionSites') || []).length : (wm._worldConstructionSites || []).length
    };
  } catch (e) {
    diagnostics.construction = { error: e.message };
  }

  // 7. Check DecisionEngine - should propose goals
  try {
    const de = kernel.get('decisionEngine');
    diagnostics.decisionEngine = {
      available: !!de,
      hasTick: de && typeof de.tick === 'function'
    };
  } catch (e) {
    diagnostics.decisionEngine = { error: e.message };
  }

  // 8. Check TaskFactory - should convert goals to tasks
  try {
    const tf = kernel.get('taskFactory');
    diagnostics.taskFactory = {
      available: !!tf,
      hasTick: tf && typeof tf.tick === 'function'
    };
  } catch (e) {
    diagnostics.taskFactory = { error: e.message };
  }

  // 9. Check SpawnManager - should queue spawn requests
  try {
    const sm = kernel.get('spawnManager');
    diagnostics.spawnManager = {
      available: !!sm,
      hasTick: sm && typeof sm.tick === 'function',
      queueLength: sm && typeof sm.getQueue === 'function' ? (sm.getQueue() || []).length : 0
    };
  } catch (e) {
    diagnostics.spawnManager = { error: e.message };
  }

  // 10. Check AgentRuntime - should assign creeps to tasks
  try {
    const ar = kernel.get('agentRuntime');
    diagnostics.agentRuntime = {
      available: !!ar,
      hasTick: ar && typeof ar.tick === 'function'
    };
  } catch (e) {
    diagnostics.agentRuntime = { error: e.message };
  }

  return diagnostics;
}

/**
 * Log diagnostics in a readable format
 */
export function logDiagnostics(kernel) {
  const diag = diagnoseGameplay(kernel);
  
  Logger.log(`=== GAMEPLAY PIPELINE DIAGNOSTIC (T${diag.time || 0}) ===`);
  Logger.log(`Rooms: ${diag.rooms}, Goals: ${diag.goals?.count || '?'}, Tasks: ${diag.tasks?.count || '?'}, Creeps: ${diag.creeps?.count || '?'}`);
  Logger.log(`Construction: blueprints=${diag.construction?.blueprints || 0}, plans=${diag.construction?.constructionPlans || 0}, sites=${diag.construction?.constructionSites || 0}`);
  Logger.log(`SpawnManager queue: ${diag.spawnManager?.queueLength || '?'}`);
  
  if (diag.goals?.count === 0) Logger.log('⚠️  NO GOALS - DecisionEngine or initial setup may not be running');
  if (diag.tasks?.count === 0) Logger.log('⚠️  NO TASKS - TaskFactory may not be converting goals');
  if (diag.spawns?.count === 0) Logger.log('⚠️  NO SPAWN REQUESTS - SpawnManager may not be queuing');
  if (diag.creeps?.count === 0) Logger.log('⚠️  NO CREEPS - Spawning may not be happening');
}
