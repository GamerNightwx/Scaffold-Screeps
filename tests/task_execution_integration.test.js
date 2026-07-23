import { describe, it, expect, beforeEach } from 'vitest';
import TaskEngine from '../src/tasks/TaskEngine.js';
import AgentRuntime from '../src/agent/AgentRuntime.js';
import CommandEngine from '../src/command/CommandEngine.js';

describe('End-to-end task execution (transport)', () => {
  let wm, kernel, te, ar, ce;

  beforeEach(() => {
    global.Game = { time: 2000, creeps: {} };
    // simple WM mock
    wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null, delete: (col,id)=>{ if(wm._c[col]) delete wm._c[col][id]; } };

    // kernel with workingMemory and commandEngine
    kernel = { has: (n) => n === 'workingMemory' || n === 'commandEngine' || n === 'spatialEngine', get: (n) => n === 'workingMemory' ? wm : (n === 'commandEngine' ? ce : (n === 'spatialEngine' ? { recordTraffic: ()=>{} } : null)) };

    // command engine with simple executor that records calls
    ce = new CommandEngine(kernel, (agentId, cmd) => {
      const creep = Game.creeps[agentId];
      // simulate move/transfer by setting flags on creep
      if (!creep._commands) creep._commands = [];
      creep._commands.push(cmd);
      return 0;
    });

    // rewire kernel.get to return ce
    kernel.get = (n) => n === 'workingMemory' ? wm : (n === 'commandEngine' ? ce : (n === 'spatialEngine' ? { recordTraffic: ()=>{} } : null));

    te = new TaskEngine(kernel);
    ar = new AgentRuntime(kernel);
  });

  it('AgentRuntime runs transport task and TaskEngine completes it', () => {
    // create task and assignment
    const taskId = 'task-j1-creepX';
    const task = {
      id: taskId,
      data: {
        type: 'transfer',
        assignee: 'creepX',
        status: 'assigned',
        priority: 50,
        meta: { jobId: 'j1', from: { id: 'c1' }, to: { id: 's1' }, amount: 100 }
      }
    };
    wm.set('tasks', task);
    const assignment = { id: 'assign-task-j1-creepX-1', data: { taskId: taskId, agentId: 'creepX' } };
    wm.set('assignments', assignment);

    // create creep
    Game.creeps = { creepX: { name: 'creepX', memory: { role: 'transporter' }, store: {}, moveTo: (t)=>0, transfer: (targetId, res)=>0 } };

    // tick AgentRuntime to set task in_progress and issue commands
    ar.tick();
    let t = wm.get('tasks', taskId);
    expect(t.data.status).toBe('in_progress');

    // run TaskEngine several ticks until completion
    for (let i=0;i<10;i++) {
      te.tick();
      t = wm.get('tasks', taskId);
      if (t.data.status === 'done') break;
    }

    expect(t.data.status).toBe('done');
    // ensure command was executed by AgentRuntime via CommandEngine
    const creep = Game.creeps.creepX;
    expect(creep._commands && creep._commands.length).toBeGreaterThan(0);
  });
});