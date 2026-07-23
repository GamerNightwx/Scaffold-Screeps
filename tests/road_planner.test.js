import { describe, it, expect } from 'vitest';
import RoadPlanner from '../src/RoadPlanner.js';

describe('RoadPlanner', () => {
  it('builds heatmap and proposes roads above threshold', () => {
    const planner = new RoadPlanner();

    const paths = [
      [{x:10,y:20,roomName:'W1N1'},{x:11,y:20,roomName:'W1N1'},{x:12,y:20,roomName:'W1N1'}],
      [{x:10,y:20,roomName:'W1N1'},{x:11,y:20,roomName:'W1N1'}],
      [{x:5,y:5,roomName:'W1N1'},{x:6,y:5,roomName:'W1N1'}],
      [{x:10,y:20,roomName:'W1N1'},{x:11,y:20,roomName:'W1N1'}],
      [{x:50,y:50,roomName:'W2N2'},{x:51,y:50,roomName:'W2N2'}],
      [{x:50,y:50,roomName:'W2N2'},{x:51,y:50,roomName:'W2N2'}],
    ];

    const heatmap = planner.buildHeatmap(paths);
    expect(heatmap.get('W1N1:10:20')).toBe(3);
    expect(heatmap.get('W1N1:11:20')).toBe(3);
    expect(heatmap.get('W2N2:50:50')).toBe(2);

    const proposals = planner.proposeRoads({ paths, minCount: 3 });
    // should include the two high-traffic positions in W1N1
    const keys = proposals.map(p => `${p.room}:${p.x}:${p.y}`);
    expect(keys).toContain('W1N1:10:20');
    expect(keys).toContain('W1N1:11:20');
    // W2N2 should not be included for minCount=3
    expect(keys).not.toContain('W2N2:50:50');
  });

  it('respects maxPerRoom limit', () => {
    const planner = new RoadPlanner();
    const paths = [];
    // create many hits in same room
    for (let i=0;i<10;i++) {
      paths.push([{x:1+i,y:2,roomName:'R1'},{x:1+i,y:3,roomName:'R1'}]);
      paths.push([{x:1+i,y:2,roomName:'R1'}]);
      paths.push([{x:1+i,y:2,roomName:'R1'}]);
    }
    const proposals = planner.proposeRoads({ paths, minCount: 2, maxPerRoom: 3 });
    // should return at most 3 proposals for R1
    const r1 = proposals.filter(p => p.room === 'R1');
    expect(r1.length).toBeLessThanOrEqual(3);
  });
});
