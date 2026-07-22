/**
 * tests/kernel.test.js
 * Testes unitários para Kernel usando Vitest
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Kernel from '../src/kernel/Kernel.js';

// Mock de Game/Memory para testes
global.Game = {
  time: 1,
  cpu: {
    getUsed: () => 5,
    limit: 500
  },
  creeps: {},
  structures: {},
  rooms: {},
  flags: {}
};

global.Memory = {};

describe('Kernel', () => {
  let kernel;

  beforeEach(() => {
    kernel = new Kernel();
  });

  it('construir com configuração padrão', () => {
    expect(kernel.cpuBudget).toBe(19);
    expect(kernel.cpuReserve).toBe(2);
    expect(kernel.subsystems.size).toBe(0);
  });

  it('registrar subsistema', () => {
    const mockSubsystem = { name: 'test' };
    kernel.register('test', () => mockSubsystem);
    expect(kernel.has('test')).toBe(true);
  });

  it('retornar subsistema registrado', () => {
    const mockSubsystem = { name: 'test' };
    kernel.register('test', () => mockSubsystem);
    const retrieved = kernel.get('test');
    expect(retrieved.name).toBe('test');
  });

  it('lançar erro ao acessar subsistema não registrado', () => {
    expect(() => kernel.get('nonexistent')).toThrow();
  });

  it('lazy initialization de subsistemas', () => {
    let initCalled = false;
    kernel.register('lazy', () => {
      initCalled = true;
      return { name: 'lazy' };
    });
    expect(initCalled).toBe(false);
    kernel.get('lazy');
    expect(initCalled).toBe(true);
    const second = kernel.get('lazy');
    expect(kernel.subsystems.get('lazy').instance).toBe(second);
  });

  it('validar subsistemas obrigatórios', () => {
    const validation = kernel.validate();
    expect(validation.valid).toBe(false);
    expect(validation.missing.length).toBeGreaterThan(0);
  });

  it('métricas serem nulas antes do primeiro tick', () => {
    expect(kernel.metrics()).toBe(null);
  });

  it('executar tick com sucesso', () => {
    kernel.register('blackboard', () => ({
      clear: () => {}
    }));
    kernel.register('worldModel', () => ({
      snapshot: () => {}
    }));
    kernel.register('commandEngine', () => ({}));

    const result = kernel.tick();
    expect(result.success).toBe(true);
    expect(typeof result.cpuUsed).toBe('number');
    expect(typeof result.cpuRemaining).toBe('number');
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('reportar erros durante tick', () => {
    kernel.register('worldModel', () => ({
      snapshot: () => {
        throw new Error('Test error');
      }
    }));
    kernel.register('blackboard', () => ({
      clear: () => {}
    }));
    kernel.register('commandEngine', () => ({}));

    const result = kernel.tick();
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
