// ConstructionAgent
// - Reads constructionSites from WorkingMemory with status 'created' or 'planned'
// - Creates explicit build tasks (type 'build') for construction sites if not already present
// - Tasks include meta.siteId and requiredSkill='build'

export default class ConstructionAgent {
  constructor(kernel) {
    this.kernel = kernel;
    this.wm = kernel && kernel.has && kernel.has('workingMemory') ? kernel.get('workingMemory') : null;
    this.cfg = (kernel && kernel.config) || {};
    this.maxTasksPerTick = typeof this.cfg.constructionTasksPerTick === 'number' ? this.cfg.constructionTasksPerTick : 4;
  }

  _now() { return (typeof Game !== 'undefined' && Game.time) ? Game.time : Math.floor(Date.now()/1000); }

  tick() {
    if (!this.wm || !this.wm.list || !this.wm.set || !this.wm.get) return [];

    const sites = this.wm.list('constructionSites') || [];
    const tasks = this.wm.list('tasks') || [];
    const existingBySite = new Set((tasks || []).map(t => t.data && t.data.meta && t.data.meta.siteId).filter(Boolean));

    const created = [];
    let remaining = this.maxTasksPerTick;
    const now = this._now();

    for (const s of sites) {
      if (remaining <= 0) break;
      try {
        if (!s || !s.id || !s.data) continue;
        // consider only created or planned sites
        if (!['created','planned','pending'].includes(s.data.status)) continue;
        if (existingBySite.has(s.id)) continue;

        const taskId = `task_build:site:${s.id}`;
        const task = {
          id: taskId,
          createdTick: now,
          versionToken: `${now}-${s.id}`,
          valid: true,
          data: {
            type: 'build',
            priority: s.data.priority || (s.data.score || 0),
            status: 'pending',
            assignee: null,
            meta: {
              siteId: s.id,
              planId: s.data.planId || null,
              position: s.data.position || s.data.pos || null,
              requiredSkill: 'build'
            }
          }
        };

        this.wm.set('tasks', task);
        created.push(task);
        existingBySite.add(s.id);
        remaining--;
      } catch (e) {
        // ignore per-site errors
      }
    }

    return created;
  }
}
