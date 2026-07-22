import { describe, it, expect, beforeEach } from 'vitest';
import Scheduler from '../src/scheduler/Scheduler.js';

describe('Scheduler preemption', () => {
  let kernel, wm, scheduler;

  beforeEach(() => {
    global.Game = { time: 700 };
    wm = { _c: {}, list: (col)=>Object.values(wm._c[col]||{}), set: (col,obj)=>{ if(!wm._c[col]) wm._c[col]={}; wm._c[col][obj.id]=obj; }, get: (col,id)=> (wm._c[col]||{})[id] || null, delete: (col,id)=>{ if(wm._c[col]) delete wm._c[col][id]; } };
    const spatial = { computePath: (s,e)=>({ cost: Math.abs(s.x-e.x)+Math.abs(s.y-e.y), path: [] }), getTraffic: ()=>0 };
    kernel = { has: (n)=> n==='workingMemory' || n==='spatialEngine', get: (n)=> n==='workingMemory'? wm : spatial, config: { preemptionThreshold: 0 } };
    scheduler = new Scheduler(kernel);
  });

  it('reassigns agent when new higher-value task appears', () => {
    global.Game.creeps = {
      A: { pos: { x:0,y:0,roomName:'R' }, memory: { skills: {} } },
      B: { pos: { x:10,y:0,roomName:'R' }, memory: { skills: {} } }
    };

    // Existing assigned task on A that is far and low priority
    const told = { id: 'task_old', data: { goalId: 'gold', status: 'assigned', assignee: 'A', priority: 0, meta: { target: { x:9,y:0,roomName:'R' } } } };
    const assignOld = { id: 'assign_task_old_A_700', data: { taskId: 'task_old', agentId: 'A' } };

    // New high-priority task near A should preempt old
    const tnew = { id: 'task_new', data: { goalId: 'gnew', status: 'pending', priority: 10, meta: { target: { x:1,y:0,roomName:'R' } } } };

    wm._c.tasks = { [told.id]: told, [tnew.id]: tnew };
    wm._c.assignments = { [assignOld.id]: assignOld };

    const assigns = scheduler.tick();
    // expect A to be assigned to task_new via preemption
    const updatedNew = wm.get('tasks', 'task_new');
    expect(updatedNew.data.assignee).toBe('A');
    // old task should be unassigned/pending
    const updatedOld = wm.get('tasks', 'task_old');
    expect(updatedOld.data.status).toBe('pending');
  });
});