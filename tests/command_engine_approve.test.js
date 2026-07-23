import { describe, it, expect, vi } from 'vitest';
import CommandEngine from '../src/command/CommandEngine.js';

describe('CommandEngine approveBlueprint', () => {
  it('marks blueprint and overlay as approved via execute', () => {
    const wm = {
      _blueprints: [ { room: 'W1N1', version: 5, blueprint: { placements: [] } } ],
      _visualOverlays: [ { room: 'W1N1', version: 5, overlay: [] } ],
      list: (col) => wm[`_${col}`] || [],
      write: vi.fn((col, entry) => { wm[`_${col}`] = wm[`_${col}`] || []; /* upsert simulation */ return entry; })
    };

    const kernelMock = { has: (n) => n === 'workingMemory', get: (n) => wm };
    const ce = new CommandEngine(kernelMock);
    const res = ce.execute('sys', { action: 'approveBlueprint', room: 'W1N1', version: 5 });

    expect(res).toEqual({ approvedCount: 1, overlayCount: 1 });
    expect(wm._blueprints[0].blueprint.approved).toBe(true);
    expect(wm._visualOverlays[0].approved).toBe(true);
  });

  it('returns error when missing params', () => {
    const kernelMock = { has: () => false };
    const ce = new CommandEngine(kernelMock);
    const res = ce.execute('sys', { action: 'approveBlueprint', room: 'W1N1' });
    expect(res && res.error).toBeTruthy();
  });
});
