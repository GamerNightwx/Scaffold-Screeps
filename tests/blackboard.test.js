import { describe, it, expect, beforeEach } from 'vitest';
import Blackboard from '../src/blackboard/Blackboard.js';

describe('Blackboard', () => {
  let bb;
  beforeEach(() => {
    global.Game = { time: 200 };
    bb = new Blackboard();
  });

  it('emite e lê eventos', () => {
    bb.emitEvent({ type: 'creepDied', data: { id: 'c1' } });
    const ev = bb.events(0);
    expect(ev.length).toBe(1);
    expect(ev[0].type).toBe('creepDied');
  });

  it('emite e lê alertas', () => {
    bb.emitAlert({ message: 'low energy', severity: 'low' });
    const alerts = bb.alerts();
    expect(alerts.length).toBe(1);
    expect(alerts[0].message).toBe('low energy');
  });

  it('clear reseta o estado', () => {
    bb.emitEvent({ type: 'e' });
    bb.emitAlert({ message: 'm' });
    bb.clear();
    expect(bb.events(0).length).toBe(0);
    expect(bb.alerts().length).toBe(0);
  });
});