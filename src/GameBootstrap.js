/**
 * GameBootstrap.js
 * Inicializa o estado do jogo com goals, rooms, e configurações necessárias
 * Deve ser chamado uma vez no primeiro tick
 */

import Logger from './Logger.js';

export function bootstrapGame(kernel) {
  if (!kernel) return false;
  
  const wm = kernel.has('workingMemory') ? kernel.get('workingMemory') : null;
  if (!wm) return false;

  // Check if already bootstrapped
  try {
    const bootstrapMarker = wm.get ? wm.get('bootstrapMarker') : (wm._bootstrapMarker || null);
    if (bootstrapMarker && bootstrapMarker.done) {
      return false; // Already done
    }
  } catch (e) {
    // ignore
  }

  Logger.log('[Bootstrap] Starting initial game setup...');

  // Get room names from Game if available
  let roomNames = [];
  if (typeof Game !== 'undefined' && Game.rooms) {
    roomNames = Object.keys(Game.rooms).slice(0, 3); // first 3 rooms
  }

  if (roomNames.length === 0) {
    Logger.log('[Bootstrap] No rooms available, skipping room goals');
    return false;
  }

  // Create initial goals for mining and hauling in each room
  const goalsToCreate = [];

  for (const roomName of roomNames) {
    try {
      const room = typeof Game !== 'undefined' && Game.rooms ? Game.rooms[roomName] : null;
      if (!room) continue;

      // Goal 1: Mining sources
      const sources = room.find ? (room.find(FIND_SOURCES) || []) : [];
      for (const source of sources.slice(0, 2)) { // up to 2 sources per room
        const goal = {
          id: `mining-${roomName}-${source.id}`,
          createdTick: typeof Game !== 'undefined' ? Game.time : Math.floor(Date.now() / 1000),
          valid: true,
          data: {
            type: 'mining',
            priority: 100,
            status: 'pending',
            meta: {
              room: roomName,
              sourceId: source.id
            }
          }
        };
        goalsToCreate.push(goal);
      }

      // Goal 2: Transport (hauler spawning)
      const goal = {
        id: `transport-${roomName}`,
        createdTick: typeof Game !== 'undefined' ? Game.time : Math.floor(Date.now() / 1000),
        valid: true,
        data: {
          type: 'transport',
          priority: 75,
          status: 'pending',
          meta: {
            room: roomName,
            fromRoom: roomName,
            toRoom: roomName
          }
        }
      };
      goalsToCreate.push(goal);

      // Goal 3: Upgrade controller
      const goal2 = {
        id: `upgrade-${roomName}`,
        createdTick: typeof Game !== 'undefined' ? Game.time : Math.floor(Date.now() / 1000),
        valid: true,
        data: {
          type: 'upgrade',
          priority: 50,
          status: 'pending',
          meta: {
            room: roomName
          }
        }
      };
      goalsToCreate.push(goal2);
    } catch (e) {
      Logger.log(`[Bootstrap] Error creating goals for ${roomName}: ${e.message}`);
    }
  }

  // Write goals to WM
  for (const goal of goalsToCreate) {
    try {
      if (wm.set) {
        wm.set('goals', goal);
      } else if (wm.write) {
        wm.write('goals', goal);
      } else {
        wm._goals = wm._goals || [];
        wm._goals.push(goal);
      }
    } catch (e) {
      Logger.log(`[Bootstrap] Error writing goal ${goal.id}: ${e.message}`);
    }
  }

  // Mark as done
  const marker = { id: 'bootstrapMarker', done: true, createdAt: typeof Game !== 'undefined' ? Game.time : Math.floor(Date.now() / 1000) };
  try {
    if (wm.set) {
      wm.set('bootstrapMarker', marker);
    } else if (wm.write) {
      wm.write('bootstrapMarker', marker);
    } else {
      wm._bootstrapMarker = marker;
    }
  } catch (e) {
    // ignore
  }

  Logger.log(`[Bootstrap] Created ${goalsToCreate.length} initial goals`);
  return true;
}
