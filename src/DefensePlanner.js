// Simple DefensePlanner
// - detectChokePoints(paths, options): returns list of choke positions {room,x,y,count,openNeighbors}
// - proposeDefenses(options): returns rampart proposals based on chokepoints

export default class DefensePlanner {
  constructor(kernel) {
    this.kernel = kernel || null;
  }

  // Build heatmap similar to RoadPlanner
  _buildHeatmap(paths = []) {
    const heat = new Map();
    for (const path of paths) {
      if (!Array.isArray(path)) continue;
      for (const pos of path) {
        if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') continue;
        const room = pos.roomName || pos.room || 'unknown';
        const key = `${room}:${pos.x}:${pos.y}`;
        heat.set(key, (heat.get(key) || 0) + 1);
      }
    }
    return heat;
  }

  // Count open neighbors roughly by checking heatmap absence (naive)
  _countOpenNeighbors(room, x, y, heatmap) {
    let open = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const k = `${room}:${x+dx}:${y+dy}`;
        if (!heatmap.has(k)) open++;
      }
    }
    return open;
  }

  detectChokePoints(paths = [], options = {}) {
    const minCount = typeof options.minCount === 'number' ? options.minCount : 4;
    const maxOpenNeighbors = typeof options.maxOpenNeighbors === 'number' ? options.maxOpenNeighbors : 4; // small open area

    const heatmap = this._buildHeatmap(paths);
    const results = [];

    for (const [key, count] of heatmap.entries()) {
      if (count < minCount) continue;
      const [room, xStr, yStr] = key.split(':');
      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);
      const openNeighbors = this._countOpenNeighbors(room, x, y, heatmap);
      if (openNeighbors <= maxOpenNeighbors) {
        results.push({ room, x, y, count, openNeighbors });
      }
    }

    // sort by count desc
    results.sort((a,b) => b.count - a.count || a.room.localeCompare(b.room) || a.x - b.x || a.y - b.y);
    return results;
  }

  proposeDefenses(options = {}) {
    const paths = options.paths || [];
    const minCount = typeof options.minCount === 'number' ? options.minCount : 4;
    const maxOpen = typeof options.maxOpen === 'number' ? options.maxOpen : 4;

    const chokes = this.detectChokePoints(paths, { minCount, maxOpenNeighbors: maxOpen });
    const proposals = [];
    const now = (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();

    // Expand each choke into a short defensive line (ramparts) using spatial or heatmap information
    const heatmap = this._buildHeatmap(paths);

    for (const c of chokes) {
      // find contiguous horizontal span using heatmap or terrain
      const room = c.room;
      const cx = c.x;
      const cy = c.y;

      // helper to check walkable via spatialEngine or heatmap
      const spatial = (this.kernel && this.kernel.has && this.kernel.has('spatialEngine')) ? this.kernel.get('spatialEngine') : null;
      const isWalkable = (rx, ry) => {
        try {
          if (spatial && typeof spatial._floodFillDistances === 'function') {
            // spatial has access to Room.Terrain internally; use Terrain if available
            try {
              const terrain = new Room.Terrain(room);
              return terrain.get(rx, ry) !== TERRAIN_MASK_WALL;
            } catch (e) {
              // fallback to heatmap
            }
          }
        } catch (e) { }
        return heatmap.has(`${room}:${rx}:${ry}`);
      };

      // scan left/right
      let lx = cx; while (lx - 1 >= 0 && isWalkable(lx - 1, cy) && (cx - lx) < 10) lx--;
      let rx = cx; while (rx + 1 < 50 && isWalkable(rx + 1, cy) && (rx - cx) < 10) rx++;
      const horizLen = rx - lx + 1;

      // scan up/down
      let uy = cy; while (uy - 1 >= 0 && isWalkable(cx, uy - 1) && (cy - uy) < 10) uy--;
      let dy = cy; while (dy + 1 < 50 && isWalkable(cx, dy + 1) && (dy - cy) < 10) dy++;
      const vertLen = dy - uy + 1;

      // choose longer axis (prefer axis that blocks flow). If equal, prefer horizontal
      if (horizLen >= vertLen && horizLen > 0) {
        for (let x = lx; x <= rx; x++) {
          const id = `defense:${room}:${x}:${cy}`;
          const obj = { id, data: { type: 'rampart', room, x, y: cy, score: c.count, createdAt: now } };
          proposals.push(obj);
        }
      } else if (vertLen > 0) {
        for (let y = uy; y <= dy; y++) {
          const id = `defense:${room}:${cx}:${y}`;
          const obj = { id, data: { type: 'rampart', room, x: cx, y, score: c.count, createdAt: now } };
          proposals.push(obj);
        }
      } else {
        // fallback single tile
        const id = `defense:${c.room}:${c.x}:${c.y}`;
        const obj = { id, data: { type: 'rampart', room: c.room, x: c.x, y: c.y, score: c.count, createdAt: now } };
        proposals.push(obj);
      }
    }

    // fallback: if no chokes detected, propose top heat positions above minCount
    if (proposals.length === 0) {
      const heatmap = this._buildHeatmap(paths);
      const candidates = [];
      for (const [key, count] of heatmap.entries()) {
        if (count < minCount) continue;
        const [room, xStr, yStr] = key.split(':');
        const x = parseInt(xStr, 10);
        const y = parseInt(yStr, 10);
        candidates.push({ room, x, y, count });
      }
      candidates.sort((a,b) => b.count - a.count || a.room.localeCompare(b.room) || a.x - b.x || a.y - b.y);
      for (const c of candidates) {
        const id = `defense:${c.room}:${c.x}:${c.y}`;
        const obj = { id, data: { type: 'rampart', room: c.room, x: c.x, y: c.y, score: c.count, createdAt: now } };
        proposals.push(obj);
      }
    }

    return proposals;
  }

  tick() {
    if (!this.kernel || !this.kernel.has) return [];
    if (!this.kernel.has('workingMemory')) return [];
    const wm = this.kernel.get('workingMemory');
    const samples = wm.list && wm.list('haulerPaths');
    if (!samples || !Array.isArray(samples)) return [];

    const proposals = this.proposeDefenses({ paths: samples, minCount: 5, maxOpen: 4 });
    try {
      for (const p of proposals) {
        wm.set('defensePlans', p);
      }
    } catch (e) { /* ignore */ }

    return proposals;
  }
}
