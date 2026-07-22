# Phase 1: Spatial Engine — Complete

**Status:** ✅ DONE  
**Commit:** cf328c8  
**Test Coverage:** 14 tests, 100% passing  
**Build Time:** 257ms

---

## Overview

Phase 1 implements the **Spatial Engine**, the central module for all spatial knowledge in the bot. This includes pathfinding, distance calculations, and topology analysis.

### Principle

> Nenhum outro módulo usa PathFinder diretamente. Todos os conhecimentos espaciais passam pela Spatial Engine.

---

## Components Implemented

### `src/spatial/SpatialEngine.js`

**Responsabilidades:**
- Cache de pathfinding (wrapper em RoomPosition.findPathTo)
- Matriz de distâncias via flood-fill BFS
- Análise de topologia: chokepoints, áreas abertas, aglomerados de estruturas
- Métricas e monitoramento

**API Pública:**

```javascript
computePath(start, end, opts = {})
  → PathCacheEntry { path, cost, computedTick, ttl }
  
  Options:
    - ignoreCreeps: boolean (default: false)
    - range: number (default: 1)
    - ttl: number (default: 100 ticks)

distanceMatrix(roomName, origin)
  → Array<Array<number>> // 50x50 matrix, -1 = unreachable

analyzeTopology(roomName)
  → TopologyRegion[] 
    { type: 'chokepoint'|'open_area'|'structure_cluster',
      positions: RoomPosition[],
      priority: number }

cleanup()
  // Remove cached entries that expired

tick()
  // Called by Kernel each tick

getMetrics()
  → {
      pathCache: { size, hits, misses, hitRate },
      distanceMatrixCache: { size, computes },
      topologyCache: { size, analyzes }
    }
```

---

## Caching Strategy

### Path Cache
- **Key:** hash of `roomName:startX:startY→endX:endY:ignoreCreeps:range`
- **TTL:** 100 ticks (configurable per call)
- **Hit Rate Tracking:** Every miss/hit increments metrics

```javascript
// Example: cache hit on identical query
computePath(pos1, pos2);      // Miss, computed
computePath(pos1, pos2);      // Hit, returned from cache
Game.time += 101;
computePath(pos1, pos2);      // Miss, TTL expired, recomputed
```

### Distance Matrix Cache
- **Key:** `roomName:originX:originY`
- **TTL:** 10 ticks (fixed, recompute is expensive)
- **Algorithm:** BFS flood-fill from origin, O(50²) = 2500 positions

### Topology Cache
- **Key:** `roomName`
- **TTL:** 100 ticks
- **Cost:** O(n²) terrain analysis + structure iteration
- **Recompute:** When cache expires

---

## Integration with Kernel

**Registration in main.js:**
```javascript
subsystems: {
  spatialEngine: (k) => new SpatialEngine(k),
}
```

**Execution Order:** Phase order is:
```
Kernel.tick()
  → WorldModel (snapshot)
  → SpatialEngine (cleanup, metrics)
  → WorkingMemory
  → ... (other engines)
```

**Cleanup Lifecycle:**
- Called automatically via `tick()`
- Removes expired path cache entries (TTL check)
- Removes expired distance matrix entries (10-tick check)
- Topology cache managed by its own TTL

---

## Tests

**File:** `tests/spatial.test.js` (14 tests)

### Test Coverage

**computePath:**
- ✅ Calculates path between two points
- ✅ Caches paths and tracks hit count
- ✅ Respects TTL and expires cache

**distanceMatrix:**
- ✅ Computes 50x50 distance matrix
- ✅ Caches matrix (10 tick TTL)
- ✅ Expires cache after 10 ticks

**analyzeTopology:**
- ✅ Identifies topological regions
- ✅ Caches analysis (100 tick TTL)
- ✅ Recomputes after expiration

**cleanup:**
- ✅ Removes expired path cache entries
- ✅ Removes expired distance matrix entries

**getMetrics:**
- ✅ Returns cache statistics
- ✅ Calculates hit rate correctly (e.g., 50.0%, 33.3%)

**tick:**
- ✅ Executes cleanup on each tick

### Mocking Strategy

Tests mock Screeps Game API:
- `Game.time` for tick counting
- `RoomPosition.findPathTo()` returns simulated paths
- `Room.Terrain.get()` returns wall/walkable status

---

## Performance Notes

### CPU Cost

