import { describe, it, expect } from 'vitest';
import { AdaptiveBarrierSSSP } from '../src/engines/AdaptiveBarrierSSSP/index.js';

describe('AdaptiveBarrierSSSP class basic operations', () => {
  it('supports loadGraph overloads and non-Atomics state ops', () => {
    const solver = new AdaptiveBarrierSSSP(10, 20, { forceSerialRouting: true });

    // initial state
    expect(solver.loadState(0)).toBe(0);

    // storeState and addState (non-Atomics path)
    solver.storeState(0, 5);
    expect(solver.loadState(0)).toBe(5);
    const prev = solver.addState(0, 2);
    expect(prev).toBe(5);
    expect(solver.loadState(0)).toBe(7);

    // loadGraph single-edge overload
    solver.loadGraph(0, 2, 100);
    expect(solver.targets[0]).toBe(2);
    expect(solver.weights[0]).toBe(100);

    // loadGraph array overload
    solver.loadGraph([1, 2], [3, 4], [10, 20]);
    // two more edges were added
    expect(solver.targets[1]).toBe(3);
    expect(solver.targets[2]).toBe(4);
  });

  it('uses Atomics when SharedArrayBuffer is available', () => {
    // Create solver that enables SharedArrayBuffer path (forceSerialRouting=false)
    const solver = new AdaptiveBarrierSSSP(8, 8, { forceSerialRouting: false });

    // storeState/addState/loadState should operate and return numeric values
    solver.storeState(1, 42);
    expect(solver.loadState(1)).toBe(42);
    const prev = solver.addState(1, 8);
    // addState returns previous value
    expect(prev).toBe(42);
    expect(solver.loadState(1)).toBe(50);
  });
});
