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
    // Support a management action to approve blueprints/overlays
    if (cmd.action === 'approveBlueprint') {
      const room = cmd.room;
      const version = cmd.version;
      if (!room || typeof version === 'undefined') return { error: 'room and version required' };

      try {
        const wm = this.kernel && this.kernel.has && this.kernel.has('workingMemory') ? this.kernel.get('workingMemory') : null;
        let approvedCount = 0;
        let overlayCount = 0;
        if (wm) {
          // blueprints
          const bps = (typeof wm.list === 'function') ? wm.list('blueprints') || [] : (wm._blueprints || []);
          (bps || []).forEach(bp => {
            if (bp && bp.room === room && bp.version === version) {
              bp.blueprint = bp.blueprint || {};
              bp.blueprint.approved = true;
              approvedCount++;
              if (typeof wm.write === 'function') wm.write('blueprints', bp);
            }
          });

          // overlays
          const ovs = (typeof wm.list === 'function') ? wm.list('visualOverlays') || [] : (wm._visualOverlays || []);
          (ovs || []).forEach(ov => {
            if (ov && ov.room === room && ov.version === version) {
              ov.approved = true;
              overlayCount++;
              if (typeof wm.write === 'function') wm.write('visualOverlays', ov);
            }
          });
        }

        return { approvedCount, overlayCount };
      } catch (e) {
        return { error: e.message };
      }
    }

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
