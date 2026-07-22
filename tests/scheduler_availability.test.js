import { describe, it, expect, beforeEach } from 'vitest';
import Scheduler from '../src/scheduler/Scheduler.js';

describe('Scheduler availability and cost factors', () => {
  let kernel, wm, scheduler, spatial;

  beforeEach(() => {
    global.Game = { time: 200 };
    wm = { _c: {}, list: (c)=>Object.values(wm._c[c]||{}), set: (c,o)=>{ if(!wm._c[c]) wm._c[c]={}; wm._c[c][o.id]=o; }, get: (c,id)=> (wm._c[c]||{})[id]||null };

    // spatial mock with computePath and getTraffic
    spatial = {
      computePath: (s,e) => ({ cost: Math.abs(s.x - e.x) + Math.abs(s.y - e.y), path: [] }),
      getTraffic: (room) => (room === 'R' ? 3 : 0)
    };

    kernel = { has: (n)=> n === 'workingMemory' || n === 'spatialEngine', get: (n)=> n === 'workingMemory' ? wm : (n === 'spatialEngine' ? spatial : null) };
    scheduler = new Scheduler(kernel);
  });

  it('avoids agents without required energy', () => {
    global.Game.creeps = {
      A: { pos: { x:0,y:0,roomName:'R' }, energy: 0, memory: { skills: {} } },
      B: { pos: { x:5,y:0,roomName:'R' }, energy: 50, memory: { skills: {} } }
    };

    const t = { id: 'task1', data: { goalId:'g', status:'pending', type:'harvest', priority:0, meta:{ target:{x:1,y:0,roomName:'R'}, requiredEnergy: 30 } } };
    wm._c.tasks = { [t.id]: t };

    const assigns = scheduler.tick();
    expect(assigns.length).toBe(1);
    const assigned = wm.get('tasks', t.id).data.assignee;
    expect(assigned).toBe('B');
  });

  it('prefers skilled agent even if farther', () => {
    global.Game.creeps = {
      slow: { pos: { x:0,y:0,roomName:'R' }, energy: 100, memory: { skills: { build: 0 } } },
      pro: { pos: { x:10,y:0,roomName:'R' }, energy: 100, memory: { skills: { build: 3 } } }
    };

    const t = { id: 'task2', data: { goalId:'g2', status:'pending', type:'build', priority:0, meta:{ target:{x:2,y:0,roomName:'R'} } } };
    wm._c.tasks = { [t.id]: t };

    const assigns = scheduler.tick();
    expect(assigns.length).toBe(1);
    const assigned = wm.get('tasks', t.id).data.assignee;
    // pro should be preferred due to skill
    expect(assigned).toBe('pro');
  });
});