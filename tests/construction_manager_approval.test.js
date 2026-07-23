import { describe, it, expect } from 'vitest';
import ConstructionManager from '../src/ConstructionManager.js';

describe('ConstructionManager approval gate', () => {
  it('skips creating sites when blueprint not approved and allowUnapproved=false', () => {
    const kernelMock = { has: () => true, get: () => ({ _blueprints: [ { room: 'W1N1', version: 1, blueprint: { placements: [ { x:25,y:25,type:'spawn' } ] } } ], _constructionPlans: [ { id: 'p1', data: { room: 'W1N1', x:25, y:25, type: 'spawn', blueprintVersion: 1 } } ], list: (col) => col === 'constructionPlans' ? kernelMock.get()._constructionPlans : kernelMock.get()[`_${col}`], set: (col, entry) => { kernelMock.get()[`_${col}`] = kernelMock.get()[`_${col}`] || []; kernelMock.get()[`_${col}`].push(entry); } }) };
    const mgr = new ConstructionManager(kernelMock);
    // default allowUnapproved=false
    const created = mgr.tick();
    expect(created.length).toBe(0);
  });

  it('creates sites when overlay approved', () => {
    const wm = { _blueprints: [ { room: 'W1N1', version: 2, blueprint: { placements: [ { x:25,y:25,type:'spawn' } ] } } ], _visualOverlays: [ { room: 'W1N1', version: 2, approved: true } ], _constructionPlans: [ { id: 'p2', data: { room: 'W1N1', x:25, y:25, type: 'spawn', blueprintVersion: 2 } } ], list: (col) => wm[`_${col}`] || [], set: (col, entry) => { wm[`_${col}`] = wm[`_${col}`] || []; wm[`_${col}`].push(entry); } };
    const kernelMock = { has: () => true, get: () => wm };
    const mgr = new ConstructionManager(kernelMock);
    const created = mgr.tick();
    expect(created.length).toBe(1);
    expect(wm._constructionSites.length).toBe(1);
  });

  it('creates sites when allowUnapproved=true', () => {
    const wm = { _blueprints: [ { room: 'W1N1', version: 3, blueprint: { placements: [ { x:25,y:25,type:'spawn' } ] } } ], _constructionPlans: [ { id: 'p3', data: { room: 'W1N1', x:25, y:25, type: 'spawn', blueprintVersion: 3 } } ], list: (col) => wm[`_${col}`] || [], set: (col, entry) => { wm[`_${col}`] = wm[`_${col}`] || []; wm[`_${col}`].push(entry); }, config: { constructionAllowUnapproved: true } };
    const kernelMock = { has: () => true, get: () => wm, config: { constructionAllowUnapproved: true } };
    const mgr = new ConstructionManager(kernelMock);
    // override allowUnapproved from wm.config
    mgr.allowUnapproved = true;
    const created = mgr.tick();
    expect(created.length).toBe(1);
  });
});
