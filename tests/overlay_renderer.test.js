import { describe, it, expect } from 'vitest';
import { renderOverlay } from '../src/OverlayRenderer.js';

describe('OverlayRenderer', () => {
  it('renders points for non-road placements', () => {
    const entry = { overlay: [ { x: 10, y: 10, type: 'spawn' }, { x: 12, y: 12, type: 'container' } ] };
    const shapes = renderOverlay(entry);
    expect(shapes.length).toBe(2);
    expect(shapes.some(s => s.type === 'spawnPoint')).toBe(true);
    expect(shapes.some(s => s.type === 'containerPoint')).toBe(true);
  });

  it('groups adjacent road tiles into lines', () => {
    // horizontal line at y=5 x=1..4 and a separate single road at (10,10)
    const roadPts = [1,2,3,4].map(x => ({ x, y: 5, type: 'road' }));
    roadPts.push({ x: 10, y: 10, type: 'road' });
    const entry = { overlay: roadPts };
    const shapes = renderOverlay(entry);

    // Expect one roadLine and one single-point roadLine treated as 'p' orientation
    expect(shapes.filter(s => s.type === 'roadLine').length).toBe(2);
    const long = shapes.find(s => s.points && s.points.length === 4);
    expect(long).toBeTruthy();
  });
});
