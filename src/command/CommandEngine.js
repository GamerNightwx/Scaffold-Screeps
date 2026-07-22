/**
 * CommandEngine
 * - Translates high level commands into Game API actions
 * - Provides an execute(agentId, cmd) method
 * - For testing, supports a pluggable executor
 */
export default class CommandEngine {
  constructor(kernel, executor = null) {
    this.kernel = kernel;
    this.executor = executor || this._defaultExecutor.bind(this);
  }

  execute(agentId, cmd) {
    if (!cmd || !cmd.action) return;
    return this.executor(agentId, cmd);
  }

  _defaultExecutor(agentId, cmd) {
    // Very small default that maps actions to Game.creeps[agentId] calls
    const creep = Game && Game.creeps ? Game.creeps[agentId] : null;
    if (!creep) throw new Error('Agent not found');

    switch (cmd.action) {
    case 'moveTo':
      // target is RoomPosition-like
      if (creep.moveTo) {
        const res = creep.moveTo(cmd.target);
        // record traffic for the room
        try {
          const roomName = (cmd.target && cmd.target.roomName) || creep.pos.roomName;
          if (this.kernel && this.kernel.has && this.kernel.has('spatialEngine')) {
            const se = this.kernel.get('spatialEngine');
            if (se && typeof se.recordTraffic === 'function') se.recordTraffic(roomName, 1);
          }
        } catch (e) {
          // ignore recording errors
        }
        return res;
      }
      return OK;
    case 'harvest':
      if (creep.harvest) return creep.harvest(Game.getObjectById(cmd.targetId));
      return OK;
    case 'transfer':
      if (creep.transfer) return creep.transfer(Game.getObjectById(cmd.targetId), cmd.resource);
      return OK;
    case 'noop':
      return OK;
    default:
      throw new Error('Unknown action: ' + cmd.action);
    }
  }
}
