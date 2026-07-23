// PlacementValidator: enforces placement rules for blueprints
// - terrain collisions
// - conflicts with existing structures and constructionSites
// - buffer distances from existing structures
// - basic intra-blueprint duplicate detection

function _dist2(a, b) { const dx = a.x - b.x; const dy = a.y - b.y; return dx*dx + dy*dy; }

const defaultBuffers = {
  spawn: 2,
  storage: 2,
  terminal: 2,
  tower: 2,
  lab: 1,
  extension: 1,
  container: 1,
  powerSpawn: 2,
  road: 0
};

export function validateAll(blueprint, workingMemory, options = {}) {
  const roomTerrain = (workingMemory && workingMemory.terrain) ? workingMemory.terrain : { isWall: () => false };
  const structures = (workingMemory && typeof workingMemory.list === 'function') ? workingMemory.list('structures') || [] : (workingMemory && workingMemory._structures) || [];
  const constructionSites = (workingMemory && typeof workingMemory.list === 'function') ? workingMemory.list('constructionSites') || [] : (workingMemory && workingMemory._constructionSites) || [];

  const buffers = Object.assign({}, defaultBuffers, options.buffers || {});

  const conflicts = [];
  if (!blueprint || !Array.isArray(blueprint.placements)) {
    return { valid: true, conflicts };
  }

  // check duplicates within blueprint
  const seen = new Map();
  for (const p of blueprint.placements) {
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) {
      conflicts.push({ type: 'duplicate', placement: p, reason: 'duplicate_in_blueprint' });
    } else seen.set(key, p);
  }

  for (const p of blueprint.placements) {
    // terrain
    if (roomTerrain && typeof roomTerrain.isWall === 'function' && roomTerrain.isWall(p.x, p.y)) {
      conflicts.push({ type: 'terrain', placement: p, reason: 'wall' });
      continue; // tile invalid, skip further checks
    }

    // existing structure at same position
    const structConflict = (structures || []).find(s => s.x === p.x && s.y === p.y);
    if (structConflict) {
      conflicts.push({ type: 'structure', placement: p, existing: structConflict });
      continue;
    }

    // existing construction site at same position
    const siteConflict = (constructionSites || []).find(s => s.x === p.x && s.y === p.y);
    if (siteConflict) {
      conflicts.push({ type: 'site', placement: p, site: siteConflict });
      continue;
    }

    // buffer checks: ensure no existing structure within buffer radius for this placement type
    const buf = buffers[p.type] || 0;
    if (buf > 0) {
      const buf2 = buf * buf;
      for (const s of structures || []) {
        if (_dist2({ x: p.x, y: p.y }, { x: s.x, y: s.y }) <= buf2) {
          conflicts.push({ type: 'buffer', placement: p, existing: s, reason: `within_${buf}_of_${s.type || 'structure'}` });
          break;
        }
      }
    }
  }

  return { valid: conflicts.length === 0, conflicts };
}

export default { validateAll };
