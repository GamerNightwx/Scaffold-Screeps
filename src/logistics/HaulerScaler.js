/**
 * HaulerScaler: Scale hauler body size based on route efficiency and distance
 * 
 * Uses LinkManager route efficiency + distance heuristics to determine optimal
 * carry capacity. Scales UP for long/inefficient routes (need bigger body to compensate),
 * scales DOWN for short/efficient routes (minimize cost).
 */

class HaulerScaler {
  constructor(kernel) {
    this.kernel = kernel;
    this.linkManager = kernel && kernel.has && kernel.has('linkManager') ? kernel.get('linkManager') : null;
    this.wm = kernel && kernel.has && kernel.has('workingMemory') ? kernel.get('workingMemory') : null;
    this.defaultCarry = 10; // default body's carry part count
  }

  /**
   * Calculate optimal carry capacity for a route (source room -> target room)
   * 
   * Returns: { carryParts: number, reason: string, efficiency: number, distance: number }
   * - carryParts: desired CARRY part count for the body (min 1, max 20)
   * - reason: human-readable explanation
   * - efficiency: route efficiency (0.0-1.0) from LinkManager
   * - distance: estimated room distance
   */
  calculateCarryCapacity(sourceRoom, targetRoom) {
    const efficiency = this.linkManager.getRouteEfficiency(sourceRoom, targetRoom);
    const distance = this._estimateDistance(sourceRoom, targetRoom);

    // Base: 10 parts for distance 1-2 (efficient routes)
    // Scale: +2 parts per distance increment OR -1 efficiency
    let carryParts = this.defaultCarry;

    // Distance adjustment (rough heuristic: 1 part per room distance)
    if (distance > 1) {
      carryParts += Math.min(distance - 1, 10); // max +10 for very far
    }

    // Efficiency adjustment (lower efficiency = need bigger body to compensate lost energy)
    // Efficiency 0.5 = carry +6 (very inefficient, need bigger hauler)
    // Efficiency 0.8 = carry -2 (efficient, can use smaller hauler)
    // Efficiency 0.95 = carry -4 (very efficient, minimal body)
    const efficiencyAdjust = Math.round((1.0 - efficiency) * 12 - 4);
    carryParts += efficiencyAdjust;

    // Clamp to valid range
    carryParts = Math.max(1, Math.min(carryParts, 20));

    let reason = `Distance ${distance}: base ${this.defaultCarry}`;
    if (efficiencyAdjust !== 0) {
      reason += `, efficiency ${(efficiency * 100).toFixed(0)}%: ${efficiencyAdjust > 0 ? '+' : ''}${efficiencyAdjust}`;
    }

    return {
      carryParts,
      reason,
      efficiency,
      distance
    };
  }

  /**
   * Estimate distance between two rooms (simplified: assume orthogonal grid)
   * Real Screeps would use PathFinder; this is conservative heuristic.
   * Returns: 1 for same room, 2 for adjacent, 3+ for far
   */
  _estimateDistance(room1, room2) {
    if (room1 === room2) return 1;
    
    // Parse room names (e.g., "W5N3" -> x=-5, y=3)
    const pos1 = this._parseRoomName(room1);
    const pos2 = this._parseRoomName(room2);
    
    if (!pos1 || !pos2) return 2; // default if parse fails
    
    // Chebyshev distance (max of x/y deltas) = room distance
    const dx = Math.abs(pos1.x - pos2.x);
    const dy = Math.abs(pos1.y - pos2.y);
    const roomDist = Math.max(dx, dy);
    
    return roomDist <= 0 ? 1 : roomDist;
  }

  /**
   * Parse Screeps room name format: "W5N3" -> { x: -5, y: 3 }
   */
  _parseRoomName(roomName) {
    const match = roomName.match(/^([WE])(\d+)([NS])(\d+)$/);
    if (!match) return null;
    
    const [, ewChar, ewNum, nsChar, nsNum] = match;
    const x = ewChar === 'W' ? -Number(ewNum) : Number(ewNum);
    const y = nsChar === 'N' ? -Number(nsNum) : Number(nsNum);
    
    return { x, y };
  }

  /**
   * Get or calculate scaled hauler for a job
   * Persists decision to WorkingMemory for consistency across ticks if available
   */
  getScaledHauler(jobId, sourceRoom, targetRoom) {
    if (!this.wm) {
      return this.calculateCarryCapacity(sourceRoom, targetRoom);
    }

    const existing = this.wm.get('hauler_scaling', jobId);
    if (existing && existing.data) {
      return existing.data;
    }

    const scaling = this.calculateCarryCapacity(sourceRoom, targetRoom);
    try {
      this.wm.set('hauler_scaling', { id: jobId, data: scaling });
    } catch (e) {
      // ignore if wm doesn't support set
    }
    
    return scaling;
  }

  /**
   * Clear scaled hauler decision (call when route changes)
   */
  clearScaling(jobId) {
    if (!this.wm) return;
    try {
      // WorkingMemory doesn't have delete, so we'd need to update
      // For now, just skip if no wm
    } catch (e) { /* ignore */ }
  }

  /**
   * Get stats on scaling decisions (for observability)
   */
  getStats() {
    if (!this.wm) {
      return {
        totalJobs: 0,
        avgCarryParts: 0,
        minCarryParts: 0,
        maxCarryParts: 0,
        avgEfficiency: '0%'
      };
    }

    const scalingList = this.wm.list('hauler_scaling') || [];
    const scaling = scalingList.map(s => s.data || {}).filter(s => s.carryParts);
    
    if (scaling.length === 0) {
      return {
        totalJobs: 0,
        avgCarryParts: 0,
        minCarryParts: 0,
        maxCarryParts: 0,
        avgEfficiency: '0%'
      };
    }

    const carryParts = scaling.map(s => s.carryParts);
    const efficiencies = scaling.map(s => s.efficiency || 0.5);

    return {
      totalJobs: scaling.length,
      avgCarryParts: (carryParts.reduce((a, b) => a + b, 0) / carryParts.length).toFixed(1),
      minCarryParts: Math.min(...carryParts),
      maxCarryParts: Math.max(...carryParts),
      avgEfficiency: (efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length * 100).toFixed(0) + '%'
    };
  }
}

export default HaulerScaler;
