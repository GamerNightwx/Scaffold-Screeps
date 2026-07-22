import { describe, it, expect, beforeEach } from 'vitest';
import Scheduler from '../src/scheduler/Scheduler.js';

describe('Scheduler configurable skill penalty and aliasing', () => {
  let kernel, wm, scheduler;

  beforeEach(() => {
    global.Game = { time: 500 };
    wm = { _c: {}, list: (col)=>Object.values(wm._c[col]||{}), set: (col,obj)=>{ if(!wm._c[col]) wm._c[col]={}; wm._c[col][obj.id]=obj; }, get: (col,id)=> (wm._c[col]||{})[id] || null };
    const spatial = { computePath: (s,e)=>({ cost: Math.abs(s.x-e.x)+Math.abs(s.y-e.y), path: [] }), getTraffic: ()=>0 };
    // kernel with custom config to lower missingSkillPenalty and increase proficiency scale
    kernel = { has: (n)=> n==='workingMemory' || n==='spatialEngine', get: (n)=> n==='workingMemory'? wm : spatial, config: { missingSkillPenalty: 0, skillProficiencyScale: 2.0, skillAliases: { carry: ['transport'] } } };
    scheduler = new Scheduler(kernel);
  });

  it('uses configured missingSkillPenalty so unskilled agent may still be picked', () => {
    global.Game.creeps = {
      A: { pos: { x:0,y:0,roomName:'R' }, memory: { skills: {} } },
      B: { pos: { x:5,y:0,roomName:'R' }, memory: { skills: { carry: 1 } } }
    };

    const t = { id: 'task_c', data: { goalId: 'gc', status: 'pending', type: 'carry', meta: { target: { x:1,y:0,roomName:'R' }, requiredSkill: 'carry' } } };
    wm._c.tasks = { [t.id]: t };

    const assigns = scheduler.tick();
    expect(assigns.length).toBe(1);
    const assigned = wm.get('tasks', t.id).data.assignee;
    // with small penalty, nearer unskilled agent A should be chosen over B farther away despite skill
    expect(assigned).toBe('A');
  });

  it('honors skill aliasing (transport -> carry)', () => {
    global.Game.creeps = {
      A: { pos: { x:0,y:0,roomName:'R' }, memory: { skills: { transport: 1 } } },
      B: { pos: { x:10,y:0,roomName:'R' }, memory: { skills: {} } }
    };
    const t = { id: 'task_alias', data: { goalId: 'ga', status: 'pending', type: 'carry', meta: { target: { x:1,y:0,roomName:'R' }, requiredSkill: 'carry' } } };
    wm._c.tasks = { [t.id]: t };
    const assigns = scheduler.tick();
    expect(assigns.length).toBe(1);
    const assigned = wm.get('tasks', t.id).data.assignee;
    expect(assigned).toBe('A');
  });
});
