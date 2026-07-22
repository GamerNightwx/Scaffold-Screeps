import { describe, it, expect } from 'vitest';
import * as C from '../src/contracts/Contracts.js';

// explicit mapping from contract name to implementation path
const IMPLEMENTATIONS = {
  Kernel: '../src/kernel/Kernel.js',
  WorldModel: '../src/core/WorldModel.js',
  SpatialEngine: '../src/spatial/SpatialEngine.js',
  Blackboard: '../src/blackboard/Blackboard.js',
  WorkingMemory: '../src/memory/WorkingMemory.js',
  DecisionEngine: '../src/decision/DecisionEngine.js',
  TaskFactory: '../src/tasks/TaskFactory.js',
  TaskEngine: '../src/tasks/TaskEngine.js',
  Scheduler: '../src/scheduler/Scheduler.js',
  AgentRuntime: '../src/agent/AgentRuntime.js',
  CommandEngine: '../src/command/CommandEngine.js'
};

describe('Contracts conformance (shape checks)', () => {
  for (const [name, path] of Object.entries(IMPLEMENTATIONS)) {
    it(`implementation ${name} exists and exposes interface methods`, async () => {
      const mod = await import(path);
      // default export should be a class or factory
      expect(mod).toBeTruthy();
      const impl = mod.default || mod[name];
      expect(typeof impl === 'function' || typeof impl === 'object').toBe(true);

      const iface = C[`${name}Interface`];
      expect(typeof iface).toBe('function');

      const ifaceMethods = Object.getOwnPropertyNames(iface.prototype).filter(m => m !== 'constructor');
      // If implementation is a class constructor, check prototype methods
      const proto = impl && impl.prototype ? impl.prototype : Object.getPrototypeOf(impl || {});

      for (const method of ifaceMethods) {
        const has = proto && typeof proto[method] === 'function';
        // allow implementations that are function factories returning objects: check instance shape if possible
        expect(has).toBe(true);
      }
    });
  }
});