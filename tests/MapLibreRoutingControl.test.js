import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapLibreRoutingControl, parseCoords } from '../src/ui/MapLibreRoutingControl.js';
import { RouteFailureReason } from '../src/engines/router.js';

class MarkerStub {
  constructor({ element, draggable }) {
    this.element = element;
    this.draggable = draggable;
    this.listeners = {};
    this.lngLat = null;
  }

  setLngLat(lngLat) {
    this.lngLat = lngLat;
    return this;
  }

  addTo(map) {
    this.map = map;
    return this;
  }

  on(event, callback) {
    this.listeners[event] = callback;
    return this;
  }

  getLngLat() {
    return { lng: this.lngLat[0], lat: this.lngLat[1] };
  }

  remove() {}
}

class LngLatBoundsStub {
  constructor(coordA, coordB) {
    this.coordA = coordA;
    this.coordB = coordB;
  }

  extend() {
    return this;
  }
}

function createElementStub() {
  const element = {
    className: '',
    hidden: false,
    innerHTML: '',
    textContent: '',
    value: '',
    classList: {
      add: vi.fn(),
      toggle: vi.fn(),
    },
    dataset: {},
    style: {},
    addEventListener: vi.fn(),
    remove: vi.fn(),
    setAttribute: vi.fn(),
    querySelector: vi.fn(() => null),
  };
  return element;
}

function createDocumentStub() {
  return {
    createElement: () => createElementStub(),
  };
}

