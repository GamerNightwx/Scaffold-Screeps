import { describe, it, expect, vi } from 'vitest';
import OverlaySubsystem from '../src/OverlaySubsystem.js';

describe('OverlaySubsystem', () => {
  it('reads visualOverlays and writes visualShapes to WM', () => {
    const overlay = { room: 'W1N1', version: 1234, overlay: [ { x:1,y:1,type:'spawn' }, { x:2,y:1,type:'road' } ] };
    const wmMock = {
      _visualOverlays: [overlay],
      write: vi.fn((col, entry) => {
        if (col === 'visualShapes') wmMock._visualShapes = wmMock._visualShapes || [], wmMock._visualShapes.push(entry);
        return entry;
      }),
      list: (col) => col === 'visualOverlays' ? wmMock._visualOverlays : []
    };

    const kernelMock = { get: vi.fn((name) => wmMock) };
    const subsys = OverlaySubsystem(kernelMock);
    const res = subsys.tick();

    expect(res).toBe(1);
    expect(wmMock.write).toHaveBeenCalled();
    expect(wmMock._visualShapes && wmMock._visualShapes.length).toBe(1);
    expect(wmMock._visualShapes[0].shapes).toBeTruthy();
  });
});
