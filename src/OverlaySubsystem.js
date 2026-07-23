import OverlayRenderer from './OverlayRenderer.js';
import Logger from './Logger.js';

// OverlaySubsystem: reads visualOverlays from WorkingMemory, renders shapes via OverlayRenderer,
// and persists visualShapes into WorkingMemory for UI/telemetry.

export default function OverlaySubsystem(kernel) {
  const wm = kernel.get('workingMemory');

  function _readOverlays() {
    if (!wm) return [];
    try {
      return wm.list('visualOverlays') || [];
    } catch (e) {
      return wm._visualOverlays || [];
    }
  }

  function _writeShapes(entry) {
    if (!wm) return null;
    if (typeof wm.write === 'function') return wm.write('visualShapes', entry);
    if (typeof wm.upsert === 'function') return wm.upsert('visualShapes', entry);
    wm._visualShapes = wm._visualShapes || [];
    wm._visualShapes.push(entry);
    return entry;
  }

  return {
    tick() {
      const overlays = _readOverlays();
      // For each overlay (usually one per blueprint version), render and persist a shape entry
      overlays.forEach(ov => {
        try {
          const shapes = OverlayRenderer.renderOverlay(ov);
          const entry = {
            room: ov.room,
            version: ov.version || Date.now(),
            shapes,
            createdAt: new Date().toISOString()
          };
          _writeShapes(entry);
        } catch (e) {
          // don't throw in tick
          Logger.error('[OverlaySubsystem] render error', e && e.message);
        }
      });

      return overlays.length;
    }
  };
}
