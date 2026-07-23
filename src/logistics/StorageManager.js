export default class StorageManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.wm = kernel && kernel.has && kernel.has('workingMemory') ? kernel.get('workingMemory') : null;
    
    // Storage registry: roomName -> { storageId, terminalId, links: [] }
    this.storageNetwork = {};
    
    // Stock tracking: roomName -> { resource: amount }
    this.stock = {};
    
    // Reservations: reservationId -> { resource, amount, target, status, createdAt }
    this.reservations = {};
    
    // Storage capacity: storageId -> maxCapacity (default: 300,000 for storage; 30,000 for terminal)
    this.capacities = {};
    
    // Refill thresholds: resource -> minLevel (trigger auto-refill)
    this.refillTargets = { energy: 100000 };
    
    // Withdrawal policies: resource -> { source, target, priority }
    this.policies = {};
  }

  _nowTick() {
    return (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();
  }

  // Register a storage network (room configuration)
  registerNetwork(roomName, storageId, terminalId = null, links = []) {
    this.storageNetwork[roomName] = { storageId, terminalId, links };
    this.capacities[storageId] = 300000;
    if (terminalId) this.capacities[terminalId] = 30000;
    if (!this.stock[roomName]) this.stock[roomName] = {};
  }

  // Update stock levels for a room
  updateStock(roomName, resource, amount) {
    if (!this.stock[roomName]) this.stock[roomName] = {};
    this.stock[roomName][resource] = (this.stock[roomName][resource] || 0) + amount;
  }

  // Get stock for a resource
  getStock(roomName, resource) {
    return (this.stock[roomName] && this.stock[roomName][resource]) || 0;
  }

  // Create a reservation (reserve space/resources)
  reserve(resource, amount, targetRoom, purpose = 'transfer') {
    const reservationId = `rsv-${Math.random().toString(36).slice(2,9)}`;
    const reservation = {
      id: reservationId,
      resource,
      amount,
      target: targetRoom,
      purpose,
      status: 'reserved',
      createdAt: this._nowTick()
    };
    this.reservations[reservationId] = reservation;
    // persist
    if (this.wm && typeof this.wm.set === 'function') {
      try {
        this.wm.set('storage_reservations', { id: reservationId, data: reservation });
      } catch (e) { /* ignore */ }
    }
    return reservationId;
  }

  // Fulfill a reservation
  fulfillReservation(reservationId) {
    const rsv = this.reservations[reservationId];
    if (!rsv) return false;
    rsv.status = 'fulfilled';
    rsv.fulfilledAt = this._nowTick();
    // persist
    if (this.wm && typeof this.wm.set === 'function') {
      try {
        this.wm.set('storage_reservations', { id: reservationId, data: rsv });
      } catch (e) { /* ignore */ }
    }
    return true;
  }

  // Cancel a reservation
  cancelReservation(reservationId) {
    const rsv = this.reservations[reservationId];
    if (!rsv) return false;
    rsv.status = 'cancelled';
    rsv.cancelledAt = this._nowTick();
    // persist
    if (this.wm && typeof this.wm.set === 'function') {
      try {
        this.wm.set('storage_reservations', { id: reservationId, data: rsv });
      } catch (e) { /* ignore */ }
    }
    return true;
  }

  // Get available storage capacity (accounting for reservations)
  getAvailableCapacity(roomName, resource) {
    const network = this.storageNetwork[roomName];
    if (!network) return 0;

    const storageId = network.storageId;
    const maxCap = this.capacities[storageId] || 300000;
    const currentStock = this.getStock(roomName, resource);

    // Account for active reservations
    const reserved = Object.values(this.reservations)
      .filter(r => r.status === 'reserved' && r.target === roomName && r.resource === resource)
      .reduce((sum, r) => sum + r.amount, 0);

    return Math.max(0, maxCap - currentStock - reserved);
  }

  // Find best storage for resource (load balancing)
  findBestStorageForResource(resource, sourceRoom, targetRooms = []) {
    if (!targetRooms.length) targetRooms = Object.keys(this.storageNetwork);

    let bestRoom = null;
    let bestAvailable = -1;

    for (const room of targetRooms) {
      const available = this.getAvailableCapacity(room, resource);
      if (available > bestAvailable) {
        bestAvailable = available;
        bestRoom = room;
      }
    }

    return bestRoom;
  }

  // Set refill target for a resource
  setRefillTarget(resource, minLevel) {
    this.refillTargets[resource] = minLevel;
  }

  // Check if refill needed
  needsRefill(roomName, resource) {
    const current = this.getStock(roomName, resource);
    const target = this.refillTargets[resource] || 50000;
    return current < target;
  }

  // Create refill jobs for understocked resources
  tick() {
    const jobs = [];

    for (const [roomName, network] of Object.entries(this.storageNetwork)) {
      for (const [resource, minLevel] of Object.entries(this.refillTargets)) {
        const current = this.getStock(roomName, resource);
        if (current < minLevel) {
          const needed = minLevel - current;
          // Find source room with excess
          for (const [sourceRoom, sourceStock] of Object.entries(this.stock)) {
            if (sourceRoom === roomName) continue;
            const sourceAmount = sourceStock[resource] || 0;
            if (sourceAmount > this.refillTargets[resource]) {
              const amount = Math.min(needed, sourceAmount - this.refillTargets[resource]);
              const lm = this.kernel && this.kernel.has && this.kernel.has('linkManager') ? this.kernel.get('linkManager') : null;
              let priority = 'medium';
              try {
                const eff = lm && typeof lm.getRouteEfficiency === 'function' ? lm.getRouteEfficiency(sourceRoom, roomName) : null;
                if (eff !== null && eff !== undefined) {
                  priority = eff < 0.6 ? 'high' : 'medium';
                } else {
                  priority = 'high'; // cross-room without efficiency info -> conservative high
                }
              } catch (e) { priority = 'high'; }

              const job = {
                id: `refill-${roomName}-${resource}-${Math.random().toString(36).slice(2,6)}`,
                data: {
                  type: 'refill',
                  resource,
                  amount,
                  from: sourceRoom,
                  to: roomName,
                  priority,
                  status: 'pending',
                  createdAt: this._nowTick()
                }
              };

              // persist job
              if (this.wm && typeof this.wm.set === 'function') {
                try { this.wm.set('storage_refills', job); } catch (e) { /* ignore */ }
              }

              // create corresponding goal with numeric priority
              try {
                const numeric = priority === 'high' ? 100 : (priority === 'medium' ? 50 : 10);
                const goal = { id: `goal-${job.id}`, data: { type: 'transport', priority: numeric, createdFrom: job.id, meta: { jobId: job.id, resource, amount, from: sourceRoom, to: roomName } } };
                if (this.wm && typeof this.wm.set === 'function') this.wm.set('goals', goal);
              } catch (e) { /* ignore */ }
              if (this.wm && typeof this.wm.set === 'function') {
                try { this.wm.set('storage_refills', job); } catch (e) { /* ignore */ }
              }
              jobs.push(job);
              break;
            }
          }
        }
      }
    }

    return jobs;
  }

  // List reservations by status
  listReservations(status = null, targetRoom = null) {
    return Object.values(this.reservations).filter(r => {
      if (status && r.status !== status) return false;
      if (targetRoom && r.target !== targetRoom) return false;
      return true;
    });
  }

  // Get storage network info
  getNetwork(roomName) {
    return this.storageNetwork[roomName] || null;
  }

  // List all networks
  listNetworks() {
    return Object.entries(this.storageNetwork).map(([room, net]) => ({ room, ...net }));
  }
}
