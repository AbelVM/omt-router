import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('engineMainWorker worker script', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('reports a prepare error for an invalid prepared graph', async () => {
    vi.stubGlobal('self', {
      postMessage: vi.fn(),
      location: { href: 'https://app.test/', origin: 'https://app.test' },
    });

    await import('../src/engines/engineMainWorker.js');

    await global.self.onmessage({ data: { type: 'prepare', prepared: { N: 0 } } });

    expect(global.self.postMessage).toHaveBeenCalledWith({
      type: 'status',
      state: 'error',
      error: 'Invalid prepared graph: missing or invalid N',
    });
  });

  it('reports an invalid requestId error for run messages', async () => {
    vi.stubGlobal('self', {
      postMessage: vi.fn(),
      location: { href: 'https://app.test/', origin: 'https://app.test' },
    });

    await import('../src/engines/engineMainWorker.js');

    await global.self.onmessage({ data: { type: 'run', requestId: null, prepared: { N: 1 } } });

    expect(global.self.postMessage).toHaveBeenCalledWith({
      type: 'status',
      state: 'error',
      error: 'Missing or invalid requestId',
    });
  });
});

describe('tilesWorker worker script', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('classifies a cross-origin fetch failure as a MissingAllowOriginHeader error', async () => {
    vi.stubGlobal('self', {
      postMessage: vi.fn(),
      location: { href: 'https://app.test/app', origin: 'https://app.test' },
    });

    global.fetch = vi.fn(() => Promise.reject(new TypeError('network failure')));
    vi.doMock('../src/graphs/graphBuilder.js', () => ({
      parseTile: () => new Uint8Array([1, 2, 3]),
    }));

    await import('../src/tiles/tilesWorker.js');

    await global.self.onmessage({
      data: {
        op: 'parse-tile',
        url: 'https://tiles.example.com/0/0/0.pbf',
        x: 0,
        y: 0,
        z: 0,
        mode: 'car',
        correlationId: 'cid',
      },
    });

    expect(global.self.postMessage).toHaveBeenCalledWith({
      correlationId: 'cid',
      output: null,
      fetchFailed: true,
      fetchError: {
        code: 'MissingAllowOriginHeader',
        message:
          'Cross-origin tile request failed. Ensure Access-Control-Allow-Origin includes this app origin or use a same-origin proxy.',
      },
    });
  });

  it('parses tile data and returns an ArrayBuffer output', async () => {
    vi.stubGlobal('self', {
      postMessage: vi.fn(),
      location: { href: 'https://app.test/app', origin: 'https://app.test' },
    });

    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(3)) })
    );
    vi.doMock('../src/graphs/graphBuilder.js', () => ({
      parseTile: () => new Uint8Array([4, 5, 6]),
    }));

    await import('../src/tiles/tilesWorker.js');

    await global.self.onmessage({
      data: {
        op: 'parse-tile',
        url: 'https://app.test/tile.pbf',
        x: 0,
        y: 0,
        z: 0,
        mode: 'car',
        correlationId: 'cid2',
      },
    });

    expect(global.self.postMessage).toHaveBeenCalled();
    const [[message, transferables]] = global.self.postMessage.mock.calls;
    expect(message).toEqual(expect.objectContaining({ correlationId: 'cid2' }));
    expect(message.output).toBeInstanceOf(ArrayBuffer);
    expect(Array.isArray(transferables)).toBe(true);
    expect(transferables[0]).toBe(message.output);
  });

  it('ignores unsupported worker messages without resetting task state', async () => {
    vi.stubGlobal('self', {
      postMessage: vi.fn(),
      location: { href: 'https://app.test/app', origin: 'https://app.test' },
    });

    global.fetch = vi.fn();
    vi.doMock('../src/graphs/graphBuilder.js', () => ({ parseTile: () => [] }));

    await import('../src/tiles/tilesWorker.js');

    await global.self.onmessage({ data: { op: 'noop' } });

    expect(global.self.postMessage).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('aborts stale parse-tile work when a reused worker receives a new message', async () => {
    vi.stubGlobal('self', {
      postMessage: vi.fn(),
      location: { href: 'https://app.test/app', origin: 'https://app.test' },
    });

    let firstFetchResolve;
    global.fetch = vi.fn((url, opts) => {
      const signal = opts?.signal;
      if (url.includes('tile1')) {
        return new Promise((resolve, reject) => {
          if (signal) {
            signal.addEventListener(
              'abort',
              () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
              { once: true }
            );
          }
          firstFetchResolve = () =>
            resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)) });
        });
      }
      return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(2)) });
    });

    vi.doMock('../src/graphs/graphBuilder.js', () => ({
      parseTile: () => new Uint8Array([7, 8, 9]),
    }));

    await import('../src/tiles/tilesWorker.js');

    const firstMessage = {
      op: 'parse-tile',
      url: 'https://app.test/tile1.pbf',
      x: 0,
      y: 0,
      z: 0,
      mode: 'car',
      correlationId: 'cid1',
    };
    const secondMessage = {
      op: 'parse-tile',
      url: 'https://app.test/tile2.pbf',
      x: 0,
      y: 0,
      z: 0,
      mode: 'car',
      correlationId: 'cid2',
    };

    const firstTask = global.self.onmessage({ data: firstMessage });
    const secondTask = global.self.onmessage({ data: secondMessage });
    firstFetchResolve();
    await secondTask;
    await firstTask;

    expect(global.self.postMessage).toHaveBeenCalledTimes(1);
    expect(global.self.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'cid2' }),
      expect.any(Array)
    );
  });
});

describe('sssp-worker worker script', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('relaxes a frontier and posts done', async () => {
    vi.stubGlobal('self', {
      postMessage: vi.fn(),
      location: { href: 'https://app.test/app', origin: 'https://app.test' },
    });

    await import('../src/engines/AdaptiveBarrierSSSP/sssp-worker.js');

    const n = 2;
    const m = 1;
    const distOff = 0;
    const headOff = n * 4;
    const nextOff = headOff + m * 4;
    const targetsOff = nextOff + m * 4;
    const weightsOff = targetsOff + m * 4;
    const currQOff = weightsOff + m * 8;
    const nextQOff = currQOff + n * 4;
    const inQueueOff = nextQOff + n * 4;
    const stateOff = (inQueueOff + 3) & ~3;
    const sab = new SharedArrayBuffer(stateOff + 8 * 4);

    const dist = new Int32Array(sab, distOff, n);
    const head = new Int32Array(sab, headOff, n);
    const next = new Int32Array(sab, nextOff, m);
    const targets = new Int32Array(sab, targetsOff, m);
    const weights = new Int32Array(sab, weightsOff, m);
    const currQ = new Int32Array(sab, currQOff, n);

    dist[0] = 0;
    dist[1] = 100;
    head[0] = 0;
    head[1] = -1;
    targets[0] = 1;
    weights[0] = 1;
    next[0] = -1;
    currQ[0] = 0;
    currQ[1] = 0;

    await global.self.onmessage({
      data: {
        sab,
        start: 0,
        end: 1,
        currQOff,
        nextQOff,
        distOff,
        headOff,
        nextOff,
        targetsOff,
        weightsOff,
        inQueueOff,
        stateOff,
        n,
        m,
      },
    });

    expect(global.self.postMessage).toHaveBeenCalledWith('done');
    expect(dist[1]).toBe(1);
  });
});
