// Simple Blueprint Engine skeleton
// Provides generateBlueprint, validatePlacement, and persistBlueprint helpers.

function _center() {
  return { x: 25, y: 25 };
}

function _pointEquals(a, b) {
  return a.x === b.x && a.y === b.y;
}

import { templates as bpTemplates } from './BlueprintTemplates.js';

function generateBlueprint(rcl = 1, roomTerrain = { isWall: () => false }, existingStructures = [], options = {}) {
  // Minimal, deterministic blueprint generator useful for tests and as a starting point.
  const center = _center();
  const placements = [];

  // If there is a canonical template for this RCL, use it (translate offsets to center)
  const tpl = bpTemplates && bpTemplates[rcl];
  if (Array.isArray(tpl) && tpl.length > 0) {
    tpl.forEach(p => {
      placements.push({ x: center.x + (p.x || 0), y: center.y + (p.y || 0), type: p.type, priority: p.priority || 0 });
    });
  } else {
    if (rcl >= 1) {
      placements.push({ x: center.x, y: center.y, type: 'spawn', priority: 10 });
    }

    if (rcl >= 2) {
      // Add a few extension positions around the spawn
      const extOffsets = [
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: -1 },
        { x: 0, y: 1 },
      ];
      extOffsets.forEach((o, i) => {
        placements.push({ x: center.x + o.x, y: center.y + o.y, type: 'extension', priority: 5 + i });
      });
    }

    if (rcl >= 3) {
      // Place a container near the spawn
      placements.push({ x: center.x + 2, y: center.y, type: 'container', priority: 6 });
    }
  }

  // Simple road proposals: straight lines connecting spawn to container (if present)
  const spawn = placements.find(p => p.type === 'spawn');
  const container = placements.find(p => p.type === 'container');
  if (spawn && container) {
    const dx = Math.sign(container.x - spawn.x);
    const dy = Math.sign(container.y - spawn.y);
    let x = spawn.x + dx;
    let y = spawn.y + dy;
    while (x !== container.x || y !== container.y) {
      placements.push({ x, y, type: 'road', priority: 1 });
      if (x !== container.x) x += dx;
      if (y !== container.y) y += dy;
    }
  }

  return { rcl, placements, generatedAt: Date.now() };
}

function validatePlacement(blueprint, roomTerrain = { isWall: () => false }, existingStructures = [], constructionSites = []) {
  const conflicts = [];

  for (const p of blueprint.placements) {
    // Terrain check
    if (roomTerrain.isWall && roomTerrain.isWall(p.x, p.y)) {
      conflicts.push({ type: 'terrain', placement: p, reason: 'wall' });
      continue;
    }

    // Existing structure conflict
    const structConflict = existingStructures.find(s => s.x === p.x && s.y === p.y);
    if (structConflict) {
      conflicts.push({ type: 'structure', placement: p, existing: structConflict });
      continue;
    }

    // Construction site conflict
    const siteConflict = constructionSites.find(s => s.x === p.x && s.y === p.y);
    if (siteConflict) {
      conflicts.push({ type: 'site', placement: p, site: siteConflict });
    }
  }

  return { valid: conflicts.length === 0, conflicts };
}

function persistBlueprint(workingMemory, room, rcl, blueprint) {
  // Use a monotonic-ish version to avoid collisions when called rapidly in tests
  const version = Date.now() + Math.floor(Math.random() * 1000000);
  const entry = { room, rcl, blueprint, version, createdAt: new Date().toISOString() };

  // Support a couple of workingMemory APIs used across the codebase
  if (workingMemory && typeof workingMemory.write === 'function') {
    return workingMemory.write('blueprints', entry);
  }
  if (workingMemory && typeof workingMemory.upsert === 'function') {
    return workingMemory.upsert('blueprints', entry);
  }
  if (workingMemory && typeof workingMemory.persist === 'function') {
    return workingMemory.persist('blueprints', entry);
  }

  // Fallback: attach to a simple in-memory object
  if (workingMemory) {
    workingMemory._blueprints = workingMemory._blueprints || [];
    workingMemory._blueprints.push(entry);
    return entry;
  }

  return null;
}

export { generateBlueprint, validatePlacement, persistBlueprint };