**Per Tick (worst case, all operations):**
- `computePath()`: ~0.1 CPU (cached) to ~1.5 CPU (new calculation)
- `distanceMatrix()`: ~5-8 CPU (BFS flood-fill on 50x50)
- `analyzeTopology()`: ~10-15 CPU (terrain scan + structure clustering)
- `cleanup()`: ~0.1 CPU (map iteration)

**Optimization:**
- Path cache prevents O(n) pathfinding calls
- Distance matrix reused for 10 ticks
- Topology computed once per 100 ticks

### Memory Cost

- Path cache: ~1 KB per cached path (typical path = 10-50 steps)
- Distance matrix: ~5 KB per room (50x50 array of numbers)
- Topology regions: ~500 B per region

Typical usage: < 50 KB total.

---

## Usage Example

```javascript
// In another engine (e.g., AgentRuntime)
const spatial = kernel.get('spatialEngine');

// Fast pathfinding with cache
const start = new RoomPosition(25, 25, 'E1N1');
const target = creep.pos;
const pathEntry = spatial.computePath(start, target, { range: 1 });
creep.moveByPath(pathEntry.path);

// Precompute distance matrix for expensive operations
const matrix = spatial.distanceMatrix('E1N1', spawn.pos);
console.log(`Distance from spawn to 10,10: ${matrix[10][10]}`);

// Analyze room layout once per 100 ticks
const regions = spatial.analyzeTopology('E1N1');
const chokepoints = regions.filter(r => r.type === 'chokepoint');
console.log(`Chokepoints in E1N1: ${chokepoints.length}`);

// Check cache performance
const metrics = spatial.getMetrics();
console.log(`Path cache hit rate: ${metrics.pathCache.hitRate}`);
```

---

## Architectural Rules Respected

1. ✅ **No direct PathFinder calls** - All pathfinding goes through SpatialEngine
2. ✅ **Single Responsibility** - Only spatial knowledge, no strategic decisions
3. ✅ **Stateless except for cache** - Cache is managed and expired regularly
4. ✅ **Observable via metrics** - Cache stats exposed for debugging
5. ✅ **Testable in isolation** - Full test suite without Game API
6. ✅ **Kernel integration** - Lazy-initialized, runs in proper order

---

## Known Limitations

1. **Pathfinding does not account for dynamic creeps** - Distance matrix computed on static terrain only. Consider for future: creep avoidance layer.

2. **Topology analysis is heuristic** - Chokepoint detection uses neighbor count (≤4 walkable neighbors). Could be refined with flow analysis.

3. **No inter-room pathfinding** - Paths only computed within single rooms. Multi-room pathfinding deferred to Phase 2+ integration with WorldModel.

4. **Distance matrix is BFS** - Assumes movement cost is uniform (1 per step). Swamp penalties not considered.

---

## Next Steps

**Phase 2:** Blackboard + WorkingMemory
- Ephemeral tick-based events and alerts
- Persistent goal/reservation/task storage with versioning

**Phase 3:** Decision Engine
- Score Goals by utility (economy, military, expansion)
- Pluggable scorer functions
- Uses Spatial Engine for distance-based utility (e.g., "expand to nearby rooms")

**Phase 4:** Task Factory + Task Engine
- Convert Goals → Tasks
- Manage task lifecycle, dependencies, reservations

**Phase 5:** Scheduler + Agent Runtime + Command Engine
- Allocate tasks to creeps
- Execute locally with spatial engine pathfinding
- Normalize commands to Game API

---

## Files Changed

| File | Type | Lines | Purpose |
|------|------|-------|---------|
| `src/spatial/SpatialEngine.js` | NEW | 412 | Spatial engine module |
| `tests/spatial.test.js` | NEW | 226 | 14 unit tests |
| `src/main.js` | MOD | +2 | Import SpatialEngine |
| `dist/main.js` | AUTO | ~500 | Generated bundle |

---

## Commit

```
cf328c8 feat: Phase 1 - Spatial Engine implementation

Add SpatialEngine module with:
- PathFinder wrapper with cache
- Distance matrix via flood-fill BFS
- Topology analysis: chokepoints, open areas, structure clusters
- Metrics tracking

14 tests, all passing. 32 total tests passing (Kernel + WorldModel + Spatial).
```

---

**Ready for Phase 2:** Blackboard + WorkingMemory ✅
