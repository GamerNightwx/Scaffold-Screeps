// ConstructionManager
// - Reads constructionPlans from WorkingMemory
// - Creates constructionSites (jobs) at a rate-limited pace
// - Idempotent: does not recreate existing sites for the same plan

import Logger from './Logger.js';

export default class ConstructionManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.wm = kernel && kernel.has && kernel.has('workingMemory') ? kernel.get('workingMemory') : null;
    this.cfg = (kernel && kernel.config) || {};
    this.maxPerTick = typeof this.cfg.constructionMaxPerTick === 'number' ? this.cfg.constructionMaxPerTick : 2;
    // If true, allow creating sites even if blueprint/overlay not explicitly approved
    // Default true for backward compatibility; set to false in cfg to require approvals
    this.allowUnapproved = typeof this.cfg.constructionAllowUnapproved === 'boolean' ? this.cfg.constructionAllowUnapproved : true;
  }

  _now() { return (typeof Game !== 'undefined' && Game.time) ? Game.time : Math.floor(Date.now()/1000); }

  tick() {
    if (!this.wm || !this.wm.list || !this.wm.set) return [];
    const plans = this.wm.list('constructionPlans') || [];
    const existingSites = this.wm.list('constructionSites') || [];
    const existingByPlan = new Set((existingSites || []).map(s => s.data && s.data.planId).filter(Boolean));

    const created = [];
    const now = this._now();
    let remaining = this.maxPerTick;

    for (const p of plans) {
      if (remaining <= 0) break;
      try {
        if (!p || !p.id) continue;
        if (existingByPlan.has(p.id)) continue;
        const plan = p.data || p;
        const pos = plan && plan.room ? { roomName: plan.room, x: plan.x, y: plan.y } : (plan.position || null);
        if (!pos) continue;

        // Approval gate: only create site if blueprint/overlay is approved or unapproved creation is allowed
        let approved = false;
        try {
          const blueprints = (this.wm.list && this.wm.list('blueprints')) || (this.wm._blueprints || []);
          const matching = (blueprints || []).find(b => b && b.room === plan.room && (b.version === plan.blueprintVersion));
          if (matching && matching.blueprint && matching.blueprint.approved === true) approved = true;
        } catch (e) { /* ignore */ }

        try {
          if (!approved) {
            const overlays = (this.wm.list && this.wm.list('visualOverlays')) || (this.wm._visualOverlays || []);
            const matchOv = (overlays || []).find(o => o && o.room === plan.room && (o.version === plan.blueprintVersion));
            if (matchOv && matchOv.approved === true) approved = true;
          }
        } catch (e) { /* ignore */ }

        if (!approved && !this.allowUnapproved) {
          // skip creation until approved
          continue;
        }

        const id = `site:${p.id}`;
        const site = { id, data: { planId: p.id, type: plan.type || 'construction', position: pos, status: 'planned', createdAt: now } };
        this.wm.set('constructionSites', site);
        created.push(site);
        existingByPlan.add(p.id);
        remaining--;
      } catch (e) {
        // ignore per-plan errors
      }
    }

    if (created.length > 0 && typeof Game !== 'undefined' && Game.time) {
      Logger.log(`[T${Game.time}] ConstructionManager: Created ${created.length} construction site(s)`);
    }

    return created;
  }
}
