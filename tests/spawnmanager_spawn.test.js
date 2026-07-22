import { describe, it, expect, beforeEach } from 'vitest';
import SpawnManager from '../src/spawn/SpawnManager.js';

describe('SpawnManager.spawnNext', () => {
  let wm;
  let sm;

  beforeEach(() => {
    wm = { _c: {}, list: (col) => Object.values(wm._c[col] || {}), set: (col, obj) => { if (!wm._c[col]) wm._c[col] = {}; wm._c[col][obj.id] = obj; }, get: (col, id) => (wm._c[col] || {})[id] || null };
  });

  it('persists a spawn job and uses Game.spawns.spawnCreep when kernel.spawn absent', () => {
    global.Game = { time: 12345, spawns: {
      S1: {
        spawnCreep: (body, name, opts) => {
          // emulate success code 0
          Game._last = { body, name, opts };
          return 0;
        }
      }
    } };

    const kernel = { has: (n) => n === 'workingMemory', get: (n) => n === 'workingMemory' ? wm : null };
    sm = new SpawnManager(kernel);
    // register simple blueprint
    sm.registerBlueprint('test', () => ({ body: ['WORK','CARRY','MOVE'] }));
    const id = sm.enqueue({ blueprint: 'test', priority: 1, meta: { role: 'harvester' } });

    const job = sm.spawnNext();
    expect(job).toBeDefined();
    expect(job.data.status).toBe('spawning');
    expect(job.data.attempt).toBeDefined();
    expect(job.data.attempt.spawn).toBe('S1');
    expect(job.data.result).toBe(0);
    // ensure persisted in WM
    const persisted = wm.get('spawns', job.id);
    expect(persisted).not.toBeNull();
    expect(persisted.data.status).toBe('spawning');
  });

  it('calls kernel.spawn when available and records result', () => {
    global.Game = { time: 999 };
    const kernel = {
      has: (n) => n === 'workingMemory',
      get: (n) => n === 'workingMemory' ? wm : null,
      spawn: (jobData) => {
        kernel._last = jobData;
        return { accepted: true, queued: true };
      }
    };

    sm = new SpawnManager(kernel);
    sm.registerBlueprint('test', () => ({ body: ['WORK','CARRY','MOVE'] }));
    sm.enqueue({ blueprint: 'test', priority: 1 });
    const job = sm.spawnNext();
    expect(job.data.status).toBe('requested');
    expect(job.data.result).toEqual({ accepted: true, queued: true });
    const persisted = wm.get('spawns', job.id);
    expect(persisted.data.status).toBe('requested');
  });
});
