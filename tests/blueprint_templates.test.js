import { describe, it, expect } from 'vitest';
import { generateBlueprint } from '../src/BlueprintEngine.js';
import { templates } from '../src/BlueprintTemplates.js';

describe('BlueprintTemplates integration', () => {
  it('uses template placements for rcl with template', () => {
    const bp = generateBlueprint(4, { isWall: () => false }, []);
    // template for rcl 4 includes a tower
    const hasTower = bp.placements.some(p => p.type === 'tower');
    const hasSpawn = bp.placements.some(p => p.type === 'spawn');
    expect(hasSpawn).toBe(true);
    expect(hasTower).toBe(true);
  });

  it('centers template placements at center', () => {
    const center = { x: 25, y: 25 };
    const bp = generateBlueprint(3, { isWall: () => false }, []);
    const spawn = bp.placements.find(p => p.type === 'spawn');
    expect(spawn.x).toBe(center.x);
    expect(spawn.y).toBe(center.y);
  });

  it('falls back when no template exists', () => {
    const bp = generateBlueprint(8, { isWall: () => false }, []);
    // no template for rcl 8 in our small set -> should at least have spawn
    const hasSpawn = bp.placements.some(p => p.type === 'spawn');
    expect(hasSpawn).toBe(true);
  });
});
