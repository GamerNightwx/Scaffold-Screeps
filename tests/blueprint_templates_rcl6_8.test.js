import { describe, it, expect } from 'vitest';
import { generateBlueprint } from '../src/BlueprintEngine.js';

describe('BlueprintTemplates RCL6-8', () => {
  it('RCL6 includes storage and terminal', () => {
    const bp = generateBlueprint(6, { isWall: () => false }, []);
    expect(bp.placements.some(p => p.type === 'storage')).toBe(true);
    expect(bp.placements.some(p => p.type === 'terminal')).toBe(true);
  });

  it('RCL7 includes labs and towers', () => {
    const bp = generateBlueprint(7, { isWall: () => false }, []);
    expect(bp.placements.some(p => p.type === 'lab')).toBe(true);
    expect(bp.placements.some(p => p.type === 'tower')).toBe(true);
  });

  it('RCL8 includes powerSpawn and cluster of labs', () => {
    const bp = generateBlueprint(8, { isWall: () => false }, []);
    expect(bp.placements.some(p => p.type === 'powerSpawn')).toBe(true);
    const labs = bp.placements.filter(p => p.type === 'lab');
    expect(labs.length).toBeGreaterThanOrEqual(3);
  });
});
