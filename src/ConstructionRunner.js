// ConstructionRunner
// - Reads constructionSites from WorkingMemory
// - Creates goals for construction sites (build goals) for TaskFactory to convert into tasks
// - Marks constructionSite.data.goalId to avoid duplicating goals

export default class ConstructionRunner {
  constructor(kernel) {
    this.kernel = kernel;
    this.wm = kernel && kernel.has && kernel.has('workingMemory') ? kernel.get('workingMemory') : null;
    this.cfg = (kernel && kernel.config) || {};
    this.maxGoalsPerTick = typeof this.cfg.constructionGoalsPerTick === 'number' ? this.cfg.constructionGoalsPerTick : 3;
  }

  _now() { return (typeof Game !== 'undefined' && Game.time) ? Game.time : Math.floor(Date.now()/1000); }

  tick() {
    if (!this.wm || !this.wm.list || !this.wm.set || !this.wm.get) return [];

    const sites = this.wm.list('constructionSites') || [];
    const created = [];
    let remaining = this.maxGoalsPerTick;
    const now = this._now();

    for (const s of sites) {
      if (remaining <= 0) break;
      try {
        if (!s || !s.id || !s.data) continue;
        if (s.data.goalId) continue; // already created
        const pos = s.data.position || s.data.pos || null;
        if (!pos || !pos.roomName) continue;
        const goalId = `goal_site:${s.id}`;
        const goal = {
          id: goalId,
          createdTick: now,
          versionToken: `${now}-${s.id}`,
          valid: true,
          data: {
            type: 'build',
            siteId: s.id,
            planId: s.data.planId || null,
            position: { roomName: pos.roomName, x: pos.x, y: pos.y },
            priority: s.data.priority || (s.data.score || 0)
          }
        };
        this.wm.set('goals', goal);
        // mark site with goalId to avoid duplicate goal creation
        s.data.goalId = goalId;
        this.wm.set('constructionSites', s);
        created.push(goal);
        remaining--;
      } catch (e) {
        // ignore per-site errors
      }
    }

    return created;
  }
}
