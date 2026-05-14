import { beforeEach, describe, expect, it, vi } from 'vitest';

let poolPostMessageSpy;
let computeRoute;

function createSimpleGraph() {
  return {
    nodes: new Map([
      [0, { coords: [0, 0] }],
      [1, { coords: [1, 0] }],
    ]),
    edges: [
      { source: 0, target: 1, cost: 1, length: 10, travelTime: 5, reverseCost: -1 },
    ],
  };
}

describe('engine worker pool routing options', () => {
  beforeEach(async () => {
    vi.resetModules();
    poolPostMessageSpy = vi.fn(() =>
      Promise.resolve({
        ok: true,
        result: {
          found: true,
          path: [0, 1],
          coordinates: [[0, 0], [1, 0]],
          cost: 10,
          engine: 'bidirectional-astar',
        },
      }),
    );

    vi.stubGlobal('Worker', class Worker {});
    vi.doMock('performance-helpers/powerPool', () => ({
      PowerPool: class {
        constructor() {
          this.postMessage = poolPostMessageSpy;
        }
      },
    }));

    const router = await import('../src/engines/router.js');
    computeRoute = router.computeRoute;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses worker pool awaitResponse without passing zeroCopy', async () => {
    const graph = createSimpleGraph();
    await computeRoute([0, 0], [1, 0], graph, {
      costField: 'distance',
      useWorkerPool: true,
      engineWorkerPoolSize: 2,
      engineId: 'bidirectional-astar',
    });

    expect(poolPostMessageSpy).toHaveBeenCalled();
    const [message, transfer, options] = poolPostMessageSpy.mock.calls[0];

    expect(message).toMatchObject({ type: 'prepareAndRun', engineId: 'bidirectional-astar' });
    expect(Array.isArray(transfer)).toBe(true);
    expect(options).toBeDefined();
    expect(options.awaitResponse).toBe(true);
    expect(options.zeroCopy).toBe(true);
  });
});
