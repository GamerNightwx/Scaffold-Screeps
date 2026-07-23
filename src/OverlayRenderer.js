// Simple OverlayRenderer
// Converts blueprint placement lists into drawable shapes for visualization or logs.

function _isAdjacent(a, b) {
  return (a.x === b.x && Math.abs(a.y - b.y) === 1) || (a.y === b.y && Math.abs(a.x - b.x) === 1);
}

function groupLines(points) {
  // points: array of {x,y}
  if (!points || points.length === 0) return [];

  // Create a mutable set of points by coordinate
  const key = p => `${p.x},${p.y}`;
  const pts = new Map(points.map(p => [key(p), { x: p.x, y: p.y }]));

  const lines = [];

  while (pts.size > 0) {
    const first = pts.values().next().value;
    pts.delete(key(first));

    // Try to grow line horizontally
    let horiz = [first];
    // extend left
    let cur = { ...first };
    while (true) {
      const nextKey = `${cur.x - 1},${cur.y}`;
      if (pts.has(nextKey)) {
        const n = pts.get(nextKey);
        pts.delete(nextKey);
        horiz.unshift(n);
        cur = n;
      } else break;
    }
    // extend right from original
    cur = { ...first };
    while (true) {
      const nextKey = `${cur.x + 1},${cur.y}`;
      if (pts.has(nextKey)) {
        const n = pts.get(nextKey);
        pts.delete(nextKey);
        horiz.push(n);
        cur = n;
      } else break;
    }

    if (horiz.length > 1) {
      lines.push({ orientation: 'h', points: horiz });
      continue;
    }

    // else try vertical
    let vert = [first];
    cur = { ...first };
    while (true) {
      const nextKey = `${cur.x},${cur.y - 1}`;
      if (pts.has(nextKey)) {
        const n = pts.get(nextKey);
        pts.delete(nextKey);
        vert.unshift(n);
        cur = n;
      } else break;
    }
    cur = { ...first };
    while (true) {
      const nextKey = `${cur.x},${cur.y + 1}`;
      if (pts.has(nextKey)) {
        const n = pts.get(nextKey);
        pts.delete(nextKey);
        vert.push(n);
        cur = n;
      } else break;
    }

    if (vert.length > 1) {
      lines.push({ orientation: 'v', points: vert });
    } else {
      // single point
      lines.push({ orientation: 'p', points: [first] });
    }
  }

  return lines;
}

export function renderOverlay(overlayEntry) {
  if (!overlayEntry || !overlayEntry.overlay) return [];

  const placements = overlayEntry.overlay;

  // Separate by type
  const byType = {};
  placements.forEach(p => {
    byType[p.type] = byType[p.type] || [];
    byType[p.type].push({ x: p.x, y: p.y });
  });

  const shapes = [];
  for (const [type, pts] of Object.entries(byType)) {
    if (type === 'road') {
      // group into lines
      const lines = groupLines(pts);
      lines.forEach(l => shapes.push({ type: 'roadLine', orientation: l.orientation, points: l.points }));
    } else {
      // place each as a point
      pts.forEach(p => shapes.push({ type: `${type}Point`, point: p }));
    }
  }

  return shapes;
}

export default { renderOverlay };
