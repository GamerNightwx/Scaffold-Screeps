import { describe, it, expect, vi } from 'vitest';
import BlueprintPlanner from '../src/BlueprintPlanner.js';

describe('BlueprintPlanner.tick', () => {
  it('persists generated blueprint into WorkingMemory', async () => {
    const wmMock = { write: vi.fn((col, entry) => entry) };
    const res = await BlueprintPlanner.tick(wmMock, 'W1N1', 2);

    expect(wmMock.write).toHaveBeenCalledWith('blueprints', expect.objectContaining({ room: 'W1N1' }));
    expect(res.room).toBe('W1N1');
    expect(res.blueprint).toBeTruthy();
  });

  it('includes validation conflicts when existing structure collides', async () => {
    const center = { x: 25, y: 25 };
    // Provide a WM mock with an existing structure at spawn center
    const wmMock = {
      _structures: [{ x: center.x, y: center.y, type: 'spawn' }],
      write: vi.fn((col, entry) => entry),
    };

    const res = await BlueprintPlanner.tick(wmMock, 'W1N1', 1);

    expect(res.blueprint.valid).toBe(false);
    expect(Array.isArray(res.blueprint.conflicts)).toBe(true);
    expect(res.blueprint.conflicts.length).toBeGreaterThan(0);
    expect(res.blueprint.conflicts.some(c => c.type === 'structure')).toBe(true);
  });

  it('respects terrain provided by WM and marks terrain conflicts', async () => {
    // terrain marks center as wall
    const terrain = { isWall: (x, y) => x === 25 && y === 25 };
    const wmMock = { terrain, write: vi.fn((col, entry) => entry) };

    const res = await BlueprintPlanner.tick(wmMock, 'W1N1', 1);

    expect(res.blueprint.valid).toBe(false);
    expect(res.blueprint.conflicts.some(c => c.type === 'terrain')).toBe(true);
  });
});
