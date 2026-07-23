// ConsoleDump - helper to pretty-print visualShapes for a room

export function dumpRoomShapes(workingMemory, room) {
  if (!workingMemory) return '';

  let shapes = [];
  if (typeof workingMemory.list === 'function') shapes = workingMemory.list('visualShapes') || [];
  else shapes = workingMemory._visualShapes || [];

  const roomShapes = shapes.filter(s => s && s.room === room);
  if (roomShapes.length === 0) return `No visualShapes for ${room}`;

  const lines = [];
  lines.push(`VisualShapes for ${room} (count: ${roomShapes.length}):`);
  roomShapes.forEach((entry, idx) => {
    lines.push(`- version: ${entry.version} createdAt: ${entry.createdAt}`);
    if (entry.shapes && Array.isArray(entry.shapes)) {
      entry.shapes.forEach(sh => {
        if (sh.type && sh.point) {
          lines.push(`  * ${sh.type} @ (${sh.point.x},${sh.point.y})`);
        } else if (sh.type && sh.points) {
          const pts = sh.points.map(p => `(${p.x},${p.y})`).join(',');
          lines.push(`  * ${sh.type} [${pts}]`);
        }
      });
    }
  });

  const out = lines.join('\n');
  // also log to console for live debugging
  try {
    // use safe Logger if available
    // eslint-disable-next-line import/no-unresolved
    const Logger = (typeof require === 'function') ? require('./Logger.js').default : null;
    if (Logger && typeof Logger.log === 'function') {
      Logger.log(out);
    } else if (typeof console !== 'undefined' && typeof console.log === 'function') {
      console.log(out);
    }
  } catch (e) {
    /* ignore logging errors */
  }

  return out;
}

export default { dumpRoomShapes };
