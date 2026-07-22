import { describe, it, expect, beforeEach } from 'vitest';
import Scheduler from '../src/scheduler/Scheduler.js';

describe('Scheduler skill-aware assignments', () => {
  let kernel, wm, scheduler;

  beforeEach(() => {
    global.Game = { time: 400 };
    wm = { _c: {}, list: (col)=>Object.values(wm._c[col]||{}), set: (col,obj)=>{ if(!wm._c[col]) wm._c[col]={}; wm._c[col][obj.id]=obj; }, get: (col,id)=> (wm._c[col]||{})[id] || null };
    const spatial = { computePath: (start,end)=>({ cost: Math.abs(start.x-end.x)+Math.abs(start.y-end.y), path: [] }), getTraffic: ()=>0 };
    kernel = { has: (n)=> n==='workingMemory' || n==='spatialEngine', get: (n)=> n==='workingMemory'? wm : spatial };
    scheduler = new Scheduler(kernel);
  });

  it('prefers agent with required skill over unskilled agent', () => {
    // two agents at same position; A has harvest skill
    global.Game.creeps = {
      agentA: { pos: { x:0,y:0,roomName:'R' }, memory: { skills: { harvest: 1 } } },
      agentB: { pos: { x:0,y:0,roomName:'R' }, memory: { skills: { } } }
    };

    const t = { id: 'task_h', data: { goalId: 'gh', status: 'pending', type: 'harvest', meta: { target: { x:1,y:0,roomName:'R' }, requiredSkill: 'harvest' } } };
    wm._c.tasks = { [t.id]: t };

    const assignments = scheduler.tick();
    expect(assignments.length).toBe(1);
    const assign = assignments[0];
    const updated = wm.get('tasks', t.id);
    expect(updated.data.assignee).toBe('agentA');
  });
});