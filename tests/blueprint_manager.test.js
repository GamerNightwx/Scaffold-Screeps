import { describe, it, expect } from 'vitest';
import BlueprintManager from '../src/BlueprintManager.js';

describe('BlueprintManager.tick', () => {
  it('creates constructionPlans from blueprints', async () => {
    const wm = { _blueprints: [ { room: 'W1N1', version: 1, blueprint: { placements: [ { x:25,y:25,type:'spawn',priority:10 }, { x:26,y:25,type:'extension',priority:5 } ] } } ], _constructionPlans: [] };
    const created = await BlueprintManager.tick(wm, { maxPerTick: 10 });
    expect(created).toBe(2);
    expect(wm._constructionPlans.length).toBe(2);
    expect(wm._constructionPlans[0].room).toBe('W1N1');
  });

  it('respects maxPerTick rate limit', async () => {
    const placements = [];
    for (let i=0;i<10;i++) placements.push({ x:25+i, y:25, type: 'extension' });
    const wm = { _blueprints: [ { room: 'W1N1', version: 1, blueprint: { placements } } ], _constructionPlans: [] };

    const created = await BlueprintManager.tick(wm, { maxPerTick: 3 });
    expect(created).toBe(3);
    expect(wm._constructionPlans.length).toBe(3);
  });

  it('avoids duplicates when plans already exist', async () => {
    const bp = { room: 'W1N1', version: 1, blueprint: { placements: [ { x:25,y:25,type:'spawn' } ] } };
    const existingPlan = { room: 'W1N1', data: { x:25,y:25,type:'spawn' } };
    const wm = { _blueprints: [bp], _constructionPlans: [existingPlan] };

    const created = await BlueprintManager.tick(wm, { maxPerTick: 10 });
    expect(created).toBe(0);
  });
});
