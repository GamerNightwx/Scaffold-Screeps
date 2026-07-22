/**
 * tests/worldmodel.test.js
 * Testes unitários para WorldModel usando Vitest
 */

import { describe, it, expect, beforeEach } from 'vitest';
import WorldModel from '../src/core/WorldModel.js';

// Mock de Game/Memory para testes
global.Game = {
  time: 1,
  creeps: {},
  structures: {},
  rooms: {},
  flags: {},
  cpu: {
    getUsed: () => 5
  }
};

global.Memory = {};
global.FIND_STRUCTURES = 1;
global.FIND_SOURCES = 2;
global.FIND_MINERALS = 3;
global.FIND_DROPPED_RESOURCES = 4;

describe('WorldModel', () => {
  let wm;

  beforeEach(() => {
    wm = new WorldModel();
  });

  it('inicializar com snapshots nulos', () => {
    expect(wm.currentSnapshot).toBe(null);
    expect(wm.previousSnapshot).toBe(null);
  });

  it('capturar snapshot completo', () => {
    const snapshot = wm.snapshot();

    expect(snapshot).not.toBe(null);
    expect(typeof snapshot.tickId).toBe('number');
    expect(snapshot.game).not.toBe(null);
    expect(snapshot.indices).not.toBe(null);
    expect(snapshot.meta).not.toBe(null);

    expect(Array.isArray(snapshot.game.creeps)).toBe(true);
    expect(Array.isArray(snapshot.game.structures)).toBe(true);
    expect(Array.isArray(snapshot.game.rooms)).toBe(true);
    expect(Array.isArray(snapshot.game.flags)).toBe(true);
    expect(Array.isArray(snapshot.game.resources)).toBe(true);
  });

  it('retornar current snapshot', () => {
    expect(wm.current()).toBe(null);
    wm.snapshot();
    expect(wm.current()).not.toBe(null);
  });

  it('preservar previous snapshot', () => {
    expect(wm.previous()).toBe(null);
    wm.snapshot();
    expect(wm.previous()).toBe(null);
    wm.snapshot();
    expect(wm.previous()).not.toBe(null);
  });

  it('consultar índices', () => {
    const empty = wm.query('creepsByRoom', 'E1S1');
    expect(Array.isArray(empty)).toBe(true);
    expect(empty.length).toBe(0);

    wm.snapshot();

    const result = wm.query('creepsByRoom', 'E1S1');
    expect(Array.isArray(result)).toBe(true);
  });

  it('retornar entidades por tipo', () => {
    expect(wm.entities('creeps').length).toBe(0);

    wm.snapshot();

    const creeps = wm.entities('creeps');
    expect(Array.isArray(creeps)).toBe(true);
  });

  it('construir índices corretamente', () => {
    wm.snapshot();

    const snapshot = wm.current();
    const indices = snapshot.indices;

    expect(indices.creepsByRoom).not.toBe(null);
    expect(indices.structuresByRoom).not.toBe(null);
    expect(indices.structuresByType).not.toBe(null);
    expect(indices.sourcesByRoom).not.toBe(null);
    expect(indices.creepsById).not.toBe(null);
    expect(indices.structuresById).not.toBe(null);

    expect(typeof indices.creepsByRoom).toBe('object');
    expect(typeof indices.structuresByRoom).toBe('object');
  });

  it('capturar metadata', () => {
    wm.snapshot();

    const meta = wm.current().meta;
    expect(meta).not.toBe(null);
    expect(typeof meta.timestamp).toBe('number');
    expect(typeof meta.cpuStarted).toBe('number');
    expect(typeof meta.cpuFinished).toBe('number');
    expect(typeof meta.cpuUsed).toBe('number');
  });

  it('copiar Memory no snapshot', () => {
    global.Memory.testKey = 'testValue';
    wm.snapshot();

    const capturedMemory = wm.current().memory;
    expect(capturedMemory.testKey).toBe('testValue');
  });
});
