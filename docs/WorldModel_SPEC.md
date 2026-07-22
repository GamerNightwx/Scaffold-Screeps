WorldModel Specification

Purpose

The WorldModel is the authoritative, immutable snapshot of the game state for a single tick. It provides fast, pre-computed indices and query APIs so other subsystems (Spatial, Scheduler, Decision, TaskEngine) can operate without calling the Game API repeatedly during the tick.

Design goals

- Deterministic snapshots: one snapshot per tick (tickId = Game.time)
- Immutable after creation for that tick
- Compact indices to enable O(1) lookups for common queries
- Serializable-friendly: ensure objects stored in WorkingMemory are JSON-serializable
- Support multi-room: indices keyed by room
- Support optional history retention for N previous ticks and basic compaction

Data model

WorldSnapshot {
  tickId: number,
  game: {
    time: number,
    creeps: Array< CreepModel >,
    structures: Array< StructureModel >,
    rooms: Array< RoomModel >,
    flags: Array< FlagModel >,
    resources: Array< ResourceModel >
  },
  memory: Object,
  indices: {
    creepsByRoom: { [roomName]: CreepModel[] },
    structuresByRoom: { [roomName]: StructureModel[] },
    structuresByType: { [type]: StructureModel[] },
    sourcesByRoom: { [roomName]: SourceModel[] },
    creepsById: { [id]: CreepModel },
    structuresById: { [id]: StructureModel }
  },
  meta: { timestamp: number, cpuUsed: number, cpuStarted?: number }
}

Entity shapes (summary)
- CreepModel: { id, name, room, pos: {x,y,roomName}, body: [{type,hits}], hits, hitsMax, energy, energyCapacity, memory }
- StructureModel: { id, type, room, pos: {x,y,roomName}, hits, hitsMax, energy?, energyCapacity?, owner? }
- RoomModel: { name, energyAvailable, energyCapacityAvailable, controller?, storage?, terminal?, sources: [], minerals: [] }
- SourceModel: { id, pos, energy, energyCapacity, ticksToRegeneration }
- ResourceModel: { id, type, amount, pos }

API (public)
- snapshot(): WorldSnapshot
  - Capture Game.* state, build indices and return snapshot.
  - Should be fast; heavy operations can be offloaded to SpatialEngine.
- current(): WorldSnapshot | null
- previous(): WorldSnapshot | null
- query(indexName: string, key: string): any[]
  - Return [] if not found
- entities(type: string): any[]
- history(fromTick: number, toTick: number): WorldSnapshot[] (optional)
- indexRefresh(roomName?: string): recompute indices for room (optional)
- invalidate(roomName): mark cached indices for room stale (optional)

History & retention

- Implement retention configurable N ticks (default 2: current+previous)
- For longer history, store compacted snapshots (indices removed) to reduce memory
- Provide migration hooks to upgrade snapshots when schemas change

Serialization & Memory safety

- WorldModel must avoid storing runtime-bound objects (functions, circular refs) inside WorkingMemory. When exposing snapshots to other systems, ensure copies are JSON-serializable.
- Provide exportForSerialization() helper that strips non-serializable fields.

Indices & Queries

- Indices must be kept small and keyed for common queries:
  - creepsByRoom[roomName] => CreepModel[]
  - structuresByType[type] => StructureModel[]
  - structuresByRoom[roomName] => StructureModel[]
  - sourcesByRoom[roomName] => SourceModel[]
  - creepsById[id] => CreepModel
  - structuresById[id] => StructureModel

Performance considerations

- Building indices is O(N) over captured entities; keep capture functions optimized.
- For large multi-room setups, consider sampling or tiered snapshots (detailed for owned rooms, lightweight for remote rooms).

Contracts

- Implement a strict WorldModelInterface (see src/contracts/Contracts.js) with method signatures and JSDoc.
- Tests should validate method presence and basic return shape for snapshot(), indices and entities().

Examples

const wm = new WorldModel();
const snap = wm.snapshot();
const creepsInRoom = wm.query('creepsByRoom', 'W0N0');

Upgrade path

- When changing entity shapes, bump schema version in snapshot.meta. Provide migration scripts to convert history entries.

Security & limits

- Avoid copying entire Memory into snapshot if Memory is large; instead capture only relevant sections or provide configurable whitelist.

