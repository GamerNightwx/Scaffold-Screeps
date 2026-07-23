import { generateBlueprint, persistBlueprint } from './BlueprintEngine.js';
import { validateAll } from './PlacementValidator.js';
import Logger from './Logger.js';

// BlueprintPlanner: small tick-based planner that generates blueprints per-room and
// persists them into WorkingMemory. Designed for test-safe operation when Game APIs
// are not available.

async function _readFromWM(workingMemory, key, room) {
  if (!workingMemory) return [];
  if (typeof workingMemory.read === 'function') {
    try {
      // Some workingMemory implementations accept (collection, filter)
      return await workingMemory.read(key, { room }) || [];
    } catch (e) {
      // Fallback to try without filter
      try { return await workingMemory.read(key) || []; } catch (e2) { /* ignore */ }
    }
  }
  if (typeof workingMemory.get === 'function') {
    return await workingMemory.get(key) || [];
  }
  // last-resort: direct property shadowing used by tests/mocks
  return workingMemory[`_${key}`] || [];
}

export async function tick(workingMemory, room, rcl = 1) {
  // Read existing structures/sites from WM if available
  const existingStructures = await _readFromWM(workingMemory, 'structures', room);
  const constructionSites = await _readFromWM(workingMemory, 'constructionSites', room);

  // Try to read a terrain helper from WM if provided (tests may inject it)
  const roomTerrain = (workingMemory && workingMemory.terrain) ? workingMemory.terrain : { isWall: () => false };

  const blueprint = generateBlueprint(rcl, roomTerrain, existingStructures, { room });
  const validation = validateAll(blueprint, workingMemory, { buffers: (workingMemory && workingMemory.config && workingMemory.config.placementBuffers) || undefined });

  // Attach validation results into blueprint for persistence/inspection
  blueprint.valid = validation.valid;
  blueprint.conflicts = validation.conflicts;

  // Compute a simple fingerprint for placements to detect changes
  const placementsKey = JSON.stringify(blueprint.placements.map(p => ({ x: p.x, y: p.y, type: p.type, priority: p.priority || 0 })));

  // Check last persisted blueprint for this room and avoid duplicate writes if unchanged
  const existingBps = await _readFromWM(workingMemory, 'blueprints', room) || [];
  // find latest by version or createdAt
  const latest = existingBps.slice().sort((a, b) => (b.version || 0) - (a.version || 0))[0];
  if (latest && latest.blueprint) {
    const latestKey = JSON.stringify((latest.blueprint.placements || []).map(p => ({ x: p.x, y: p.y, type: p.type, priority: p.priority || 0 })));
    if (latestKey === placementsKey) {
      // No changes; return latest without persisting new version
      // Also ensure visual overlay exists; if not, create it
      const overlays = await _readFromWM(workingMemory, 'visualOverlays', room) || [];
      const latestOverlay = overlays.slice().sort((a,b) => (b.version||0)-(a.version||0))[0];
      if (!latestOverlay) {
        const overlayEntry = {
          room,
          version: latest.version || Date.now(),
          overlay: (latest.blueprint && latest.blueprint.placements) ? latest.blueprint.placements.map(p => ({ x: p.x, y: p.y, type: p.type })) : [],
          createdAt: new Date().toISOString()
        };
        // try multiple WM write methods
        if (workingMemory && typeof workingMemory.write === 'function') workingMemory.write('visualOverlays', overlayEntry);
        else if (workingMemory && typeof workingMemory.upsert === 'function') workingMemory.upsert('visualOverlays', overlayEntry);
        else if (workingMemory) { workingMemory._visualOverlays = workingMemory._visualOverlays || []; workingMemory._visualOverlays.push(overlayEntry); }
      }

      return latest;
    }
  }

  // Persist into WM using persistBlueprint (it knows several WM APIs)
  const entry = persistBlueprint(workingMemory, room, rcl, blueprint);
  
  if (entry && entry.blueprint && entry.blueprint.placements) {
    const count = entry.blueprint.placements.length;
    if (typeof Game !== 'undefined' && Game.time) {
      Logger.log(`[T${Game.time}] BlueprintPlanner: Generated blueprint for ${room} (${count} placements, valid=${blueprint.valid})`);
    }
  }

  // Also create a visual overlay entry in WM for review (versioned)
  const overlayEntry = {
    room,
    version: (entry && entry.version) ? entry.version : Date.now(),
    overlay: (blueprint.placements || []).map(p => ({ x: p.x, y: p.y, type: p.type })),
    createdAt: new Date().toISOString()
  };

  if (workingMemory && typeof workingMemory.write === 'function') {
    workingMemory.write('visualOverlays', overlayEntry);
  } else if (workingMemory && typeof workingMemory.upsert === 'function') {
    workingMemory.upsert('visualOverlays', overlayEntry);
  } else if (workingMemory) {
    workingMemory._visualOverlays = workingMemory._visualOverlays || [];
    workingMemory._visualOverlays.push(overlayEntry);
  }

  return entry;
}

export default { tick };
