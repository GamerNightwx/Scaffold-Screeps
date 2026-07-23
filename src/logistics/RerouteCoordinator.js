export default class RerouteCoordinator {
  constructor(kernel) {
    this.kernel = kernel;
    this.wm = kernel && kernel.has && kernel.has('workingMemory') ? kernel.get('workingMemory') : null;
    this.linkManager = kernel && kernel.has && kernel.has('linkManager') ? kernel.get('linkManager') : null;
    this.cfg = (kernel && kernel.config) || {};
    this.baseWaitTicks = this.cfg.rerouteBaseWaitTicks || 3; // base wait before retry
    this.maxAttempts = this.cfg.rerouteMaxAttempts || 3; // max reroute attempts before marking stale
    this.staleTTL = this.cfg.rerouteStaleTTL || 20; // ticks to consider job stale after last attempt
  }

  _nowTick() { return (typeof Game !== 'undefined' && Game.time) ? Game.time : Math.floor(Date.now()/1000); }

  tick() {
    if (!this.wm || !this.wm.list || !this.wm.set || !this.wm.get) return [];

    const created = [];
    let staleCount = 0;
    let attemptsMade = 0;
    const now = this._nowTick();

    const jobs = (this.wm.list('logistics') || []).filter(j => j && j.data && j.data.status === 'scheduled');

    for (const job of jobs) {
      try {
        const meta = job.data.meta || {};
        const attempts = typeof meta.rerouteAttempts === 'number' ? meta.rerouteAttempts : 0;
        const lastAttempt = typeof meta.lastRerouteAt === 'number' ? meta.lastRerouteAt : (meta.reroutedAt || job.data.createdAt || 0);

        // If exceeded attempts and past stale TTL, mark stale
        if (attempts >= this.maxAttempts && (now - lastAttempt) >= this.staleTTL) {
          job.data.status = 'stale';
          job.data.meta = job.data.meta || {};
          job.data.meta.staleAt = now;
          this.wm.set('logistics', job);
          staleCount++;
          continue;
        }

        // compute required wait using exponential backoff: base * 2^(attempts-1) (attempts=0 => base)
        const requiredWait = attempts <= 0 ? this.baseWaitTicks : this.baseWaitTicks * Math.pow(2, Math.max(0, attempts - 1));
        const ageSinceAttempt = now - lastAttempt;
        if (ageSinceAttempt < requiredWait) continue; // not yet ready for another reroute

        // only handle terminal_transfer and link_transfer
        if (job.data.type === 'terminal_transfer') {
          const srcTerm = this.wm.get('terminals', job.data.from);
          const cooldown = srcTerm && srcTerm.data && typeof srcTerm.data.cooldown === 'number' ? srcTerm.data.cooldown : 0;
          // if source terminal is on cooldown, consider fallback
          if (cooldown > 0) {
            const parentJobId = job.data.meta && job.data.meta.parentJob ? job.data.meta.parentJob : null;
            const srcRoom = job.data.fromRoom || (srcTerm && srcTerm.data && srcTerm.data.room) || null;
            const dstRoom = job.data.toRoom || null;
            if (this.linkManager && srcRoom && dstRoom) {
              try {
                const choice = this.linkManager.chooseRoute(srcRoom, dstRoom);
                if (choice && choice.useLink) {
                  // create link pipeline for parent job
                  const srcLinks = (this.wm.list('links') || []).filter(l => l && l.data && l.data.room === srcRoom).map(l => l.id).concat((this.linkManager.links && this.linkManager.links[srcRoom]) ? this.linkManager.links[srcRoom].map(l => l.id) : []);
                  const dstLinks = (this.wm.list('links') || []).filter(l => l && l.data && l.data.room === dstRoom).map(l => l.id).concat((this.linkManager.links && this.linkManager.links[dstRoom]) ? this.linkManager.links[dstRoom].map(l => l.id) : []);
                  const srcLinkId = (srcLinks && srcLinks.length > 0) ? srcLinks[0] : null;
                  const dstLinkId = (dstLinks && dstLinks.length > 0) ? dstLinks[0] : null;
                  if (srcLinkId && dstLinkId) {
                    const amt = job.data.amount || job.data.amountRemaining || 0;
                    const localToLinkId = `${job.id}-fallback-to-link`;
                    const localToLink = { id: localToLinkId, data: { type: 'transfer', from: parentJobId ? (this.wm.get('logistics', parentJobId) && this.wm.get('logistics', parentJobId).data && this.wm.get('logistics', parentJobId).data.from) || null : null, to: srcLinkId, fromRoom: srcRoom, toRoom: srcRoom, amount: Math.min(amt, 800), status: 'pending', createdAt: now, meta: { parentJob: parentJobId, role: 'fallback_to_link' } } };
                    this.wm.set('logistics', localToLink); created.push(localToLink);

                    const linkHopId = `${job.id}-fallback-link-hop`;
                    const linkHop = { id: linkHopId, data: { type: 'link_transfer', from: srcLinkId, to: dstLinkId, fromRoom: srcRoom, toRoom: dstRoom, amount: amt, status: 'pending', createdAt: now, meta: { parentJob: parentJobId, role: 'fallback_link_hop' } } };
                    this.wm.set('logistics', linkHop); created.push(linkHop);

                    const linkToDestId = `${job.id}-fallback-from-link`;
                    const linkToDest = { id: linkToDestId, data: { type: 'transfer', from: dstLinkId, to: parentJobId ? (this.wm.get('logistics', parentJobId) && this.wm.get('logistics', parentJobId).data && this.wm.get('logistics', parentJobId).data.to) || null : null, fromRoom: dstRoom, toRoom: dstRoom, amount: Math.min(amt, 800), status: 'pending', createdAt: now, meta: { parentJob: parentJobId, role: 'fallback_from_link' } } };
                    this.wm.set('logistics', linkToDest); created.push(linkToDest);

                    // update meta: attempts and lastAttempt
                    job.data.meta = job.data.meta || {};
                    job.data.meta.rerouteAttempts = attempts + 1;
                    job.data.meta.lastRerouteAt = now;
                    this.wm.set('logistics', job);
                    attemptsMade++;

                    continue;
                  }
                }
              } catch (e) { /* ignore */ }
            }
          }
        }

        if (job.data.type === 'link_transfer') {
          const srcLink = this.wm.get('links', job.data.from);
          const status = (this.linkManager && this.linkManager.status && this.linkManager.status[job.data.from]) ? this.linkManager.status[job.data.from].status : (srcLink && srcLink.data && srcLink.data.status) || 'online';
          if (status !== 'online') {
            const parentJobId = job.data.meta && job.data.meta.parentJob ? job.data.meta.parentJob : null;
            const srcRoom = job.data.fromRoom || (srcLink && srcLink.data && srcLink.data.room) || null;
            const dstRoom = job.data.toRoom || null;
            if (srcRoom && dstRoom) {
              try {
                const tm = (this.kernel && this.kernel.has && this.kernel.has('terminalManager')) ? this.kernel.get('terminalManager') : null;
                let srcTerm = null; let dstTerm = null;
                if (tm && typeof tm._findTerminalInRoom === 'function') {
                  srcTerm = tm._findTerminalInRoom(srcRoom);
                  dstTerm = tm._findTerminalInRoom(dstRoom);
                } else {
                  const terms = this.wm.list('terminals') || [];
                  srcTerm = terms.find(t => t && t.data && t.data.room === srcRoom) || null;
                  dstTerm = terms.find(t => t && t.data && t.data.room === dstRoom) || null;
                }
                if (srcTerm && dstTerm) {
                  const amt = job.data.amount || job.data.amountRemaining || 0;
                  const localToTermId = `${job.id}-fallback-to-term`;
                  const localToTerm = { id: localToTermId, data: { type: 'transfer', from: parentJobId ? (this.wm.get('logistics', parentJobId) && this.wm.get('logistics', parentJobId).data && this.wm.get('logistics', parentJobId).data.from) || null : null, to: srcTerm.id, fromRoom: srcRoom, toRoom: srcRoom, amount: Math.min(amt, srcTerm.data && srcTerm.data.capacity ? Math.min(amt, srcTerm.data.capacity) : amt), status: 'pending', createdAt: now, meta: { parentJob: parentJobId, role: 'fallback_to_terminal' } } };
                  this.wm.set('logistics', localToTerm); created.push(localToTerm);

                  const hopId = `${job.id}-fallback-term-hop`;
                  const hop = { id: hopId, data: { type: 'terminal_transfer', from: srcTerm.id, to: dstTerm.id, fromRoom: srcRoom, toRoom: dstRoom, amount: amt, status: 'pending', createdAt: now, meta: { parentJob: parentJobId, role: 'fallback_terminal_hop' } } };
                  this.wm.set('logistics', hop); created.push(hop);

                  const termToDestId = `${job.id}-fallback-from-term`;
                  const termToDest = { id: termToDestId, data: { type: 'transfer', from: dstTerm.id, to: parentJobId ? (this.wm.get('logistics', parentJobId) && this.wm.get('logistics', parentJobId).data && this.wm.get('logistics', parentJobId).data.to) || null : null, fromRoom: dstRoom, toRoom: dstRoom, amount: Math.min(amt, dstTerm.data && dstTerm.data.capacity ? Math.min(amt, dstTerm.data.capacity) : amt), status: 'pending', createdAt: now, meta: { parentJob: parentJobId, role: 'fallback_from_terminal' } } };
                  this.wm.set('logistics', termToDest); created.push(termToDest);

                  job.data.meta = job.data.meta || {};
                  job.data.meta.rerouteAttempts = attempts + 1;
                  job.data.meta.lastRerouteAt = now;
                  this.wm.set('logistics', job);
                  attemptsMade++;

                  continue;
                }
              } catch (e) { /* ignore */ }
            }
          }
        }

      } catch (e) {
        // ignore per-job
      }
    }

    return { created, createdCount: created.length, attemptsMade, staleMarked: staleCount };
  }
}
