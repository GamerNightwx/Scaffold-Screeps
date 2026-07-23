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
  },

  hauler: (meta = {}, kernel = null) => {
    // Build hauler body based on HaulerScaler decision
    try {
      const hs = kernel && kernel.has && kernel.has('haulerScaler') ? kernel.get('haulerScaler') : null;
      const source = meta && meta.sourceRoom ? meta.sourceRoom : (meta.fromRoom || null);
      const target = meta && meta.targetRoom ? meta.targetRoom : (meta.toRoom || null);
      const scaling = hs ? hs.calculateCarryCapacity(source, target) : { carryParts: 10 };
      const carry = scaling.carryParts || 10;
      // simple body: carryParts CARRY, moves = ceil(carry/2)
      const moves = Math.ceil(carry / 2);
      const body = [];
      for (let i = 0; i < carry; i++) body.push('CARRY');
      for (let i = 0; i < moves; i++) body.push('MOVE');
      // annotate expected carry capacity (each CARRY = 50)
      const expectedCarryCapacity = carry * 50;
      const outMeta = Object.assign({}, meta, { expectedCarryCapacity });
      // include scaling info in blueprint for spawn reconciliation
      return { body, meta: outMeta, info: scaling };
    } catch (e) {
      // fallback to default transporter design
      return { body: AgentRuntime.designBody('transporter', (meta && meta.energyAvailable) || 300), meta };
    }
  }
};

export function registerDefaultBlueprints(spawnManager, kernel) {
  if (!spawnManager) return;
  spawnManager.registerBlueprint('miner', (meta) => blueprints.miner(meta, kernel));
  spawnManager.registerBlueprint('hauler', (meta) => blueprints.hauler(meta, kernel));
}

export default { blueprints, registerDefaultBlueprints };
