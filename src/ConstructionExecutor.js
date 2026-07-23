// ConstructionExecutor
// - Reads constructionSites from WorkingMemory with status 'planned'
// - If in-game API available, calls Game.rooms[room].createConstructionSite(x,y,type)
// - If not available (tests), marks site.status='created' and records in workingMemory 'worldConstructionSites'

export default class ConstructionExecutor {
  constructor(kernel) {
    this.kernel = kernel;
    this.wm = kernel && kernel.has && kernel.has('workingMemory') ? kernel.get('workingMemory') : null;
    this.cfg = (kernel && kernel.config) || {};
    this.maxPerTick = typeof this.cfg.constructionExecPerTick === 'number' ? this.cfg.constructionExecPerTick : 5;
  }

  _now() { return (typeof Game !== 'undefined' && Game.time) ? Game.time : Math.floor(Date.now()/1000); }

  _tryCreateInGame(site) {
    // Returns { attempted: bool, success: bool, error: string|null }
    try {
      const pos = site && site.data && site.data.position;
      if (!pos || !pos.roomName) return { attempted: false, success: false, error: 'no-position' };

      // If room visible, prefer room API
      if (typeof Game !== 'undefined' && Game.rooms && Game.rooms[pos.roomName]) {
        const room = Game.rooms[pos.roomName];
        // Validate tile: avoid creating if there is already a structure or construction site
        try {
          if (typeof room.lookForAt === 'function') {
            const existingStructs = room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y) || [];
            const existingSites = room.lookForAt(LOOK_CONSTRUCTION_SITES, pos.x, pos.y) || [];
            if ((existingStructs && existingStructs.length > 0) || (existingSites && existingSites.length > 0)) {
              // tile occupied; do not attempt to create
              return { attempted: false, success: false, error: 'tile-occupied' };
            }
          }
        } catch (e) {
          // ignore lookForAt failures and continue
        }

        if (typeof room.createConstructionSite === 'function') {
          try {
            const res = room.createConstructionSite(pos.x, pos.y, site.data.type || STRUCTURE_RAMPART);
            const ok = (res === 0 || res === OK || res === undefined);
            return { attempted: true, success: ok, error: ok ? null : `rc:${res}` };
          } catch (e) {
            return { attempted: true, success: false, error: e && e.message ? e.message : 'exception' };
          }
        }
      }

      // fallback: try global createConstructionSite if present
      if (typeof createConstructionSite === 'function') {
        try {
          const res = createConstructionSite(pos.x, pos.y, site.data.type || STRUCTURE_RAMPART);
          const ok = (res === 0 || res === OK || res === undefined);
          return { attempted: true, success: ok, error: ok ? null : `rc:${res}` };
        } catch (e) {
          return { attempted: true, success: false, error: e && e.message ? e.message : 'exception' };
        }
      }

      return { attempted: false, success: false, error: 'no-api' };
    } catch (e) {
      return { attempted: true, success: false, error: e && e.message ? e.message : 'exception' };
    }
  }

  tick() {
    if (!this.wm || !this.wm.list || !this.wm.set || !this.wm.get) return [];

    const sitesAll = this.wm.list('constructionSites') || [];
    // consider planned/pending/created if not yet marked failed
    const sites = sitesAll.filter(s => s && s.data && ['planned','pending','created'].includes(s.data.status));
    const created = [];
    const attemptsMade = [];
    const failures = [];

    let remaining = this.maxPerTick;
    const now = this._now();

    const maxAttempts = typeof this.cfg.constructionMaxCreateAttempts === 'number' ? this.cfg.constructionMaxCreateAttempts : 3;
    const backoffBase = typeof this.cfg.constructionCreateBackoffBase === 'number' ? this.cfg.constructionCreateBackoffBase : 2; // ticks

    for (const s of sites) {
      if (remaining <= 0) break;
      try {
        if (!s || !s.data || !s.data.position) continue;

        // read meta for attempts/backoff
        s.data.meta = s.data.meta || {};
        const attempts = typeof s.data.meta.creationAttempts === 'number' ? s.data.meta.creationAttempts : 0;
        const lastAttempt = typeof s.data.meta.lastCreationAttemptAt === 'number' ? s.data.meta.lastCreationAttemptAt : 0;

        const requiredWait = attempts <= 0 ? backoffBase : backoffBase * Math.pow(2, Math.max(0, attempts - 1));
        if (lastAttempt && (now - lastAttempt) < requiredWait) {
          // still backing off
          continue;
        }

        // attempt in-game creation
        const res = this._tryCreateInGame(s);
        if (res && res.attempted) {
          // record attempt
          s.data.meta.creationAttempts = attempts + 1;
          s.data.meta.lastCreationAttemptAt = now;
          s.data.meta.creationError = res.error || null;
          this.wm.set('constructionSites', s);
          attemptsMade.push(s.id);

          if (res.success) {
            s.data.status = 'created';
            s.data.createdAt = now;
            this.wm.set('constructionSites', s);
            const world = { id: `world:${s.id}`, data: { siteId: s.id, room: s.data.position.roomName, x: s.data.position.x, y: s.data.position.y, type: s.data.type || 'construction', createdAt: now } };
            this.wm.set('worldConstructionSites', world);
            created.push(s);
            remaining--;
            continue;
          } else {
            // failed attempt
            if (s.data.meta.creationAttempts >= maxAttempts) {
              s.data.status = 'failed';
              s.data.failedAt = now;
              this.wm.set('constructionSites', s);
              failures.push(s);
              continue;
            }
            // else will backoff and retry later
            continue;
          }
        } else {
          // no attempt made (tile occupied or no API) -> treat as created to progress pipeline
          s.data.status = 'created';
          s.data.createdAt = now;
          this.wm.set('constructionSites', s);
          const world = { id: `world:${s.id}`, data: { siteId: s.id, room: s.data.position.roomName, x: s.data.position.x, y: s.data.position.y, type: s.data.type || 'construction', createdAt: now } };
          this.wm.set('worldConstructionSites', world);
          created.push(s);
          remaining--;
          continue;
        }
      } catch (e) {
        // ignore per-site errors
      }
    }

    // Backwards-compatible: return array of created sites, but attach metrics
    const res = created;
    res.createdCount = created.length;
    res.attemptsMade = attemptsMade.length;
    res.failures = failures.length;
    return res;
  }
}