describe('MapLibreRoutingControl', () => {
  let fakeMap;
  let fakeMaplibre;
  let routeSource;
  let graphSource;

  beforeEach(() => {
    vi.restoreAllMocks();
    global.document = createDocumentStub();
    fakeMaplibre = {
      Marker: MarkerStub,
      LngLatBounds: LngLatBoundsStub,
    };

    routeSource = { setData: vi.fn() };
    graphSource = { setData: vi.fn() };
    fakeMap = {
      sources: new Map(),
      layers: new Set(),
      eventHandlers: new Map(),
      isStyleLoaded: () => true,
      on(event, cb) {
        this.eventHandlers.set(event, cb);
      },
      off(event) {
        this.eventHandlers.delete(event);
      },
      once(event, cb) {
        if (event === 'load') {
          cb();
        }
      },
      addSource(id, source) {
        this.sources.set(id, { ...source, setData: vi.fn() });
      },
      addLayer(layer) {
        this.layers.add(layer.id);
      },
      getSource(id) {
        return this.sources.get(id) ?? null;
      },
      setPaintProperty: vi.fn(),
      setLayoutProperty: vi.fn(),
      getLayer(id) {
        return this.layers.has(id) ? { id } : null;
      },
      removeLayer(id) {
        this.layers.delete(id);
      },
      removeSource(id) {
        this.sources.delete(id);
      },
      fitBounds: vi.fn(),
    };
  });

  it('parses GPS coordinates and rejects invalid strings', () => {
    expect(parseCoords('12.34, 56.78')).toEqual([56.78, 12.34]);
    expect(parseCoords('foo, bar')).toBeNull();
    expect(parseCoords('100, 0')).toBeNull();
  });

  it('shows routing stats for a valid route result', async () => {
    const routeFunction = vi.fn(async () => ({
      found: true,
      costField: 'distance',
      cost: 1200,
      coordinates: [[0, 0], [0.01, 0]],
      engine: 'cpu',
      parallelUsed: false,
    }));

    const control = new MapLibreRoutingControl({
      maplibre: fakeMaplibre,
      routeFunction,
      getEngineWorkerStatus: () => ({ running: false }),
      onEngineWorkerStatusChange: () => () => {},
    });

    control._mounted = true;
    control._map = fakeMap;
    control._statusEl = createElementStub();
    control._statsEl = createElementStub();
    control._statDistEl = createElementStub();
    control._statTimeEl = createElementStub();
    control._statDistLabelEl = createElementStub();
    control._statTimeLabelEl = createElementStub();
    control._engineBadgeEl = createElementStub();
    control._originInput = createElementStub();
    control._destInput = createElementStub();
    control._originInput.value = '';
    control._destInput.value = '';

    control._urlTemplate = 'http://example.com/{z}/{x}/{y}.pbf';
    control._origin = [0, 0];
    control._dest = [0.01, 0];

    await control._tryRoute();

    expect(routeFunction).toHaveBeenCalled();
    expect(control._statusEl.hidden).toBe(true);
    expect(control._engineBadgeEl.hidden).toBe(false);
    expect(control._statsEl.hidden).toBe(false);
    expect(control._originInput.value).toContain('0.000000');
  });

  it('anchors isoline interpolation endpoints to the configured colors', async () => {
    const routeFunction = vi.fn(async () => ({
      found: true,
      graph: {
        nodes: new Map([
          [0, { coords: [0, -0.0001] }],
          [1, { coords: [0, 0.0001] }],
        ]),
        edges: [
          {
            source: 0,
            target: 1,
            cost: 1,
            reverseCost: 1,
            length: 100,
            travelTime: 100,
          },
        ],
      },
    }));

    const control = new MapLibreRoutingControl({
      maplibre: fakeMaplibre,
      routeFunction,
    });

    control._mounted = true;
    control._map = fakeMap;
    fakeMap.addSource(control._options.isolineSourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    fakeMap.addLayer({ id: control._options.isolineFillLayerId });
    fakeMap.addLayer({ id: control._options.isolineOutlineLayerId });
    control._isoline = { point: [0, 0], direction: 'from' };
    control._urlTemplate = 'http://example.com/{z}/{x}/{y}.pbf';

    await control._tryIsoline();

    const fillColorCall = fakeMap.setPaintProperty.mock.calls.find(
      ([layerId, property]) => layerId === control._options.isolineFillLayerId && property === 'fill-color'
    );
    expect(fillColorCall).toBeDefined();
    const expression = fillColorCall[2];
    expect(expression[0]).toBe('interpolate-hcl');
    expect(expression[1]).toEqual(['linear']);
    expect(expression[2]).toEqual(['get', 'valueMax']);
    expect(expression).toEqual(
      expect.arrayContaining([
        'interpolate-hcl',
        ['linear'],
        ['get', 'valueMax'],
        expect.any(Number),
        control._options.startColor,
        expect.any(Number),
        control._options.startColor,
        expect.any(Number),
        control._options.endColor,
        expect.any(Number),
        control._options.endColor,
      ])
    );
  });

  it('loads tile template once and caches the promise', async () => {
    const control = new MapLibreRoutingControl({ maplibre: fakeMaplibre });
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ tiles: ['https://tile.example/{z}/{x}/{y}.pbf'] }),
    }));
    control._tileJsonUrl = 'https://meta.example/tile.json';

    const first = await control._loadTileTemplate();
    const second = await control._loadTileTemplate();

    expect(first).toBe(second);
    expect(control._urlTemplate).toContain('{z}');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns valid Graph GeoJSON only when nodes and edges are present', () => {
    const control = new MapLibreRoutingControl({ maplibre: fakeMaplibre });

    expect(control._buildGraphGeoJSON({})).toEqual({ type: 'FeatureCollection', features: [] });

    const graph = {
      nodes: new Map([
        [0, { coords: [0, 0] }],
        [1, { coords: [1, 1] }],
      ]),
      edges: [{ source: 0, target: 1 }],
    };

    expect(control._buildGraphGeoJSON(graph).features).toHaveLength(1);
  });

  it('handles route failure reasons and updates status text', () => {
    const control = new MapLibreRoutingControl({ maplibre: fakeMaplibre });
    control._statusEl = createElementStub();
    control._text = { status: { tileCors: 'CORS', noRoute: 'No route' } };

    control._handleRouteFailure({ reason: RouteFailureReason.TILE_CORS });
    expect(control._statusEl.className).toContain('error');
    expect(control._statusEl.textContent).toBe('CORS');

    control._handleRouteFailure({ reason: 'UNKNOWN_REASON' });
    expect(control._statusEl.textContent).toBe('No route');
  });

  it('clears route and graph only when sources exist', () => {
    const control = new MapLibreRoutingControl({ maplibre: fakeMaplibre });
    control._map = fakeMap;
    fakeMap.sources.set(control._options.routeSourceId, routeSource);
    fakeMap.sources.set(control._options.graphSourceId, graphSource);

    control._clearRoute();
    control._clearGraph();

    expect(routeSource.setData).toHaveBeenCalled();
    expect(graphSource.setData).toHaveBeenCalled();
  });

  it('removes map listeners and stops engine when removed', () => {
    const cancelRunningEngine = vi.fn();
    const control = new MapLibreRoutingControl({
      maplibre: fakeMaplibre,
      cancelRunningEngine,
      getEngineWorkerStatus: () => ({ running: true }),
      onEngineWorkerStatusChange: () => () => {},
    });
    control._map = fakeMap;
    control._panel = createElementStub();
    control._engineBusy = true;
    control._markers = { origin: { remove: vi.fn() }, dest: { remove: vi.fn() } };

    control.onRemove();

    expect(cancelRunningEngine).toHaveBeenCalledWith('routing_control_removed');
  });

  it('resolves theme class names correctly', () => {
    const controlDark = new MapLibreRoutingControl({ maplibre: fakeMaplibre, theme: 'dark' });
    expect(controlDark._resolveThemeClass()).toBe('routing-panel--theme-dark');

    const controlLight = new MapLibreRoutingControl({ maplibre: fakeMaplibre, theme: 'light' });
    expect(controlLight._resolveThemeClass()).toBe('routing-panel--theme-light');

    const controlAuto = new MapLibreRoutingControl({ maplibre: fakeMaplibre, theme: 'unknown' });
    expect(controlAuto._resolveThemeClass()).toBe('routing-panel--theme-auto');
  });

  it('reuses an existing marker when placing the same type twice', () => {
    const control = new MapLibreRoutingControl({ maplibre: fakeMaplibre });
    control._map = fakeMap;
    control._origin = [0, 0];

    control._placeMarker('origin', [0, 0]);
    const firstMarker = control._markers.origin;
    expect(firstMarker).toBeDefined();

    control._placeMarker('origin', [1, 1]);
    expect(control._markers.origin).toBe(firstMarker);
    expect(firstMarker.lngLat).toEqual([1, 1]);
  });

  it('does not set origin when map pointer suppression is active', () => {
    const control = new MapLibreRoutingControl({ maplibre: fakeMaplibre });
    control._suppressNextMapPointerSet = true;
    control._origin = null;

    control.setOriginFromMap({ lng: 10, lat: 20 });
    expect(control._origin).toBeNull();
  });

  it('sets tile JSON url, rejects invalid metadata, and updates status text on failure', async () => {
    const control = new MapLibreRoutingControl({ maplibre: fakeMaplibre });
    control._statusEl = createElementStub();
    control._text = { status: { tileMetadata: 'Tile error', tileUrl: 'Missing tile url' } };
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' }));

    control.setTileJsonUrl('https://example.com/tiles.json');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(global.fetch).toHaveBeenCalledWith('https://example.com/tiles.json');
    expect(control._statusEl.className).toContain('error');
    expect(control._statusEl.hidden).toBe(false);
  });

  it('loads tile template promise and rejects on invalid tiles array', async () => {
    const control = new MapLibreRoutingControl({ maplibre: fakeMaplibre });
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ tiles: [] }),
    }));
    control._tileJsonUrl = 'https://example.com/bad.json';

    await expect(control._loadTileTemplate()).rejects.toThrow('Tile metadata response does not contain a valid tiles array.');
  });

  it('handles additional route failure reasons and clears route/graph', () => {
    const control = new MapLibreRoutingControl({ maplibre: fakeMaplibre });
    control._statusEl = createElementStub();
    control._map = fakeMap;
    fakeMap.sources.set(control._options.routeSourceId, routeSource);
    fakeMap.sources.set(control._options.graphSourceId, graphSource);

    control._handleRouteFailure({ reason: RouteFailureReason.POOR_SNAP });
    expect(control._statusEl.textContent).toBe(control._text.status?.poorSnap || '');

    control._handleRouteFailure({ reason: RouteFailureReason.NO_NODE });
    expect(control._statusEl.textContent).toBe(control._text.status?.noNode || '');
  });

  it('shows stats when all panel elements are available', () => {
    const control = new MapLibreRoutingControl({ maplibre: fakeMaplibre });
    const element = createElementStub();
    control._statsEl = element;
    control._statDistEl = element;
    control._statTimeEl = element;
    control._statDistLabelEl = element;
    control._statTimeLabelEl = element;
    control._engineBadgeEl = element;
    control._costField = 'distance';
    control._mode = 'car';
    control._text = {
      stats: { distance: 'Distance', estTime: 'Time' },
      costLabels: { distance: 'km' },
    };

    control._showStats({ costField: 'distance', cost: 1234, coordinates: [[0, 0], [0, 0]], engine: 'cpu', parallelUsed: false });

    expect(control._statsEl.hidden).toBe(false);
    expect(control._engineBadgeEl.innerHTML).toContain('CPU');
  });

  it('sets waiting status when route source is not yet available during routing', async () => {
    const control = new MapLibreRoutingControl({ maplibre: fakeMaplibre });
    control._mounted = true;
    control._origin = [0, 0];
    control._dest = [1, 1];
    control._statusEl = createElementStub();
    control._originInput = createElementStub();
    control._destInput = createElementStub();
    control._routeSourceStyleLoadHandler = null;
    control._urlTemplate = 'http://example.com/{z}/{x}/{y}.pbf';
    control._panel = createElementStub();

    const delayedMap = {
      ...fakeMap,
      isStyleLoaded: () => false,
      once: (event, cb) => {
        if (event === 'load') {
          // do not invoke callback to simulate a still-loading style
        }
      },
      getSource: () => null,
    };

    control._map = delayedMap;
    await control._tryRoute();

    expect(control._statusEl.className).toContain('loading');
  });

  it('calculates isoline and writes GeoJSON to isoline source', async () => {
    const routeFunction = vi.fn(async () => ({
      found: true,
      graph: {
        nodes: new Map([[0, { coords: [0, 0] }]]),
        edges: [],
      },
    }));

    const control = new MapLibreRoutingControl({ maplibre: fakeMaplibre, routeFunction });
    control._mounted = true;
    control._map = fakeMap;
    fakeMap.sources.set(control._options.isolineSourceId, { setData: vi.fn() });
    control._isoline.point = [0, 0];
    control._urlTemplate = 'http://example.com/{z}/{x}/{y}.pbf';

    await control._tryIsoline();

    expect(routeFunction).toHaveBeenCalled();
    const src = fakeMap.getSource(control._options.isolineSourceId);
    expect(src.setData).toHaveBeenCalled();
  });

  it('places isoline marker and triggers recalculation on dragend', async () => {
    const routeFunction = vi.fn(async () => ({
      found: true,
      graph: {
        nodes: new Map([[0, { coords: [0, 0] }]]),
        edges: [],
      },
    }));

    const control = new MapLibreRoutingControl({ maplibre: fakeMaplibre, routeFunction });
    control._mounted = true;
    control._map = fakeMap;
    fakeMap.sources.set(control._options.isolineSourceId, { setData: vi.fn() });
    control._isoline.direction = 'from';
    control._urlTemplate = 'http://example.com/{z}/{x}/{y}.pbf';

    control._placeIsolineMarker([1, 2]);
    const marker = control._markers.isoline;
    expect(marker).toBeDefined();

    // Simulate dragend event
    marker.listeners['dragend'] && marker.listeners['dragend']();

    // Route function should have been invoked by _tryIsoline
    expect(routeFunction).toHaveBeenCalled();
  });
});
