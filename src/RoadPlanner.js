// Simple RoadPlanner
// - buildHeatmap(paths): paths is array of paths, each path is array of {x,y,roomName}
// - proposeRoads(options): returns positions where heat >= minCount, optionally limit per room

export default class RoadPlanner {
  constructor(kernel) {
    this.kernel = kernel || null;
  }

  // builds a heatmap keyed by room:x:y => count
  buildHeatmap(paths = []) {
    const heatmap = new Map();
    for (const path of paths) {
      if (!Array.isArray(path)) continue;
      for (const pos of path) {
        if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') continue;
        const room = pos.roomName || pos.room || 'unknown';
        const key = `${room}:${pos.x}:${pos.y}`;
        heatmap.set(key, (heatmap.get(key) || 0) + 1);
      }
    }
    return heatmap;
  }

  // proposeRoads: options {paths, minCount = 3, maxPerRoom = Infinity}
  proposeRoads(options = {}) {
    const paths = options.paths || [];
    const minCount = typeof options.minCount === 'number' ? options.minCount : 3;
    const maxPerRoom = typeof options.maxPerRoom === 'number' ? options.maxPerRoom : Infinity;

    const heatmap = this.buildHeatmap(paths);
    const perRoom = new Map();
    const proposals = [];

    for (const [key, count] of heatmap.entries()) {
      if (count < minCount) continue;
      const [room, xStr, yStr] = key.split(':');
      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);
      const roomCount = perRoom.get(room) || 0;
      if (roomCount >= maxPerRoom) continue;
      proposals.push({ room, x, y, count });
      perRoom.set(room, roomCount + 1);
    }

    // sort descending by count, then room,x,y for deterministic order
    proposals.sort((a, b) => b.count - a.count || a.room.localeCompare(b.room) || a.x - b.x || a.y - b.y);
    return proposals;
  }

  // tick() can pull recent path samples from workingMemory or spatialEngine if available
  tick() {
    if (!this.kernel || !this.kernel.has) return [];
    if (!this.kernel.has('workingMemory')) return [];
    const wm = this.kernel.get('workingMemory');
    const samples = wm.list && wm.list('haulerPaths');
    if (!samples || !Array.isArray(samples)) return [];
    // produce proposals with default threshold
    const proposals = this.proposeRoads({ paths: samples, minCount: 5, maxPerRoom: 200 });

    // persist proposals into workingMemory under 'constructionPlans'
    try {
      const now = (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();
      for (const p of proposals) {
        const id = `roadplan:${p.room}:${p.x}:${p.y}`;
        const obj = { id, data: { type: 'road', room: p.room, x: p.x, y: p.y, count: p.count, createdAt: now } };
        wm.set('constructionPlans', obj);
      }
    } catch (e) {
      // ignore persistence errors
    }

    return proposals;
  }
}
