import { describe, it, expect, beforeEach } from 'vitest';
import Scheduler from '../src/scheduler/Scheduler.js';

describe('Scheduler balancing of load', () => {
  let kernel, wm, scheduler;

  beforeEach(() => {
    global.Game = { time: 600 };
    wm = { _c: {}, list: (col)=>Object.values(wm._c[col]||{}), set: (col,obj)=>{ if(!wm._c[col]) wm._c[col]={}; wm._c[col][obj.id]=obj; }, get: (col,id)=> (wm._c[col]||{})[id] || null, delete: (col,id)=>{ if(wm._c[col]) delete wm._c[col][id]; } };
    const spatial = { computePath: (s,e)=>({ cost: Math.abs(s.x-e.x)+Math.abs(s.y-e.y), path: [] }), getTraffic: ()=>0 };
    kernel = { has: (n)=> n==='workingMemory' || n==='spatialEngine', get: (n)=> n==='workingMemory'? wm : spatial, config: { balanceWeight: 50 } };
    scheduler = new Scheduler(kernel);
  });

  it('prefers agents with fewer assignments', () => {
    global.Game.creeps = {
      A: { pos: { x:0,y:0,roomName:'R' }, memory: { skills: {} } },
      B: { pos: { x:0,y:1,roomName:'R' }, memory: { skills: {} } }
    };

    // pre-assign two tasks to A to simulate load
    const t0 = { id: 'task_x', data: { goalId: 'gx', status: 'assigned', assignee: 'A', meta: { target: { x:5,y:5,roomName:'R' } } } };
    const assign0 = { id: 'assign_task_x_A_600', data: { taskId: 'task_x', agentId: 'A' } };
    const t1 = { id: 'task_y', data: { goalId: 'gy', status: 'assigned', assignee: 'A', meta: { target: { x:6,y:6,roomName:'R' } } } };
    const assign1 = { id: 'assign_task_y_A_600', data: { taskId: 'task_y', agentId: 'A' } };

    // New task closer to both, but prefer B because A is loaded
    const tnew = { id: 'task_new', data: { goalId: 'gnew', status: 'pending', meta: { target: { x:1,y:0,roomName:'R' } } } };

    wm._c.tasks = { [t0.id]: t0, [t1.id]: t1, [tnew.id]: tnew };
    wm._c.assignments = { [assign0.id]: assign0, [assign1.id]: assign1 };

    const assigns = scheduler.tick();
    expect(assigns.length).toBe(1);
    const assigned = wm.get('tasks', 'task_new').data.assignee;
    expect(assigned).toBe('B');
  });
});