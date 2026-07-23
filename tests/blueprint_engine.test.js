// Vitest globals are available; use ESM import
import * as BlueprintEngine from '../src/BlueprintEngine.js';

describe('BlueprintEngine - skeleton', () => {
  it('generates a basic blueprint for rcl 3 including spawn and container', () => {
    const terrain = { isWall: () => false };
    const existing = [];
    const bp = BlueprintEngine.generateBlueprint(3, terrain, existing);

    const hasSpawn = bp.placements.some(p => p.type === 'spawn');
    const hasContainer = bp.placements.some(p => p.type === 'container');

    expect(hasSpawn).toBe(true);
    expect(hasContainer).toBe(true);
  });

  it('validatePlacement returns valid=false when a placement collides with existing structure', () => {
    const terrain = { isWall: () => false };
    // spawn placed at center by generator
    const bp = BlueprintEngine.generateBlueprint(1, terrain, []);
    const center = bp.placements.find(p => p.type === 'spawn');

    const existing = [{ x: center.x, y: center.y, type: 'spawn' }];
    const res = BlueprintEngine.validatePlacement(bp, terrain, existing, []);

    expect(res.valid).toBe(false);
    expect(res.conflicts.length).toBeGreaterThan(0);
    expect(res.conflicts[0].type).toBe('structure');
  });

  it('persistBlueprint writes to workingMemory using common APIs', () => {
    const terrain = { isWall: () => false };
    const bp = BlueprintEngine.generateBlueprint(2, terrain, []);

    const wmMock = { write: vi.fn() };
    BlueprintEngine.persistBlueprint(wmMock, 'W1N1', 2, bp);

    expect(wmMock.write).toHaveBeenCalledWith('blueprints', expect.objectContaining({ room: 'W1N1' }));
  });

  it('validatePlacement detects terrain walls', () => {
    const terrain = { isWall: (x, y) => x === 25 && y === 25 };
    const bp = BlueprintEngine.generateBlueprint(1, terrain, []);
    const res = BlueprintEngine.validatePlacement(bp, terrain, [], []);

    expect(res.valid).toBe(false);
    expect(res.conflicts.some(c => c.type === 'terrain')).toBe(true);
  });
});
