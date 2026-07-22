export default class LinkManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.wm = kernel && kernel.has && kernel.has('workingMemory') ? kernel.get('workingMemory') : null;
    this.spatialEngine = kernel && kernel.has && kernel.has('spatialEngine') ? kernel.get('spatialEngine') : null;

    // Link topology: roomName -> [ { id, pos }, ... ]
    this.links = {};

    // Link chains: chainId -> { links: [linkId, linkId, ...], input, output, efficiency }
    this.chains = {};

    // Link status: linkId -> { status: 'online'/'offline'/'clogged', cooldown: 0, lastTransfer: null }
    this.status = {};

    // Link capacity: linkId -> (hardcoded 800, 2000 if enhanced)
    this.capacity = {};

    // Route cache: sourceRoom -> targetRoom -> { useLink: bool, chainId, distance }
    this.routeCache = {};

    // Config
    this.congestionThreshold = 0.8; // link utilization > 80% = clogged
    this.linkCooldown = 1; // ticks between transfers
  }

  _nowTick() {
    return (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();
  }

  // Register links in a room
  registerLinks(roomName, links) {
    this.links[roomName] = links || [];
    for (const link of links) {
      this.status[link.id] = { status: 'online', cooldown: 0, lastTransfer: null };
      this.capacity[link.id] = 800; // default capacity
    }
  }

  // Register a link chain (harvest → link1 → link2 → storage pattern)
  registerChain(chainId, linkIds, inputPos, outputPos) {
    this.chains[chainId] = {
      id: chainId,
      links: linkIds,
      input: inputPos,
      output: outputPos,
      efficiency: 1.0
    };
  }

  // Calculate route preference: should we use link or carry?
  // Returns { useLink: bool, chainId: string or null, reason: string }
  chooseRoute(sourceRoom, targetRoom, sourcePos, targetPos, carryCapacity = 50) {
    // Check cache first
    const cacheKey = `${sourceRoom}_${targetRoom}`;
    if (this.routeCache[cacheKey]) {
      return this.routeCache[cacheKey];
    }

    // If same room, use carry (short distance)
    if (sourceRoom === targetRoom) {
      const result = { useLink: false, chainId: null, reason: 'same_room' };
      this.routeCache[cacheKey] = result;
      return result;
    }

    // Check for viable link chain
    const sourceLinks = this.links[sourceRoom] || [];
    const targetLinks = this.links[targetRoom] || [];

    if (sourceLinks.length === 0 || targetLinks.length === 0) {
      const result = { useLink: false, chainId: null, reason: 'no_links' };
      this.routeCache[cacheKey] = result;
      return result;
    }

    // Find online input and output links
    const onlineSourceLink = sourceLinks.find(l => this.status[l.id] && this.status[l.id].status === 'online');
    const onlineTargetLink = targetLinks.find(l => this.status[l.id] && this.status[l.id].status === 'online');

    if (!onlineSourceLink || !onlineTargetLink) {
      const result = { useLink: false, chainId: null, reason: 'no_online_links' };
      this.routeCache[cacheKey] = result;
      return result;
    }

    // For cross-room transfers, prefer link (simpler logic: cross-room = always prefer link if available)
    const result = { useLink: true, chainId: cacheKey, reason: 'distance_efficient' };
    this.routeCache[cacheKey] = result;
    return result;
  }

  // Get efficiency score for a route (0.0-1.0)
  getRouteEfficiency(sourceRoom, targetRoom) {
    const route = this.chooseRoute(sourceRoom, targetRoom, null, null);
    if (!route.useLink) return 0.8; // carry is 80% efficient baseline

    const sourceLinks = this.links[sourceRoom] || [];
    const targetLinks = this.links[targetRoom] || [];

    if (sourceLinks.length === 0 || targetLinks.length === 0) return 0.0;

    let linkCount = 0;
    let congestionSum = 0;

    for (const link of sourceLinks.concat(targetLinks)) {
      const s = this.status[link.id];
      if (s && s.status === 'online') {
        linkCount++;
        // Estimate congestion (last transfer > 80% of capacity = clogged)
        const congestion = (s.lastTransfer && s.lastTransfer > (this.capacity[link.id] * 0.8)) ? 0.5 : 1.0;
        congestionSum += congestion;
      }
    }

    if (linkCount === 0) return 0.0;
    const avgCongestion = congestionSum / linkCount;
    return Math.max(0.5, avgCongestion * 0.95); // minimum 50% efficiency for link route
  }

  // Mark link as online/offline/clogged
  setLinkStatus(linkId, status, reason = null) {
    if (this.status[linkId]) {
      this.status[linkId].status = status;
      this.status[linkId].statusReason = reason;
      this.status[linkId].statusAt = this._nowTick();
    }
  }

  // Record a transfer on a link (for congestion tracking)
  recordTransfer(linkId, amount) {
    if (this.status[linkId]) {
      this.status[linkId].lastTransfer = amount;
      this.status[linkId].lastTransferAt = this._nowTick();
      // Check for congestion
      if (amount > (this.capacity[linkId] * this.congestionThreshold)) {
        this.setLinkStatus(linkId, 'clogged', 'high_utilization');
      }
    }
  }

  // Tick cooldowns and status recovery
  tick() {
    for (const linkId in this.status) {
      const s = this.status[linkId];
      if (s.cooldown > 0) s.cooldown--;
      // Auto-recover from clogged if no recent transfer
      if (s.status === 'clogged' && (this._nowTick() - (s.lastTransferAt || 0)) > 10) {
        s.status = 'online';
      }
    }
  }

  // Get fallback route when primary link is offline
  // Returns alternative route (fallback to carry or alternate link chain)
  getFallbackRoute(sourceRoom, targetRoom) {
    const primary = this.chooseRoute(sourceRoom, targetRoom);
    if (primary.useLink && !primary.chainId) {
      // Primary link chain is offline; fallback to carry
      return { useLink: false, chainId: null, reason: 'fallback_carry', fallback: true };
    }
    // If carry was primary, fallback is also carry
    return { useLink: false, chainId: null, reason: 'fallback_carry', fallback: true };
  }

  // Get link statistics
  getLinkStats() {
    let total = 0;
    let online = 0;
    let offline = 0;
    let clogged = 0;

    for (const linkId in this.status) {
      total++;
      const s = this.status[linkId];
      if (s.status === 'online') online++;
      else if (s.status === 'offline') offline++;
      else if (s.status === 'clogged') clogged++;
    }

    return { total, online, offline, clogged, healthPercent: (online / total) * 100 };
  }

  // Clear route cache (call when network topology changes)
  clearRouteCache() {
    this.routeCache = {};
  }

  // List all links
  listLinks() {
    const allLinks = [];
    for (const [roomName, roomLinks] of Object.entries(this.links)) {
      for (const link of roomLinks) {
        allLinks.push({ roomName, ...link, status: this.status[link.id] });
      }
    }
    return allLinks;
  }
}
