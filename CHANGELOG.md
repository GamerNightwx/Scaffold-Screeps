# Changelog

## Unreleased

- Spawn autoscaling for HaulerPools: SpawnManager auto-enqueues hauler spawn requests when pools lack members; configurable via kernel.config.
- Spawn reconciliation: SpawnManager reconciles WM spawn jobs with Game.creeps and notifies HaulerPool.
- HaulerManager reconciliation: assigns spawned creeps to logistics jobs and creates Tasks for pool members.
- AgentRuntime improvements: simulates pickup/transfer throughput based on creep carry capacity; new kernel.config knobs to tune throughput/pickup fractions.
- Blueprints: hauler blueprint annotates meta.expectedCarryCapacity to help reconcilers set creep memory hints.

