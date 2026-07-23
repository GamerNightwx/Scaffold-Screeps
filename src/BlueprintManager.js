// BlueprintManager: converts persisted blueprints into constructionPlans
// - Reads blueprints from WorkingMemory
// - Generates constructionPlans entries per placement, with priority and status
// - Avoids duplicates by checking existing constructionPlans for same room/x,y,type
// - Rate-limits creations per tick via config param (maxPerTick)

import Logger from './Logger.js';

async function _readFromWM(wm, key) {
  if (!wm) return [];
  if (typeof wm.list === 'function') return wm.list(key) || [];
  return wm[`_${key}`] || [];
}

function _writeToWM(wm, key, entry) {
  if (!wm) return null;
  if (typeof wm.write === 'function') return wm.write(key, entry);
  if (typeof wm.upsert === 'function') return wm.upsert(key, entry);
  wm[`_${key}`] = wm[`_${key}`] || [];
  wm[`_${key}`].push(entry);
  return entry;
}

function _planKey(p) {
  return `${p.room}:${p.x},${p.y}:${p.type}`;
}

export async function tick(kernelOrWM, options = {}) {
  // Accept either kernel or raw workingMemory for compatibility with tests and kernel registration
  let wm;
  if (kernelOrWM && typeof kernelOrWM.get === 'function') wm = kernelOrWM.get('workingMemory');
  else wm = kernelOrWM;

  const maxPerTick = options.maxPerTick || (wm && wm.config && wm.config.blueprintMaxPerTick) || 10;

  const blueprints = await _readFromWM(wm, 'blueprints');
  if (!Array.isArray(blueprints) || blueprints.length === 0) return 0;

  // existing plans map for dedupe
  const existingPlans = await _readFromWM(wm, 'constructionPlans');
  const existingMap = new Set((existingPlans || []).map(p => _planKey({ room: p.room, x: p.data && p.data.x, y: p.data && p.data.y, type: p.data && p.data.type })));

  let created = 0;

  // Sort blueprints by version ascending, but prefer valid ones first
  const sorted = blueprints.slice().sort((a,b) => (a.version||0)-(b.version||0));

  for (const bpEntry of sorted) {
    if (!bpEntry || !bpEntry.blueprint || !Array.isArray(bpEntry.blueprint.placements)) continue;
    const room = bpEntry.room;
    for (const p of bpEntry.blueprint.placements) {
      if (created >= maxPerTick) return created;

      const planObj = { room, data: { x: p.x, y: p.y, type: p.type, priority: p.priority || 0, blueprintVersion: bpEntry.version }, status: 'proposed', createdAt: new Date().toISOString() };
      const key = _planKey({ room: planObj.room, x: planObj.data.x, y: planObj.data.y, type: planObj.data.type });
      if (existingMap.has(key)) continue;

      _writeToWM(wm, 'constructionPlans', planObj);
      existingMap.add(key);
      created++;
    }
  }

  if (created > 0 && typeof Game !== 'undefined' && Game.time) {
    Logger.log(`[T${Game.time}] BlueprintManager: Created ${created} construction plans`);
  }

  return created;
}

// default export is a factory function used by Kernel registration; attach tick for tests
export default function BlueprintManagerFactory(kernel) {
  return { tick: () => tick(kernel) };
}

// attach tick so tests importing default can call default.tick(...)
BlueprintManagerFactory.tick = tick;
