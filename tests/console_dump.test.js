import { describe, it, expect, vi } from 'vitest';
import { dumpRoomShapes } from '../src/ConsoleDump.js';

describe('ConsoleDump.dumpRoomShapes', () => {
  it('returns message when no shapes', () => {
    const wm = { _visualShapes: [] };
    const out = dumpRoomShapes(wm, 'W1N1');
    expect(out).toBe('No visualShapes for W1N1');
  });

  it('prints shapes for a room', () => {
    const wm = { _visualShapes: [ { room: 'W1N1', version: 1, createdAt: 't', shapes: [ { type: 'spawnPoint', point: { x:1,y:1 } }, { type: 'roadLine', points: [ {x:1,y:1},{x:2,y:1} ] } ] } ] };
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const out = dumpRoomShapes(wm, 'W1N1');
    expect(out.includes('VisualShapes for W1N1')).toBe(true);
    expect(out.includes('spawnPoint')).toBe(true);
    spy.mockRestore();
  });
});
