import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/index.js', () => ({
  buildTileURL: (template, tile) => `${template}/${tile.z}/${tile.x}/${tile.y}`,
  buildGraphForTiles: vi.fn(),
}));
vi.mock('../src/isolines/index.js', () => ({
  isoline: vi.fn(async () => ({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { valueMax: 1 } }],
  })),
}));

import * as Core from '../src/ui/MapLibreRoutingControl.core.js';
import { buildGraphForTiles } from '../src/index.js';
import { isoline } from '../src/isolines/index.js';
import { RouteFailureReason } from '../src/engines/router.js';

describe('MapLibreRoutingControl core helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('Worker', undefined);
  });

  it('parses and rejects invalid coordinate strings', () => {
    expect(Core.parseCoords('12.34, 56.78')).toEqual([56.78, 12.34]);
    expect(Core.parseCoords('foo, bar')).toBeNull();
    expect(Core.parseCoords('91, 0')).toBeNull();
    expect(Core.parseCoords('0, 181')).toBeNull();
  });

  it('formats duration correctly across minute and hour boundaries', () => {
    expect(Core.formatDuration(0)).toBe('< 1 min');
    expect(Core.formatDuration(30)).toBe('30 min');
    expect(Core.formatDuration(60)).toBe('1 h');
    expect(Core.formatDuration(75)).toBe('1 h 15 min');
  });

  it('formats distance and travel time for known and unknown modes', () => {
    expect(Core.fmtDistance(800)).toBe('800 m');
    expect(Core.fmtDistance(1500)).toBe('1.5 km');
    expect(Core.fmtTime(1000, 'pedestrian')).toContain('min');
    expect(Core.fmtTime(1000, 'unknown')).toContain('min');
  });

  it('returns engine badge names for known engines and preserves unknown names', () => {
    expect(Core.formatEngineBadgeName('cpu')).toBe('CPU');
    expect(Core.formatEngineBadgeName('unknown')).toBe('unknown');
  });

  it('returns correct engine badge icons for parallel and cpu engines', () => {
    expect(Core.getEngineBadgeIcon(true)).toContain('<svg');
    expect(Core.getEngineBadgeIcon(false)).toContain('<svg');
  });

  it('builds geojson only for valid graph edges with existing nodes', () => {
    expect(Core.buildGraphGeoJSON({ nodes: new Map(), edges: [] })).toEqual({
      type: 'FeatureCollection',
      features: [],
    });

    const graph = {
      nodes: new Map([
        [0, { coords: [0, 0] }],
        [1, { coords: [1, 1] }],
      ]),
      edges: [
        { source: 0, target: 1 },
        { source: 0, target: 2 },
      ],
    };
    const result = Core.buildGraphGeoJSON(graph);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].geometry.coordinates).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });

  it('formats lng/lats to a stable string', () => {
    expect(Core.lngLatToStr({ lng: 1.23456789, lat: 9.87654321 })).toBe('9.876543, 1.234568');
  });

  it('loads tile metadata when no url template is immediately available', async () => {
    const source = { setData: vi.fn() };
    const ctrl = {
      _mounted: true,
      _origin: [0, 0],
      _dest: [1, 1],
      _map: { getSource: () => source },
      _options: { routeSourceId: 'route' },
      _setupRouteSource: vi.fn(),
      _urlTemplate: null,
      _tileJsonUrl: 'http://example.com/tile.json',
      _loadTileTemplate: vi.fn(function () {
        this._urlTemplate = 'http://example.com/{z}/{x}/{y}.pbf';
        return Promise.resolve();
      }),
      _text: { status: { calculating: 'Routing...', tileUrl: 'Missing URL template' } },
      _routeOptions: {},
      _routeTimeoutMs: 1000,
      _hideStats: vi.fn(),
      _clearRoute: vi.fn(),
      _clearGraph: vi.fn(),
      _setStatus: vi.fn(),
      _cancelRunningEngine: vi.fn(),
      _routeFunction: vi.fn(() =>
        Promise.resolve({
          found: true,
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        })
      ),
      _originInput: { value: '' },
      _destInput: { value: '' },
      _placeMarker: vi.fn(),
      _showStats: vi.fn(),
      _centerMapOnSource: vi.fn(),
      _calcId: 0,
    };

    ctrl._urlTemplate = null;
    await Core.tryRoute(ctrl);

    expect(ctrl._loadTileTemplate).toHaveBeenCalled();
    expect(ctrl._routeFunction).toHaveBeenCalled();
  });

  it('calls handleRouteFailure when no route is found', async () => {
    const handleFailure = vi.fn();
    const ctrl = {
      _mounted: true,
      _origin: [0, 0],
      _dest: [1, 1],
      _map: { getSource: () => ({ setData: vi.fn() }) },
      _options: { routeSourceId: 'route' },
      _setupRouteSource: vi.fn(),
      _urlTemplate: 'http://example.com/{z}/{x}/{y}.pbf',
      _text: { status: { calculating: 'Routing...' } },
      _routeOptions: {},
      _routeTimeoutMs: 1000,
      _hideStats: vi.fn(),
      _clearRoute: vi.fn(),
      _clearGraph: vi.fn(),
      _setStatus: vi.fn(),
      _cancelRunningEngine: vi.fn(),
      _routeFunction: vi.fn(() => Promise.resolve({ found: false, coordinates: [] })),
      _handleRouteFailure: handleFailure,
      _calcId: 0,
    };

    await Core.tryRoute(ctrl);

    expect(handleFailure).toHaveBeenCalled();
  });

  it('displays partial graph status when a route succeeds with incomplete tile coverage', async () => {
    const source = { setData: vi.fn() };
    const ctrl = {
      _mounted: true,
      _origin: [0, 0],
      _dest: [1, 1],
      _map: { getSource: () => source },
      _options: { routeSourceId: 'route' },
      _setupRouteSource: vi.fn(),
      _urlTemplate: 'http://example.com/{z}/{x}/{y}.pbf',
      _text: {
        status: {
          calculating: 'Routing...',
          partialGraph:
            'Partial graph used for this route. Some segments may be missing because tiles were unavailable.',
        },
      },
      _routeOptions: {},
      _routeTimeoutMs: 1000,
      _hideStats: vi.fn(),
      _clearRoute: vi.fn(),
      _clearGraph: vi.fn(),
      _setStatus: vi.fn(),
      _cancelRunningEngine: vi.fn(),
      _routeFunction: vi.fn(() =>
        Promise.resolve({
          found: true,
          coordinates: [
            [0, 0],
            [1, 1],
          ],
          partialGraph: true,
        })
      ),
      _originInput: { value: '' },
      _destInput: { value: '' },
      _placeMarker: vi.fn(),
      _showStats: vi.fn(),
      _centerMapOnSource: vi.fn(),
      _calcId: 0,
    };

    await Core.tryRoute(ctrl);

    expect(source.setData).toHaveBeenCalled();
    expect(ctrl._setStatus).toHaveBeenLastCalledWith(
      'Partial graph used for this route. Some segments may be missing because tiles were unavailable.',
      'error'
    );
  });

  it('handles missing isoline graphs by reporting a tile CORS issue', async () => {
    buildGraphForTiles.mockResolvedValueOnce({ hasMissingTiles: true });
    const src = { setData: vi.fn() };
    const ctrl = {
      _mounted: true,
      _isoline: { point: [0, 0], maxCost: 100, direction: 'from' },
      _setupRouteSource: vi.fn(),
      _map: { getSource: () => src, getLayer: () => false },
      _options: { isolineSourceId: 'isoline' },
      _text: { status: { waitingStyle: 'Waiting for style', tileCors: 'Tile CORS' } },
      _setStatus: vi.fn(),
      _routeOptions: { maxAcceptableSnapDistanceM: 100, penalties: {} },
      _mode: 'car',
      _costField: 'distance',
      _urlTemplate: 'http://example.com/{z}/{x}/{y}.pbf',
      _tileUrlTransform: undefined,
      _tileProxyTemplate: undefined,
      _routeFunction: vi.fn(),
      _calcId: 0,
    };

    await Core.tryIsoline(ctrl);

    expect(ctrl._setStatus).toHaveBeenCalledWith('Tile CORS', 'error');
  });

  it('converts a Feature isoline result into a FeatureCollection and updates source data', async () => {
    isoline.mockResolvedValueOnce({
      type: 'Feature',
      properties: { valueMax: 10 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
    });
    const src = { setData: vi.fn() };
    buildGraphForTiles.mockResolvedValueOnce({
      nodes: new Map([[0, { coords: [0, 0] }]]),
      edges: [{ source: 0, target: 0 }],
    });

    const ctrl = {
      _mounted: true,
      _isoline: { point: [0, 0], maxCost: 100, direction: 'from' },
      _setupRouteSource: vi.fn(),
      _map: { getSource: () => src, getLayer: () => false },
      _options: {
        isolineSourceId: 'isoline',
        isolineFillLayerId: 'fill',
        isolineOutlineLayerId: 'outline',
        startColor: '#000',
        endColor: '#fff',
      },
      _text: {
        status: { waitingStyle: 'Waiting for style', calculatingIsoline: 'Calculating isoline' },
      },
      _setStatus: vi.fn(),
      _routeOptions: { maxAcceptableSnapDistanceM: 100, penalties: {} },
      _mode: 'car',
      _costField: 'distance',
      _urlTemplate: 'http://example.com/{z}/{x}/{y}.pbf',
      _tileUrlTransform: undefined,
      _tileProxyTemplate: undefined,
      _routeFunction: vi.fn(),
      _calcId: 0,
      _centerMapOnSource: vi.fn(),
    };

    await Core.tryIsoline(ctrl);

    expect(src.setData).toHaveBeenCalled();
    expect(ctrl._setStatus).toHaveBeenCalledWith('', '');
  });

  it('uses a null-safe fill-sort-key expression when updating isoline styles', async () => {
    isoline.mockResolvedValueOnce({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { valueMax: 3 },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 0]]] },
        },
        {
          type: 'Feature',
          properties: { valueMax: 5 },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 0]]] },
        },
      ],
    });
    buildGraphForTiles.mockResolvedValueOnce({
      nodes: new Map([[0, { coords: [0, 0] }]]),
      edges: [{ source: 0, target: 0 }],
    });

    const src = { setData: vi.fn() };
    const ctrl = {
      _mounted: true,
      _isoline: { point: [0, 0], maxCost: 100, direction: 'from' },
      _setupRouteSource: vi.fn(),
      _map: {
        getSource: () => src,
        getLayer: () => true,
        setPaintProperty: vi.fn(),
        setLayoutProperty: vi.fn(),
      },
      _options: {
        isolineSourceId: 'isoline',
        isolineFillLayerId: 'fill',
        isolineOutlineLayerId: 'outline',
        startColor: '#000',
        endColor: '#fff',
      },
      _text: {
        status: { waitingStyle: 'Waiting for style', calculatingIsoline: 'Calculating isoline' },
      },
      _setStatus: vi.fn(),
      _routeOptions: { maxAcceptableSnapDistanceM: 100, penalties: {} },
      _mode: 'car',
      _costField: 'distance',
      _urlTemplate: 'http://example.com/{z}/{x}/{y}.pbf',
      _tileUrlTransform: undefined,
      _tileProxyTemplate: undefined,
      _routeFunction: vi.fn(),
      _calcId: 0,
      _centerMapOnSource: vi.fn(),
    };

    await Core.tryIsoline(ctrl);

    expect(ctrl._map.setLayoutProperty).toHaveBeenCalledWith(
      'fill',
      'fill-sort-key',
      [
        'coalesce',
        ['to-number', ['*', -1, [
          'coalesce',
          [
            'coalesce',
            ['to-number', ['coalesce', ['get', 'valueMax'], ['get', 'break'], 3]],
            3,
          ],
          3,
        ]]],
        0,
      ]
    );
  });

  it('builds Y when route function fallback is used for isoline graph creation', async () => {
    buildGraphForTiles.mockRejectedValueOnce(new Error('tile failure'));
    isoline.mockResolvedValueOnce({ type: 'FeatureCollection', features: [] });
    const src = { setData: vi.fn() };
    const ctrl = {
      _mounted: true,
      _isoline: { point: [0, 0], maxCost: 100, direction: 'from' },
      _setupRouteSource: vi.fn(),
      _map: { getSource: () => src, getLayer: () => false },
      _options: { isolineSourceId: 'isoline' },
      _text: {
        status: {
          waitingStyle: 'Waiting for style',
          calculatingIsoline: 'Calculating isoline',
          noGraph: 'Graph unavailable',
        },
      },
      _setStatus: vi.fn(),
      _routeOptions: { maxAcceptableSnapDistanceM: 100, penalties: {} },
      _mode: 'car',
      _costField: 'distance',
      _urlTemplate: 'http://example.com/{z}/{x}/{y}.pbf',
      _tileUrlTransform: undefined,
      _tileProxyTemplate: undefined,
      _routeFunction: vi.fn(() =>
        Promise.resolve({
          graph: { nodes: new Map([[0, { coords: [0, 0] }]]), edges: [{ source: 0, target: 0 }] },
        })
      ),
      _calcId: 0,
      _centerMapOnSource: vi.fn(),
    };

    await Core.tryIsoline(ctrl);

    expect(ctrl._routeFunction).toHaveBeenCalled();
    expect(src.setData).toHaveBeenCalled();
  });

  it('handles missing isoline source by setting waiting status', async () => {
    const ctrl = {
      _mounted: true,
      _isoline: { point: [0, 0], maxCost: 100, direction: 'from' },
      _setupRouteSource: vi.fn(),
      _map: { getSource: () => null },
      _options: { isolineSourceId: 'isoline' },
      _text: { status: { waitingStyle: 'Waiting for style' } },
      _setStatus: vi.fn(),
      _calcId: 0,
    };

    await Core.tryIsoline(ctrl);
    expect(ctrl._setStatus).toHaveBeenCalledWith('Waiting for style', 'loading');
  });

  it('handles route failures and clears visuals', () => {
    const status = vi.fn();
    const ctrl = {
      _text: {
        status: {
          noRoute: 'No route',
          poorSnap: 'Poor snap',
          tileCors: 'Tile CORS',
          noNode: 'No node',
          noPath: 'No path',
          incompletePath: 'Incomplete path',
        },
      },
      _setStatus: status,
      _clearRoute: vi.fn(),
      _clearGraph: vi.fn(),
    };

    Core.handleRouteFailure(ctrl, { reason: RouteFailureReason.NO_PATH });
    expect(status).toHaveBeenCalledWith('No path', 'error');
    expect(ctrl._clearRoute).toHaveBeenCalled();
    expect(ctrl._clearGraph).toHaveBeenCalled();

    status.mockClear();
    Core.handleRouteFailure(ctrl, { reason: 'UNKNOWN' });
    expect(status).toHaveBeenCalledWith('No route', 'error');
  });

  it('returns early when tryRoute is called without origin or destination', async () => {
    const ctrl = {
      _mounted: true,
      _origin: null,
      _dest: null,
      _map: {},
      _text: { status: {} },
      _routeTimeoutMs: 1000,
    };
    await Core.tryRoute(ctrl);
    expect(ctrl._origin).toBeNull();
  });

  it('sets tile url error and clears route when no url template is available', async () => {
    const ctrl = {
      _mounted: true,
      _origin: [0, 0],
      _dest: [1, 1],
      _map: { getSource: () => ({ setData: vi.fn() }) },
      _options: { routeSourceId: 'route' },
      _setupRouteSource: vi.fn(),
      _urlTemplate: null,
      _tileJsonUrl: null,
      _text: { status: { tileUrl: 'Missing URL template' } },
      _routeOptions: {},
      _routeTimeoutMs: 1000,
      _hideStats: vi.fn(),
      _clearRoute: vi.fn(),
      _clearGraph: vi.fn(),
      _setStatus: vi.fn(),
      _cancelRunningEngine: vi.fn(),
      _routeFunction: vi.fn(),
    };

    await Core.tryRoute(ctrl);

    expect(ctrl._setStatus).toHaveBeenCalledWith('Missing URL template', 'error');
    expect(ctrl._clearRoute).toHaveBeenCalled();
  });

  it('handles engine-cancelled route errors by clearing visuals and setting an error state', async () => {
    const ctrl = {
      _mounted: true,
      _origin: [0, 0],
      _dest: [1, 1],
      _map: { getSource: () => ({ setData: vi.fn() }) },
      _options: { routeSourceId: 'route' },
      _setupRouteSource: vi.fn(),
      _urlTemplate: 'http://example.com/{z}/{x}/{y}.pbf',
      _text: {
        status: { timedOut: 'Timed out', cancelled: 'Cancelled', routeErrorPrefix: 'Error:' },
      },
      _routeOptions: {},
      _routeTimeoutMs: 1000,
      _hideStats: vi.fn(),
      _clearRoute: vi.fn(),
      _clearGraph: vi.fn(),
      _setStatus: vi.fn(),
      _cancelRunningEngine: vi.fn(),
      _routeFunction: vi.fn(() => Promise.reject({ code: 'engine_cancelled', message: 'Stopped' })),
    };

    await Core.tryRoute(ctrl);

    expect(ctrl._setStatus).toHaveBeenCalled();
    expect(ctrl._clearRoute).toHaveBeenCalled();
    expect(ctrl._clearGraph).toHaveBeenCalled();
  });

  it('sets waiting status when tryIsoline runs before the isoline source exists', async () => {
    const ctrl = {
      _mounted: true,
      _isoline: { point: [0, 0], maxCost: 100, direction: 'from' },
      _setupRouteSource: vi.fn(),
      _map: { getSource: () => null },
      _options: { isolineSourceId: 'isoline' },
      _text: { status: { waitingStyle: 'Waiting for style' } },
      _setStatus: vi.fn(),
    };

    await Core.tryIsoline(ctrl);

    expect(ctrl._setupRouteSource).toHaveBeenCalled();
    expect(ctrl._setStatus).toHaveBeenCalledWith('Waiting for style', 'loading');
  });

  it('sets tile metadata error when tryIsoline fails to load tile template', async () => {
    const ctrl = {
      _mounted: true,
      _isoline: { point: [0, 0], maxCost: 100, direction: 'from' },
      _setupRouteSource: vi.fn(),
      _map: { getSource: () => ({ setData: vi.fn() }) },
      _options: { isolineSourceId: 'isoline' },
      _tileJsonUrl: 'http://example.com/tile.json',
      _loadTileTemplate: vi.fn(() => Promise.reject(new Error('Bad metadata'))),
      _text: { status: { tileMetadata: 'Tile metadata error' } },
      _setStatus: vi.fn(),
      _routeOptions: { maxAcceptableSnapDistanceM: 100 },
      _mode: 'car',
      _costField: 'distance',
      _urlTemplate: null,
      _tileUrlTransform: undefined,
      _tileProxyTemplate: undefined,
      _routeFunction: vi.fn(),
    };

    await Core.tryIsoline(ctrl);

    expect(ctrl._setStatus).toHaveBeenCalledWith('Tile metadata error', 'error');
  });

  it('computes isoline on the main thread when worker support is unavailable', async () => {
    const routeFunction = vi.fn(() =>
      Promise.resolve({
        graph: { nodes: new Map([[0, { coords: [0, 0] }]]), edges: [{ source: 0, target: 0 }] },
      })
    );
    const setData = vi.fn();
    buildGraphForTiles.mockResolvedValue({
      nodes: new Map([[0, { coords: [0, 0] }]]),
      edges: [{ source: 0, target: 0 }],
    });

    const ctrl = {
      _mounted: true,
      _isoline: { point: [0, 0], maxCost: 100, direction: 'from' },
      _setupRouteSource: vi.fn(),
      _map: {
        getSource: () => ({ setData }),
        getLayer: () => false,
      },
      _options: {
        isolineSourceId: 'isoline',
        isolineFillLayerId: 'fill-layer',
        isolineOutlineLayerId: 'outline-layer',
        startColor: '#000000',
        endColor: '#ffffff',
      },
      _text: { status: { noRoute: 'Isoline failed' } },
      _setStatus: vi.fn(),
      _routeOptions: { maxAcceptableSnapDistanceM: 100, penalties: {} },
      _mode: 'car',
      _costField: 'distance',
      _urlTemplate: 'http://example.com/{z}/{x}/{y}.pbf',
      _tileUrlTransform: undefined,
      _tileProxyTemplate: undefined,
      _routeFunction: routeFunction,
      _calcId: 0,
      _centerMapOnSource: vi.fn(),
    };

    await Core.tryIsoline(ctrl);

    expect(buildGraphForTiles).toHaveBeenCalled();
    expect(setData).toHaveBeenCalled();
    expect(ctrl._centerMapOnSource).toHaveBeenCalledWith('isoline', {
      padding: 100,
      maxZoom: 16,
      duration: 600,
    });
    expect(ctrl._setStatus).toHaveBeenCalledWith('', '');
  });

  it('computes isoline in worker when the worker exists and transfers typed arrays', async () => {
    const rejectOld = vi.fn();
    const ctrl = {
      _isolineWorker: undefined,
      _isolinePendingRequests: new Map([['old', { resolve: vi.fn(), reject: rejectOld }]]),
    };
    const fakeWorker = {
      postMessage: vi.fn((message, transferList) => {
        expect(message.type).toBe('compute');
        expect(Array.isArray(transferList)).toBe(true);
        expect(transferList.length).toBe(1);
        const pending = ctrl._isolinePendingRequests.get(message.id);
        pending.resolve({ type: 'FeatureCollection', features: [] });
      }),
      addEventListener: vi.fn(),
    };
    ctrl._isolineWorker = fakeWorker;

    const result = await Core.computeIsolineInWorker(ctrl, {
      graph: { buffer: new Uint8Array([1, 2, 3]) },
    });

    expect(result).toEqual({ type: 'FeatureCollection', features: [] });
    expect(fakeWorker.postMessage).toHaveBeenCalled();
    expect(rejectOld).toHaveBeenCalled();
  });

  it('reports a missing graph when buildGraphForTiles returns no graph', async () => {
    buildGraphForTiles.mockResolvedValueOnce(null);
    const src = { setData: vi.fn() };

    const ctrl = {
      _mounted: true,
      _isoline: { point: [0, 0], maxCost: 100, direction: 'from' },
      _setupRouteSource: vi.fn(),
      _map: { getSource: () => src, getLayer: () => false },
      _options: { isolineSourceId: 'isoline' },
      _text: { status: { waitingStyle: 'Waiting for style', noGraph: 'Graph unavailable' } },
      _setStatus: vi.fn(),
      _routeOptions: { maxAcceptableSnapDistanceM: 100, penalties: {} },
      _mode: 'car',
      _costField: 'distance',
      _urlTemplate: 'http://example.com/{z}/{x}/{y}.pbf',
      _tileUrlTransform: undefined,
      _tileProxyTemplate: undefined,
      _routeFunction: vi.fn(),
      _calcId: 0,
    };

    await Core.tryIsoline(ctrl);

    expect(ctrl._setStatus).toHaveBeenCalledWith('Graph unavailable', 'error');
  });

  it('clears graph data when a found route returns no graph', async () => {
    const routeSource = { setData: vi.fn() };
    const graphSource = { setData: vi.fn() };
    const ctrl = {
      _mounted: true,
      _origin: [0, 0],
      _dest: [1, 1],
      _map: {
        getSource: vi.fn((id) => {
          if (id === 'route') return routeSource;
          if (id === 'graph') return graphSource;
          return null;
        }),
      },
      _options: { routeSourceId: 'route', graphSourceId: 'graph', showGraph: true },
      _setupRouteSource: vi.fn(),
      _urlTemplate: 'http://example.com/{z}/{x}/{y}.pbf',
      _text: { status: { calculating: 'Routing...' } },
      _routeOptions: {},
      _routeTimeoutMs: 1000,
      _hideStats: vi.fn(),
      _clearRoute: vi.fn(),
      _clearGraph: vi.fn(),
      _setStatus: vi.fn(),
      _cancelRunningEngine: vi.fn(),
      _routeFunction: vi.fn(() =>
        Promise.resolve({
          found: true,
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        })
      ),
      _originInput: { value: '' },
      _destInput: { value: '' },
      _placeMarker: vi.fn(),
      _showStats: vi.fn(),
      _centerMapOnSource: vi.fn(),
      _calcId: 0,
    };

    await Core.tryRoute(ctrl);

    expect(routeSource.setData).toHaveBeenCalled();
    expect(ctrl._clearGraph).toHaveBeenCalled();
  });

  it('reports string-based route errors using the error prefix', async () => {
    const ctrl = {
      _mounted: true,
      _origin: [0, 0],
      _dest: [1, 1],
      _map: { getSource: () => ({ setData: vi.fn() }) },
      _options: { routeSourceId: 'route' },
      _setupRouteSource: vi.fn(),
      _urlTemplate: 'http://example.com/{z}/{x}/{y}.pbf',
      _text: { status: { routeErrorPrefix: 'Error:', unknownError: 'Unknown routing error' } },
      _routeOptions: {},
      _routeTimeoutMs: 1000,
      _hideStats: vi.fn(),
      _clearRoute: vi.fn(),
      _clearGraph: vi.fn(),
      _setStatus: vi.fn(),
      _cancelRunningEngine: vi.fn(),
      _routeFunction: vi.fn(() => Promise.reject('network failure')),
      _originInput: { value: '' },
      _destInput: { value: '' },
      _calcId: 0,
    };

    await Core.tryRoute(ctrl);

    expect(ctrl._setStatus).toHaveBeenLastCalledWith('Error: network failure', 'error');
  });

  it('handles generic route errors and reports a prefixed message', async () => {
    const ctrl = {
      _mounted: true,
      _origin: [0, 0],
      _dest: [1, 1],
      _map: { getSource: () => ({ setData: vi.fn() }) },
      _options: { routeSourceId: 'route' },
      _setupRouteSource: vi.fn(),
      _urlTemplate: 'http://example.com/{z}/{x}/{y}.pbf',
      _text: {
        status: {
          timedOut: 'Timed out',
          cancelled: 'Cancelled',
          routeErrorPrefix: 'Error:',
          unknownError: 'Unknown routing error',
        },
      },
      _routeOptions: {},
      _routeTimeoutMs: 1000,
      _hideStats: vi.fn(),
      _clearRoute: vi.fn(),
      _clearGraph: vi.fn(),
      _setStatus: vi.fn(),
      _cancelRunningEngine: vi.fn(),
      _routeFunction: vi.fn(() => Promise.reject(new Error('Generic failure'))),
      _originInput: { value: '' },
      _destInput: { value: '' },
      _calcId: 0,
    };

    await Core.tryRoute(ctrl);

    expect(ctrl._setStatus).toHaveBeenLastCalledWith('Error: Generic failure', 'error');
    expect(ctrl._clearRoute).toHaveBeenCalled();
    expect(ctrl._clearGraph).toHaveBeenCalled();
  });

  it('renders a found route and optionally graph source data', async () => {
    const routeSource = { setData: vi.fn() };
    const graphSource = { setData: vi.fn() };
    const ctrl = {
      _mounted: true,
      _origin: [0, 0],
      _dest: [1, 1],
      _map: {
        getSource: vi.fn((id) => {
          if (id === 'route') return routeSource;
          if (id === 'graph') return graphSource;
          return null;
        }),
      },
      _options: { routeSourceId: 'route', graphSourceId: 'graph', showGraph: true },
      _setupRouteSource: vi.fn(),
      _urlTemplate: 'http://example.com/{z}/{x}/{y}.pbf',
      _text: { status: { calculating: 'Routing...' } },
      _routeOptions: {},
      _routeTimeoutMs: 1000,
      _hideStats: vi.fn(),
      _clearRoute: vi.fn(),
      _clearGraph: vi.fn(),
      _setStatus: vi.fn(),
      _cancelRunningEngine: vi.fn(),
      _routeFunction: vi.fn(() =>
        Promise.resolve({
          found: true,
          coordinates: [
            [0, 0],
            [1, 1],
          ],
          graph: { nodes: new Map([[0, { coords: [0, 0] }]]), edges: [{ source: 0, target: 0 }] },
        })
      ),
      _originInput: { value: '' },
      _destInput: { value: '' },
      _placeMarker: vi.fn(),
      _showStats: vi.fn(),
      _centerMapOnSource: vi.fn(),
      _calcId: 0,
    };

    await Core.tryRoute(ctrl);

    expect(routeSource.setData).toHaveBeenCalled();
    expect(graphSource.setData).toHaveBeenCalled();
    expect(ctrl._origin).toEqual([0, 0]);
    expect(ctrl._dest).toEqual([1, 1]);
    expect(ctrl._originInput.value).toContain('0.000000');
    expect(ctrl._destInput.value).toContain('1.000000');
    expect(ctrl._placeMarker).toHaveBeenCalledTimes(2);
    expect(ctrl._showStats).toHaveBeenCalled();
    expect(ctrl._setStatus).toHaveBeenCalledWith('');
  });

  it('handles non-path route failure reasons with localized status and clears visuals', () => {
    const status = vi.fn();
    const ctrl = {
      _text: {
        status: {
          tileCors: 'CORS',
          poorSnap: 'Poor snap',
          noNode: 'No node',
          incompletePath: 'Incomplete',
          noRoute: 'No route',
        },
      },
      _setStatus: status,
      _clearRoute: vi.fn(),
      _clearGraph: vi.fn(),
    };

    const cases = [
      { reason: RouteFailureReason.TILE_CORS, expected: 'CORS' },
      { reason: RouteFailureReason.POOR_SNAP, expected: 'Poor snap' },
      { reason: RouteFailureReason.NO_NODE, expected: 'No node' },
      { reason: RouteFailureReason.INCOMPLETE_PATH, expected: 'Incomplete' },
    ];

    for (const testCase of cases) {
      status.mockClear();
      ctrl._clearRoute.mockClear();
      ctrl._clearGraph.mockClear();

      Core.handleRouteFailure(ctrl, { reason: testCase.reason });

      expect(status).toHaveBeenCalledWith(testCase.expected, 'error');
      expect(ctrl._clearRoute).toHaveBeenCalled();
      expect(ctrl._clearGraph).toHaveBeenCalled();
    }
  });
});
