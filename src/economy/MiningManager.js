export default class MiningManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.wm = kernel && kernel.has && kernel.has('workingMemory') ? kernel.get('workingMemory') : null;
    this.spatialEngine = kernel && kernel.has && kernel.has('spatialEngine') ? kernel.get('spatialEngine') : null;
    // mining config
    this.containerThreshold = 200000; // energy threshold per container to spawn miners
    this.remoteRooms = []; // array of remote room names to mine
  }

  _nowTick() {
    return (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();
  }

  setRemoteRooms(rooms) {
    this.remoteRooms = rooms || [];
  }

  // Scan sources in a room and create mining jobs
  // Expects WorkingMemory to have collections: 'sources' (with { id, data: { energy, room, pos } })
  tick() {
    if (!this.wm) return [];
    const jobs = [];

    const allSources = this.wm.list('sources') || [];
    const containers = this.wm.list('containers') || [];

    for (const source of allSources) {
      const sourceRoom = (source.data && source.data.room) || null;
      if (!sourceRoom) continue;

      // Check if this room is assigned and has containers
      const roomContainers = containers.filter(c => c.data && c.data.room === sourceRoom);
      const totalEnergy = roomContainers.reduce((sum, c) => sum + ((c.data && c.data.energy) || 0), 0);

      // Create mining job if energy is below threshold or no miners assigned
      const existingJobs = (this.wm.list('mining') || []).filter(j => j.data && j.data.sourceId === source.id && j.data.status === 'pending');
      if (totalEnergy < this.containerThreshold && existingJobs.length === 0) {
        const job = {
          id: `mine-${source.id}-${Math.random().toString(36).slice(2,6)}`,
          data: {
            type: 'mining',
            sourceId: source.id,
            sourceRoom: sourceRoom,
            containerIds: roomContainers.map(c => c.id),
            status: 'pending',
            createdAt: this._nowTick()
          }
        };
        try { this.wm.set('mining', job); } catch (e) { /* ignore */ }
        jobs.push(job);
      }
    }

    return jobs;
  }

  // Add a remote room to the mining list
  addRemoteRoom(roomName) {
    if (!this.remoteRooms.includes(roomName)) {
      this.remoteRooms.push(roomName);
    }
  }

  // Assign a miner creep to a job
  assignMiner(jobId, creepId) {
    if (!this.wm) return null;
    const job = this.wm.get('mining', jobId);
    if (!job) return null;
    job.data.assignee = creepId;
    job.data.status = 'assigned';
    job.data.assignedAt = this._nowTick();
    this.wm.set('mining', job);
    return job;
  }

  // List pending mining jobs
  listPending() {
    if (!this.wm) return [];
    return (this.wm.list('mining') || []).filter(j => j.data && j.data.status === 'pending');
  }
}
