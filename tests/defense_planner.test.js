import { describe, it, expect } from 'vitest';
import DefensePlanner from '../src/DefensePlanner.js';

describe('DefensePlanner', () => {
  it('detects chokepoints from path samples', () => {
    const planner = new DefensePlanner();
    // create many paths funneling through (10,10) in R1
    const paths = [];
    for (let i=0;i<8;i++) {
      paths.push([
        {x:5+i,y:8,roomName:'R1'},
        {x:6+i,y:9,roomName:'R1'},
        {x:10,y:10,roomName:'R1'},
        {x:11,y:11,roomName:'R1'}
      ]);
    }

    const chokes = planner.detectChokePoints(paths, { minCount: 5, maxOpenNeighbors: 6 });
    expect(chokes.length).toBeGreaterThan(0);
    expect(chokes[0].room).toBe('R1');
    expect(chokes[0].x).toBe(10);
    expect(chokes[0].y).toBe(10);
  });

  it('proposes defense plans and persitsable objects', () => {
    const planner = new DefensePlanner();
    const paths = [
      [{x:10,y:10,roomName:'R2'},{x:11,y:10,roomName:'R2'},{x:12,y:10,roomName:'R2'}],
      [{x:9,y:9,roomName:'R2'},{x:10,y:10,roomName:'R2'},{x:11,y:10,roomName:'R2'}],
      [{x:8,y:8,roomName:'R2'},{x:9,y:9,roomName:'R2'},{x:10,y:10,roomName:'R2'}],
      [{x:7,y:7,roomName:'R2'},{x:8,y:8,roomName:'R2'},{x:9,y:9,roomName:'R2'}],
      [{x:10,y:10,roomName:'R2'},{x:11,y:11,roomName:'R2'},{x:12,y:12,roomName:'R2'}],
    ];

    const proposals = planner.proposeDefenses({ paths, minCount: 3 });
    expect(proposals.length).toBeGreaterThan(0);
    const p = proposals.find(pp => pp.data && pp.data.room === 'R2' && pp.data.x === 10 && pp.data.y === 10);
    expect(p).toBeDefined();
  });
});
