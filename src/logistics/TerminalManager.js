export default class TerminalManager {
  constructor(kernel) {
    this.kernel = kernel;
    this.wm = kernel && kernel.has && kernel.has('workingMemory') ? kernel.get('workingMemory') : null;
    this.minAmountForTerminal = (kernel && kernel.config && kernel.config.terminalMinAmount) || 1000;
  }

  _now() {
    return (typeof Game !== 'undefined' && Game.time) ? Game.time : Date.now();
  }

  _findTerminalInRoom(room) {
    if (!this.wm || !this.wm.list) return null;
    const terms = this.wm.list('terminals') || [];
    return terms.find(t => t && t.data && t.data.room === room) || null;
  }

  _findStorageInRoom(room) {
    if (!this.wm || !this.wm.list) return null;
    const stores = this.wm.list('storages') || [];
    return stores.find(s => s && s.data && s.data.room === room) || null;
  }

  // Create a terminal pipeline for cross-room logistics jobs: local haul -> terminal hop -> remote haul
  tick() {
    if (!this.wm || !this.wm.list || !this.wm.set || !this.wm.get) return [];

    const created = [];
    const jobs = this.wm.list('logistics') || [];
    for (const j of jobs) {
      try {
        if (!j || !j.data) continue;
        if (j.data._terminalPipelineHandled) continue; // already processed
        if (j.data.type !== 'transfer' && j.data.type !== 'refill') continue;

        const fromRoom = j.data.fromRoom || (j.data.from && (j.data.fromRoom || null));
        const toRoom = j.data.toRoom || (j.data.to && (j.data.toRoom || null));

        // if explicit rooms not present, try to infer from storage/terminal entries (fallback: skip)
        const sourceRoom = j.data.fromRoom || (j.data.from && j.data.fromRoom) || null;
        const destRoom = j.data.toRoom || (j.data.to && j.data.toRoom) || null;

        if (!sourceRoom || !destRoom) {
          // try to resolve from storages/terminals
          const src = this.wm.get('storages', j.data.from) || (this.wm.list('storages') || []).find(s => s.id === j.data.from);
          const dst = this.wm.get('storages', j.data.to) || (this.wm.list('storages') || []).find(s => s.id === j.data.to);
          const sroom = src && src.data && src.data.room;
          const droom = dst && dst.data && dst.data.room;
          if (sroom) sourceRoom = sroom;
          if (droom) destRoom = droom;
        }

        if (!sourceRoom || !destRoom) continue;
        if (sourceRoom === destRoom) continue; // local
        const amount = j.data.amount || j.data.amountRemaining || j.data.amountTotal || 0;
        if (amount < this.minAmountForTerminal) continue; // too small

        // Find terminals in rooms
        const srcTerm = this._findTerminalInRoom(sourceRoom);
        const dstTerm = this._findTerminalInRoom(destRoom);

        // If a LinkManager is available, consult it to choose link vs terminal routing
        let linkManager = null;
        try { if (this.kernel && this.kernel.has && this.kernel.has('linkManager')) linkManager = this.kernel.get('linkManager'); } catch (e) { linkManager = null; }
        if (linkManager) {
          try {
            const routeChoice = linkManager.chooseRoute(sourceRoom, destRoom, null, null);
            if (routeChoice && routeChoice.useLink) {
              // Build link-based pipeline: storage -> sourceLink -> link_transfer -> targetLink -> dest storage
              const sourceLinks = (this.wm.list('links') || []).filter(l => l && l.data && l.data.room === sourceRoom).map(l => l.id).concat((linkManager.links && linkManager.links[sourceRoom]) ? linkManager.links[sourceRoom].map(l => l.id) : []);
              const targetLinks = (this.wm.list('links') || []).filter(l => l && l.data && l.data.room === destRoom).map(l => l.id).concat((linkManager.links && linkManager.links[destRoom]) ? linkManager.links[destRoom].map(l => l.id) : []);

              const srcLinkId = (sourceLinks && sourceLinks.length > 0) ? sourceLinks[0] : null;
              const dstLinkId = (targetLinks && targetLinks.length > 0) ? targetLinks[0] : null;

              if (srcLinkId && dstLinkId) {
                // create local haul to sourceLink
                const localToLinkId = `${j.id}-to-link`;
                const localToLink = {
                  id: localToLinkId,
                  data: {
                    type: 'transfer',
                    from: j.data.from,
                    to: srcLinkId,
                    fromRoom: sourceRoom,
                    toRoom: sourceRoom,
                    amount: Math.min(amount, 800),
                    status: 'pending',
                    createdAt: this._now(),
                    meta: { parentJob: j.id, role: 'to_link' }
                  }
                };
                this.wm.set('logistics', localToLink);
                created.push(localToLink);

                try {
                  const taskLocal = {
                    id: `task-${localToLinkId}`,
                    data: { type: 'transfer', status: 'pending', meta: { amount: localToLink.data.amount, from: localToLink.data.from, to: localToLink.data.to } }
                  };
                  this.wm.set('tasks', taskLocal);
                } catch (e) { /* ignore */ }

                // create link transfer job
                const linkHopId = `${j.id}-link-hop`;
                const linkHop = {
                  id: linkHopId,
                  data: {
                    type: 'link_transfer',
                    from: srcLinkId,
                    to: dstLinkId,
                    fromRoom: sourceRoom,
                    toRoom: destRoom,
                    amount,
                    status: 'pending',
                    createdAt: this._now(),
                    meta: { parentJob: j.id, role: 'link_hop' }
                  }
                };
                this.wm.set('logistics', linkHop);
                created.push(linkHop);

                try {
                  const taskHop = {
                    id: `task-${linkHopId}`,
                    data: {
                      type: 'link_transfer',
                      status: 'pending',
                      meta: { amount: linkHop.data.amount, from: linkHop.data.from, to: linkHop.data.to, dependsOn: [`task-${localToLinkId}`] }
                    }
                  };
                  this.wm.set('tasks', taskHop);
                } catch (e) { /* ignore */ }

                // create remote haul job: targetLink -> storage
                const linkToDestId = `${j.id}-from-link`;
                const linkToDest = {
                  id: linkToDestId,
                  data: {
                    type: 'transfer',
                    from: dstLinkId,
                    to: j.data.to,
                    fromRoom: destRoom,
                    toRoom: destRoom,
                    amount: Math.min(amount, 800),
                    status: 'pending',
                    createdAt: this._now(),
                    meta: { parentJob: j.id, role: 'from_link' }
                  }
                };
                this.wm.set('logistics', linkToDest);
                created.push(linkToDest);

                try {
                  const taskRemote = {
                    id: `task-${linkToDestId}`,
                    data: {
                      type: 'transfer',
                      status: 'pending',
                      meta: { amount: linkToDest.data.amount, from: linkToDest.data.from, to: linkToDest.data.to, dependsOn: [`task-${linkHopId}`] }
                    }
                  };
                  this.wm.set('tasks', taskRemote);
                } catch (e) { /* ignore */ }

                j.data._terminalPipelineHandled = true;
                this.wm.set('logistics', j);
                continue; // move to next job
              }
            }
          } catch (e) { /* ignore link manager failures */ }
        }

        // If direct terminals exist both sides, do as before
        if (srcTerm && dstTerm) {
          // Create local haul job: storage -> sourceTerminal
          const localToTerminalId = `${j.id}-to-terminal`;
          const localToTerminal = {
            id: localToTerminalId,
            data: {
              type: 'transfer',
              from: j.data.from,
              to: srcTerm.id,
              fromRoom: sourceRoom,
              toRoom: sourceRoom,
              amount: Math.min(amount, srcTerm.data && srcTerm.data.capacity ? Math.min(amount, srcTerm.data.capacity) : amount),
              status: 'pending',
              createdAt: this._now(),
              meta: { parentJob: j.id, role: 'to_terminal' }
            }
          };
          this.wm.set('logistics', localToTerminal);
          created.push(localToTerminal);

            // create corresponding task for local haul
            try {
              const taskLocal = {
                id: `task-${localToTerminalId}`,
                data: {
                  type: 'transfer',
                  status: 'pending',
                  meta: { amount: localToTerminal.data.amount, from: localToTerminal.data.from, to: localToTerminal.data.to }
                }
              };
              this.wm.set('tasks', taskLocal);
            } catch (e) { /* ignore */ }

            // Create terminal hop job: srcTerminal -> dstTerminal
            const terminalHopId = `${j.id}-terminal-hop`;
            const terminalHop = {
              id: terminalHopId,
              data: {
                type: 'terminal_transfer',
                from: srcTerm.id,
                to: dstTerm.id,
                fromRoom: sourceRoom,
                toRoom: destRoom,
                amount,
                status: 'pending',
                createdAt: this._now(),
                meta: { parentJob: j.id, role: 'terminal_hop' }
              }
            };
            this.wm.set('logistics', terminalHop);
            created.push(terminalHop);

            // create terminal hop task which depends on localToTerminal task
            try {
              const taskHop = {
                id: `task-${terminalHopId}`,
                data: {
                  type: 'terminal_transfer',
                  status: 'pending',
                  meta: { amount: terminalHop.data.amount, from: terminalHop.data.from, to: terminalHop.data.to, dependsOn: [`task-${localToTerminalId}`] }
                }
              };
              this.wm.set('tasks', taskHop);
            } catch (e) { /* ignore */ }

            // Create remote haul job: destTerminal -> storage
            const terminalToDestId = `${j.id}-from-terminal`;
            const terminalToDest = {
              id: terminalToDestId,
              data: {
                type: 'transfer',
                from: dstTerm.id,
                to: j.data.to,
                fromRoom: destRoom,
                toRoom: destRoom,
                amount: Math.min(amount, dstTerm.data && dstTerm.data.capacity ? Math.min(amount, dstTerm.data.capacity) : amount),
                status: 'pending',
                createdAt: this._now(),
                meta: { parentJob: j.id, role: 'from_terminal' }
              }
            };
            this.wm.set('logistics', terminalToDest);
            created.push(terminalToDest);

            // create remote task depending on terminal hop
            try {
              const taskRemote = {
                id: `task-${terminalToDestId}`,
                data: {
                  type: 'transfer',
                  status: 'pending',
                  meta: { amount: terminalToDest.data.amount, from: terminalToDest.data.from, to: terminalToDest.data.to, dependsOn: [`task-${terminalHopId}`] }
                }
              };
              this.wm.set('tasks', taskRemote);
            } catch (e) { /* ignore */ }

            // Mark original job as routed
            j.data._terminalPipelineHandled = true;
            this.wm.set('logistics', j);

        } else if (srcTerm && !dstTerm) {
          // Destination has no terminal: build a relay chain (up to 3 relays) and create chained terminal hops
          const terms = this.wm.list('terminals') || [];
          const relays = terms.filter(t => t && t.id !== srcTerm.id);
          if (!relays || relays.length === 0) continue; // no relay available

          // A* search across terminal nodes (excluding src) to find a low-cost relay path up to maxHops
          const maxHops = 3;
          const destRoomName = destRoom;

          // helper: parse Screeps room name like 'W8N3' into coords
          const parseRoom = (rn) => {
            if (!rn || typeof rn !== 'string') return null;
            const m = rn.match(/^([WE])(\d+)([NS])(\d+)$/);
            if (!m) return null;
            const x = parseInt(m[2], 10) * (m[1] === 'W' ? -1 : 1);
            const y = parseInt(m[4], 10) * (m[3] === 'N' ? -1 : 1);
            return { x, y };
          };

          const roomDist = (a,b) => {
            if (!a || !b) return 99999;
            if (a === b) return 0;
            const ca = parseRoom(a);
            const cb = parseRoom(b);
            if (!ca || !cb) return 99999;
            return Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y);
          };

          const relayCandidates = relays.slice();
          const terminalsById = {};
          for (const r of relayCandidates) terminalsById[r.id] = r;
          terminalsById[srcTerm.id] = srcTerm;

          // compute adaptive weights from observed terminal state
          const computeAdaptiveWeights = () => {
            const cfg = this.kernel && this.kernel.config ? this.kernel.config : {};
            const baseCooldown = typeof cfg.terminalCooldownWeight === 'number' ? cfg.terminalCooldownWeight : 50;
            const baseCapacity = typeof cfg.terminalCapacityWeight === 'number' ? cfg.terminalCapacityWeight : 0.01;
            const baseCongestion = typeof cfg.terminalCongestionWeight === 'number' ? cfg.terminalCongestionWeight : 500;
            const baseEnergy = typeof cfg.terminalEnergyWeight === 'number' ? cfg.terminalEnergyWeight : 0.005;

            const terms = this.wm.list('terminals') || [];
            if (!terms || terms.length === 0) return { cooldownWeight: baseCooldown, capacityWeight: baseCapacity, congestionWeight: baseCongestion, energyWeight: baseEnergy };

            let totalCooldown = 0; let totalQueued = 0; let totalCapacity = 0; let count = 0;
            const jobs = this.wm.list('logistics') || [];

            const queueByTerm = {};
            for (const j of jobs) {
              if (!j || !j.data) continue;
              if (j.data.type === 'terminal_transfer' && j.data.status === 'pending') {
                const src = j.data.from; if (!src) continue;
                queueByTerm[src] = (queueByTerm[src] || 0) + 1;
              }
            }

            for (const t of terms) {
              if (!t || !t.data) continue;
              count++;
              totalCooldown += (typeof t.data.cooldown === 'number' ? t.data.cooldown : 0);
              totalQueued += (queueByTerm[t.id] || 0);
              totalCapacity += (typeof t.data.capacity === 'number' ? t.data.capacity : 0);
            }

            const avgCooldown = totalCooldown / Math.max(1, count);
            const avgQueued = totalQueued / Math.max(1, count);
            const avgCapacity = totalCapacity / Math.max(1, count);

            // adaptive multipliers: increase weight if average cooldown / queues increase
            const cooldownWeight = baseCooldown * (1 + (avgCooldown / (1 + avgCooldown)));
            const congestionWeight = baseCongestion * (1 + (avgQueued / (1 + avgQueued)));
            // capacity weight should inversely scale: more capacity => less penalty per low-cap dest
            const capacityWeight = baseCapacity * (1 + (Math.max(0, (1000 - avgCapacity)) / 1000));
            const energyWeight = baseEnergy * (1 + (avgQueued / (1 + avgQueued)));

            return { cooldownWeight, capacityWeight, congestionWeight, energyWeight };
          };

          // cost to travel from one terminal to another (distance + penalties for cooldown/capacity/congestion/energy)
          const weights = computeAdaptiveWeights();
          const travelCost = (fromId, toId) => {
            const a = this.wm.get('terminals', fromId) || terminalsById[fromId];
            const b = this.wm.get('terminals', toId) || terminalsById[toId];
            const fromRoom = a && a.data && a.data.room;
            const toRoom = b && b.data && b.data.room;
            let cost = roomDist(fromRoom, toRoom);
            const cooldown = b && b.data && typeof b.data.cooldown === 'number' ? b.data.cooldown : 0;
            if (cooldown > 0) cost += cooldown * weights.cooldownWeight;
            const capacity = b && b.data && b.data.capacity ? b.data.capacity : 0;
            // prefer higher capacity (lower cost)
            cost += Math.max(0, 1000 - Math.floor(capacity)) * weights.capacityWeight;

            // congestion: count pending terminal_transfer jobs from 'to' (jobs targeting this terminal as source)
            let queued = 0;
            try {
              const jobs = this.wm.list('logistics') || [];
              for (const j of jobs) {
                if (!j || !j.data) continue;
                if (j.data.type === 'terminal_transfer' && j.data.from === toId && j.data.status === 'pending') queued++;
              }
            } catch (e) { queued = 0; }
            if (queued > 0) cost += queued * weights.congestionWeight;

            // energy: penalize low-energy terminals as they may prevent full sends
            const energy = b && b.data && typeof b.data.energy === 'number' ? b.data.energy : (b && b.data && b.data.capacity ? b.data.capacity : 0);
            if (energy < 500) cost += (500 - energy) * weights.energyWeight;

            return cost;
          };

          const heuristic = (id) => {
            const t = this.wm.get('terminals', id) || terminalsById[id];
            const room = t && t.data && t.data.room;
            return roomDist(room, destRoomName);
          };

          // A* over terminals. Nodes are terminal ids. Limit path length to maxHops.
          const start = srcTerm.id;
          const open = [{ id: start, f: heuristic(start) }];
          const gScore = {};
          const cameFrom = {};
          const depth = {};
          gScore[start] = 0;
          cameFrom[start] = null;
          depth[start] = 0;

          let bestNode = start;
          let bestF = heuristic(start);

          while (open.length > 0) {
            // pop lowest f
            open.sort((a,b) => a.f - b.f);
            const cur = open.shift();
            const curId = cur.id;
            const curG = gScore[curId] || 0;
            const curDepth = depth[curId] || 0;

            const curF = curG + heuristic(curId);
            if (curF < bestF) { bestF = curF; bestNode = curId; }

            // Do not expand beyond maxHops
            if (curDepth >= maxHops) continue;

            // neighbors: all terminals except itself
            const neighbors = Object.keys(terminalsById).filter(k => k !== curId);
            for (const nb of neighbors) {
              // avoid cycles: skip if nb already in path of cur (reconstruct quick check)
              let walker = curId;
              let seen = false;
              let steps = 0;
              while (walker) {
                if (walker === nb) { seen = true; break; }
                walker = cameFrom[walker];
                if (++steps > maxHops) break;
              }
              if (seen) continue;

              const tentativeG = curG + travelCost(curId, nb);
              const knownG = typeof gScore[nb] === 'number' ? gScore[nb] : Number.POSITIVE_INFINITY;
              const nbDepth = (curDepth || 0) + 1;
              if (nbDepth > maxHops) continue;

              if (tentativeG < knownG) {
                cameFrom[nb] = curId;
                gScore[nb] = tentativeG;
                depth[nb] = nbDepth;
                const f = tentativeG + heuristic(nb);
                open.push({ id: nb, f });
                if (f < bestF) { bestF = f; bestNode = nb; }
              }
            }
          }

          // reconstruct path from start to bestNode
          const reconstruct = (node) => {
            const out = [];
            let cur = node;
            while (cur) {
              out.unshift(cur);
              cur = cameFrom[cur];
            }
            return out;
          };

          let path = null;
          if (bestNode) {
            const seq = reconstruct(bestNode);
            // ensure path starts with start
            if (seq[0] !== start) seq.unshift(start);
            path = seq;
          }

          // fallback: if no path found, pick single best relay by capacity
          if (!path || path.length <= 1) {
            if (relayCandidates.length > 0) {
              relayCandidates.sort((a,b) => ((b.data && b.data.capacity) || 0) - ((a.data && a.data.capacity) || 0));
              path = [srcTerm.id, relayCandidates[0].id];
            } else {
              continue; // no relays available
            }
          }

          // create local haul to srcTerm
          const localToTerminalId = `${j.id}-to-terminal`;
          const localToTerminal = {
            id: localToTerminalId,
            data: {
              type: 'transfer',
              from: j.data.from,
              to: srcTerm.id,
              fromRoom: sourceRoom,
              toRoom: sourceRoom,
              amount: Math.min(amount, srcTerm.data && srcTerm.data.capacity ? Math.min(amount, srcTerm.data.capacity) : amount),
              status: 'pending',
              createdAt: this._now(),
              meta: { parentJob: j.id, role: 'to_terminal' }
            }
          };
          this.wm.set('logistics', localToTerminal);
          created.push(localToTerminal);

          try {
            const taskLocal = {
              id: `task-${localToTerminalId}`,
              data: { type: 'transfer', status: 'pending', meta: { amount: localToTerminal.data.amount, from: localToTerminal.data.from, to: localToTerminal.data.to } }
            };
            this.wm.set('tasks', taskLocal);
          } catch (e) { /* ignore */ }

          // create chained terminal hops
          let prevTaskId = `task-${localToTerminalId}`;
          for (let i = 0; i < path.length - 1; i++) {
            const fromId = path[i];
            const toId = path[i+1];
            const hopId = `${j.id}-terminal-hop-${i}`;
            const hop = { id: hopId, data: { type: 'terminal_transfer', from: fromId, to: toId, fromRoom: null, toRoom: null, amount, status: 'pending', createdAt: this._now(), meta: { parentJob: j.id, role: 'terminal_hop', hopIndex: i } } };
            this.wm.set('logistics', hop);
            created.push(hop);

            try {
              const taskHop = { id: `task-${hopId}`, data: { type: 'terminal_transfer', status: 'pending', meta: { amount: hop.data.amount, from: hop.data.from, to: hop.data.to, dependsOn: [prevTaskId] } } };
              this.wm.set('tasks', taskHop);
            } catch (e) { /* ignore */ }

            prevTaskId = `task-${hopId}`;
          }

          // final transfer from last relay to destination storage
          const finalRelayId = path[path.length - 1];
          const terminalToDestId = `${j.id}-from-terminal`;
          const terminalToDest = {
            id: terminalToDestId,
            data: {
              type: 'transfer',
              from: finalRelayId,
              to: j.data.to,
              fromRoom: null,
              toRoom: destRoom,
              amount: Math.min(amount, (this.wm.get('terminals', finalRelayId) && this.wm.get('terminals', finalRelayId).data && this.wm.get('terminals', finalRelayId).data.capacity) || amount),
              status: 'pending',
              createdAt: this._now(),
              meta: { parentJob: j.id, role: 'from_terminal_relay' }
            }
          };
          this.wm.set('logistics', terminalToDest);
          created.push(terminalToDest);

          try {
            const taskRemote = { id: `task-${terminalToDestId}`, data: { type: 'transfer', status: 'pending', meta: { amount: terminalToDest.data.amount, from: terminalToDest.data.from, to: terminalToDest.data.to, dependsOn: [prevTaskId] } } };
            this.wm.set('tasks', taskRemote);
          } catch (e) { /* ignore */ }

          j.data._terminalPipelineHandled = true;
          this.wm.set('logistics', j);

        } else {
          // either no srcTerm or no relay -> skip
          continue;
        }      } catch (e) {
        // ignore per-job errors
      }
    }

    return created;
  }
}
