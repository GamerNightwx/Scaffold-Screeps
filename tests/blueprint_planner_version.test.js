import { describe, it, expect, vi } from 'vitest';
import BlueprintPlanner from '../src/BlueprintPlanner.js';

describe('BlueprintPlanner versioning and overlay', () => {
  it('persists blueprint and visual overlay when none exist', async () => {
    const wmMock = {
      _blueprints: [],
      _visualOverlays: [],
      write: (col, entry) => {
        if (col === 'blueprints') wmMock._blueprints.push(entry);
        if (col === 'visualOverlays') wmMock._visualOverlays.push(entry);
        return entry;
      }
    };

    const res = await BlueprintPlanner.tick(wmMock, 'W1N1', 2);

    expect(wmMock._blueprints.length).toBe(1);
    expect(wmMock._visualOverlays.length).toBe(1);
    expect(res.room).toBe('W1N1');
  });

  it('does not persist a new blueprint when placements unchanged', async () => {
    const wmMock = {
      _blueprints: [],
      _visualOverlays: [],
      write: (col, entry) => {
        if (col === 'blueprints') wmMock._blueprints.push(entry);
        if (col === 'visualOverlays') wmMock._visualOverlays.push(entry);
        return entry;
      }
    };

    // first tick rcl=2
    await BlueprintPlanner.tick(wmMock, 'W1N1', 2);
    const before = wmMock._blueprints.length;

    // second tick same rcl -> should not increase blueprints
    const res2 = await BlueprintPlanner.tick(wmMock, 'W1N1', 2);
    const after = wmMock._blueprints.length;

    expect(before).toBe(1);
    expect(after).toBe(1);
    // returned entry should be the latest persisted one
    expect(res2.version).toBe(wmMock._blueprints[0].version);
  });

  it('persists new blueprint when RCL (or placements) change', async () => {
    const wmMock = {
      _blueprints: [],
      _visualOverlays: [],
      write: (col, entry) => {
        if (col === 'blueprints') wmMock._blueprints.push(entry);
        if (col === 'visualOverlays') wmMock._visualOverlays.push(entry);
        return entry;
      }
    };

    await BlueprintPlanner.tick(wmMock, 'W1N1', 2);
    const firstVersion = wmMock._blueprints[0].version;

    // change rcl to cause different placements
    await BlueprintPlanner.tick(wmMock, 'W1N1', 3);

    expect(wmMock._blueprints.length).toBe(2);
    expect(wmMock._blueprints[1].version).not.toBe(firstVersion);
  });
});
