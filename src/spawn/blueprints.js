import AgentRuntime from '../agent/AgentRuntime.js';

export const blueprints = {
  miner: (meta = {}, kernel = null) => {
    const energy = (meta && meta.energyAvailable) || (kernel && kernel.has && kernel.has('energyBudget') ? kernel.get('energyBudget') : 300);
    // Prefer AgentRuntime provided via kernel if available (uses static designBody)
    try {
      if (kernel && kernel.has && kernel.has('agentRuntime')) {
        const ar = kernel.get('agentRuntime');
        if (ar && ar.constructor && typeof ar.constructor.designBody === 'function') {
          return { body: ar.constructor.designBody('harvester', energy), meta };
        }
      }
    } catch (e) {
      // fall through to default
    }
    // Fallback to local AgentRuntime implementation
    return { body: AgentRuntime.designBody('harvester', energy), meta };
  }
};

export function registerDefaultBlueprints(spawnManager, kernel) {
  if (!spawnManager) return;
  spawnManager.registerBlueprint('miner', (meta) => blueprints.miner(meta, kernel));
}

export default { blueprints, registerDefaultBlueprints };
