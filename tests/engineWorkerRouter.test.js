import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockWorkerInstances = [];
let shouldThrowOnRun = false;

vi.mock('../src/engines/engineMainWorker?worker&inline', () => {
  return {
    default: class MockEngineMainWorker {
      constructor() {
        this.onmessage = null;
        this.onerror = null;
        this.terminate = vi.fn(() => {
          // emulate termination behavior
        });
        mockWorkerInstances.push(this);
      }

      postMessage(message) {
        if (message?.type === 'run' && shouldThrowOnRun) {
          const error = new Error('engine worker busy');
          error.code = 'engine_worker_busy';
          throw error;
        }
      }
    },
  };
});

let computeRoute;
let cancelRunningEngine;
let getEngineWorkerStatus;

function createSimpleGraph() {
  const nodes = new Map([
    [0, { coords: [0, 0] }],
    [1, { coords: [1, 0] }],
  ]);
  const edges = [{ source: 0, target: 1, cost: 1, length: 10, travelTime: 5, reverseCost: -1 }];
  return { nodes, edges, mode: 'car' };
}

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('Worker', class Worker {});
  shouldThrowOnRun = false;
  mockWorkerInstances.length = 0;

  const router = await import('../src/engines/router.js');
  computeRoute = router.computeRoute;
  cancelRunningEngine = router.cancelRunningEngine;
  getEngineWorkerStatus = router.getEngineWorkerStatus;
});

afterEach(() => {
  vi.unstubAllGlobals();
  shouldThrowOnRun = false;
  mockWorkerInstances.length = 0;
});

describe('engine worker cancellation and busy handling', () => {
  it('rejects a pending worker route request when cancelled', async () => {
    const graph = createSimpleGraph();
    const routePromise = computeRoute([0, 0], [1, 0], graph, {
      costField: 'distance',
      engineId: 'bidirectional-astar',
    });

    expect(getEngineWorkerStatus().running).toBe(true);
    expect(mockWorkerInstances).toHaveLength(1);

    const cancelled = cancelRunningEngine('test_cancel');
    expect(cancelled).toBe(true);
    expect(mockWorkerInstances[0].terminate).toHaveBeenCalled();

    await expect(routePromise).rejects.toMatchObject({ code: 'engine_cancelled' });
    expect(getEngineWorkerStatus().running).toBe(false);
    expect(getEngineWorkerStatus().state).toBe('idle');
  });

  it('rethrows engine worker busy errors instead of falling back to the main thread', async () => {
    shouldThrowOnRun = true;
    const graph = createSimpleGraph();

    await expect(
      computeRoute([0, 0], [1, 0], graph, {
        costField: 'distance',
        engineId: 'bidirectional-astar',
      })
    ).rejects.toMatchObject({ code: 'engine_worker_busy' });
  });
});
