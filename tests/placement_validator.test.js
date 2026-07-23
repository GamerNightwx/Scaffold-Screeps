import { describe, it, expect } from 'vitest';
import { validateAll } from '../src/PlacementValidator.js';

describe('PlacementValidator', () => {
  it('detects terrain walls', () => {
    const blueprint = { placements: [ { x:25,y:25,type:'spawn' } ] };
    const wm = { terrain: { isWall: (x,y) => x===25 && y===25 }, list: (col) => [] };
    const res = validateAll(blueprint, wm);
    expect(res.valid).toBe(false);
    expect(res.conflicts.some(c => c.type === 'terrain')).toBe(true);
  });

  it('detects existing structure collision', () => {
    const blueprint = { placements: [ { x:10,y:10,type:'storage' } ] };
    const wm = { _structures: [ { x:10,y:10,type:'storage' } ] };
    const res = validateAll(blueprint, wm);
    expect(res.valid).toBe(false);
    expect(res.conflicts.some(c => c.type === 'structure')).toBe(true);
  });

  it('detects buffer violations near existing structures', () => {
    const blueprint = { placements: [ { x:5,y:5,type:'spawn' } ] };
    const wm = { _structures: [ { x:6,y:5,type:'storage' } ] };
    const res = validateAll(blueprint, wm);
    expect(res.valid).toBe(false);
    expect(res.conflicts.some(c => c.type === 'buffer')).toBe(true);
  });

  it('accepts valid placements', () => {
    const blueprint = { placements: [ { x:10,y:10,type:'extension' } ] };
    const wm = { _structures: [ { x:1,y:1,type:'spawn' } ] };
    const res = validateAll(blueprint, wm);
    expect(res.valid).toBe(true);
  });

  it('detects duplicates within blueprint', () => {
    const blueprint = { placements: [ { x:2,y:2,type:'extension' }, { x:2,y:2,type:'road' } ] };
    const wm = {};
    const res = validateAll(blueprint, wm);
    expect(res.conflicts.some(c => c.type === 'duplicate')).toBe(true);
  });
});
