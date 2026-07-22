# Architecture & Contracts — Complete Reference (Phase 1 start)

This document defines the canonical modules, responsibilities, public interfaces (JS contracts), and a minimal test to assert contract presence. Use these contracts as the authoritative source when implementing or refactoring modules. They are intentionally lightweight JSDoc/abstract-class stubs to remain tool-friendly and testable.

## Modules

- Kernel — orchestrator, CPU/tick management, subsystem registry
- WorldModel — single source of truth: snapshot(), current(), indices, query()
- SpatialEngine — computePath(), distanceMatrix(), analyzeTopology(), getTraffic(), cleanup()
- Blackboard — emitEvent(), events(), emitAlert(), alerts(), clear(), metrics()
- WorkingMemory — set(), get(), list(), delete(), invalidateWhere()
- DecisionEngine — registerScorer(), evaluate(), tick(), getMetrics()
- TaskFactory — createTasksFromGoals(), tick()
- TaskEngine — tick(), createTask(), manage lifecycle
- Scheduler — tick(), getMetrics()
- AgentRuntime — tick(), translate/execute commands
- CommandEngine — execute(agentId, cmd)

## Contracts

See `src/contracts/Contracts.js` for JSDoc typedefs and abstract interface classes. Implementations should match these public methods (duck-typed) and include unit tests verifying behavior.

## Tests

`tests/contracts.test.js` checks that contract classes expose required method names and can be imported. CI should fail if contracts are removed or their public API changes unexpectedly.

## Next steps

1. Use these contracts when implementing remaining modules.
2. For each module, create unit tests that assert contract conformance and behavior (happy path and edge cases).
3. Add integration tests (Kernel + subsystems) that validate lifecycle order and CPU budgeting.


> This file is machine- and human-readable; keep it up-to-date as APIs evolve.
