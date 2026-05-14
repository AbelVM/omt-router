import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapLibreRoutingControl, parseCoords } from '../src/ui/MapLibreRoutingControl.js';
import * as IndexModule from '../src/index.js';
import * as UI from '../src/ui/MapLibreRoutingControl.ui.js';
import * as MapModule from '../src/ui/MapLibreRoutingControl.map.js';
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

function createElementStub({ selectorMap = {}, querySelectorAllMap = {}, id = '' } = {}) {
  const listeners = {};
  const element = {
    id,
    className: '',
    hidden: false,
    innerHTML: '',
    textContent: '',
    value: '',
    dataset: {},
    style: {},
    listeners,
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
      toggle: vi.fn(),
    },
    attributes: {},
    addEventListener(event, callback) {
      listeners[event] = callback;
    },
    removeEventListener(event) {
      delete listeners[event];
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    querySelector(selector) {
      return selectorMap[selector] ?? null;
    },
    querySelectorAll(selector) {
      return querySelectorAllMap[selector] ?? [];
    },
    getElement() {
      return element;
    },
    remove: vi.fn(),
  };
  return element;
}

function createDocumentStub(panelStub = null) {
  return {
    createElement: () => panelStub || createElementStub(),
  };
}

function createPanelStub() {
  const modeBtnA = createElementStub({ id: 'mode-car' });
  const modeBtnB = createElementStub({ id: 'mode-bike' });
  modeBtnA.dataset.mode = 'car';
  modeBtnB.dataset.mode = 'bike';

  const costBtnA = createElementStub({ id: 'cost-distance' });
  const costBtnB = createElementStub({ id: 'cost-travelTime' });
  costBtnA.dataset.costField = 'distance';
  costBtnB.dataset.costField = 'travelTime';

  const isoDirBtnFrom = createElementStub({ id: 'iso-dir-from' });
  const isoDirBtnTo = createElementStub({ id: 'iso-dir-to' });
  isoDirBtnFrom.dataset.direction = 'from';
  isoDirBtnTo.dataset.direction = 'to';

  const isoModeBtnA = createElementStub({ id: 'iso-mode-car' });
  const isoModeBtnB = createElementStub({ id: 'iso-mode-bike' });
  isoModeBtnA.dataset.mode = 'car';
  isoModeBtnB.dataset.mode = 'bike';

  const isoCostBtnA = createElementStub({ id: 'iso-cost-distance' });
  const isoCostBtnB = createElementStub({ id: 'iso-cost-travelTime' });
  isoCostBtnA.dataset.costField = 'distance';
  isoCostBtnB.dataset.costField = 'travelTime';

  const originInput = createElementStub({ id: 'rp-origin' });
  const destInput = createElementStub({ id: 'rp-dest' });
  const statusEl = createElementStub({ id: 'rp-status' });
  const statusElIsoline = createElementStub({ id: 'rp-status-isoline' });
  const swapBtn = createElementStub({ id: 'rp-swap-btn' });
  const tabRoutingBtn = createElementStub({ id: 'rp-tab-routing' });
  const tabIsolineBtn = createElementStub({ id: 'rp-tab-isoline' });
  const isoPoint = createElementStub({ id: 'rp-isoline-point' });
  const isoThreshold = createElementStub({ id: 'rp-isoline-threshold' });
  const pointIcon = createElementStub({ id: 'rp-point-icon' });
  pointIcon.classList = { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() };

  const routePanel = createElementStub({ querySelectorAllMap: {
    '.rp-mode-btn': [modeBtnA, modeBtnB],
    '.rp-cost-btn': [costBtnA, costBtnB],
  }});
  const isoPanel = createElementStub({ selectorMap: {
    '#rp-isoline-threshold': isoThreshold,
  }, querySelectorAllMap: {
    '.rp-mode-btn': [isoModeBtnA, isoModeBtnB],
    '.rp-cost-btn': [isoCostBtnA, isoCostBtnB],
  }});

  const panel = createElementStub({ selectorMap: {
    '#rp-routing-panel': routePanel,
    '#rp-isoline-panel': isoPanel,
    '#rp-origin': originInput,
    '#rp-dest': destInput,
    '#rp-status': statusEl,
    '#rp-status-isoline': statusElIsoline,
    '#rp-swap-btn': swapBtn,
    '#rp-tab-routing': tabRoutingBtn,
    '#rp-tab-isoline': tabIsolineBtn,
    '#rp-isoline-point': isoPoint,
    '#rp-isoline-threshold': isoThreshold,
    '#rp-isoline-panel .rp-point-icon': pointIcon,
  }, querySelectorAllMap: {
    '.rp-isoline-direction-btn': [isoDirBtnFrom, isoDirBtnTo],
  }});

  return {
    panel,
    routePanel,
    isoPanel,
    modeBtnA,
    modeBtnB,
    costBtnA,
    costBtnB,
    originInput,
    destInput,
    statusEl,
    statusElIsoline,
    swapBtn,
    tabRoutingBtn,
    tabIsolineBtn,
    isoPoint,
    isoThreshold,
    pointIcon,
    isoDirBtnFrom,
    isoDirBtnTo,
    isoModeBtnA,
    isoModeBtnB,
    isoCostBtnA,
    isoCostBtnB,
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
        this.sources.set(id, { ...source, setData: vi.fn(), getBounds: vi.fn(() => new LngLatBoundsStub([0, 0], [1, 1])) });
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

  it('uses window.maplibregl when no maplibre option is passed', () => {
    const originalWindow = global.window;
    global.window = { maplibregl: fakeMaplibre };

    const control = new MapLibreRoutingControl({ language: 'en' });

    expect(control._maplibre).toBe(fakeMaplibre);

    if (originalWindow === undefined) {
      delete global.window;
    } else {
      global.window = originalWindow;
    }
  });

  it('shows a loading spinner when setting status with loading class', () => {
    const control = new MapLibreRoutingControl({ maplibre: fakeMaplibre });
    control._statusEl = createElementStub();
    control._statusElIsoline = createElementStub();
    control._activeTab = 'routing';

    control._setStatus('Waiting', 'loading');

    expect(control._statusEl.innerHTML).toContain('rp-spinner');
    expect(control._statusEl.innerHTML).toContain('Waiting');
  });

  it('binds panel routing controls and avoids recomputation for unchanged selections', () => {
    const control = new MapLibreRoutingControl({ maplibre: fakeMaplibre });
    const panelSet = createPanelStub();
    global.document = createDocumentStub(panelSet.panel);
    vi.spyOn(UI, 'syncModeAndCostUI').mockImplementation(() => {});
    vi.spyOn(UI, 'resetOtherUI').mockImplementation(() => {});
    control._panel = panelSet.panel;
    control._mode = 'car';
    control._costField = 'distance';
    control._activeTab = 'routing';
    control._originInput = panelSet.originInput;
    control._destInput = panelSet.destInput;
    control._tryRoute = vi.fn();
    control._placeMarker = vi.fn();
    control._reverseRoute = vi.fn();
    control._clearIsoline = vi.fn();
    control._clearRoute = vi.fn();

    control._bindPanelEvents();

    panelSet.modeBtnA.listeners.click();
    expect(control._tryRoute).not.toHaveBeenCalled();

    panelSet.modeBtnB.listeners.click();
    expect(control._tryRoute).toHaveBeenCalledTimes(1);

    panelSet.costBtnA.listeners.click();
    expect(control._tryRoute).toHaveBeenCalledTimes(1);

    panelSet.costBtnB.listeners.click();
    expect(control._tryRoute).toHaveBeenCalledTimes(2);

    panelSet.originInput.value = 'bad, input';
    panelSet.originInput.listeners.change();
    expect(control._placeMarker).toHaveBeenCalledTimes(0);

    panelSet.originInput.value = '12.34, 56.78';
    panelSet.originInput.listeners.change();
    expect(control._placeMarker).toHaveBeenCalledTimes(1);
    expect(control._tryRoute).toHaveBeenCalledTimes(3);

    panelSet.destInput.value = '0, 0';
    panelSet.destInput.listeners.change();
    expect(control._placeMarker).toHaveBeenCalledTimes(2);
    expect(control._tryRoute).toHaveBeenCalledTimes(4);

    panelSet.swapBtn.listeners.click();
    expect(control._reverseRoute).toHaveBeenCalled();

    panelSet.tabIsolineBtn.listeners.click();
    expect(control._activeTab).toBe('isoline');
    expect(panelSet.routePanel.hidden).toBe(true);
    expect(panelSet.isoPanel.hidden).toBe(false);

    panelSet.tabRoutingBtn.listeners.click();
    expect(control._activeTab).toBe('routing');
    expect(panelSet.routePanel.hidden).toBe(false);
    expect(panelSet.isoPanel.hidden).toBe(true);
  });

  it('binds isoline controls and updates threshold, direction, and mode changes', () => {
    const control = new MapLibreRoutingControl({ maplibre: fakeMaplibre });
    const panelSet = createPanelStub();
    global.document = createDocumentStub(panelSet.panel);
    vi.spyOn(UI, 'syncModeAndCostUI').mockImplementation(() => {});
    control._panel = panelSet.panel;
    control._mode = 'car';
    control._costField = 'distance';
    control._isoline = { point: [0, 0], direction: 'from', maxCost: 100 };
    control._markers.isoline = { getElement: () => ({ style: {} }) };
    control._placeIsolineMarker = vi.fn();
    control._tryIsoline = vi.fn();
    control._isolinePointInput = panelSet.isoPoint;

    control._bindPanelEvents();

    panelSet.isoDirBtnFrom.listeners.click();
    expect(control._tryIsoline).not.toHaveBeenCalled();

    panelSet.isoDirBtnTo.listeners.click();
    expect(control._tryIsoline).toHaveBeenCalledTimes(1);

    panelSet.isoPoint.value = '10.00, 20.00';
    panelSet.isoPoint.listeners.change();
    expect(control._placeIsolineMarker).toHaveBeenCalled();
    expect(control._tryIsoline).toHaveBeenCalledTimes(2);

    control._tryIsoline = vi.fn();
    panelSet.isoModeBtnA.listeners.click();
    expect(control._tryIsoline).not.toHaveBeenCalled();

    panelSet.isoModeBtnB.listeners.click();
    expect(control._tryIsoline).toHaveBeenCalledTimes(1);

    control._tryIsoline = vi.fn();
    panelSet.isoCostBtnA.listeners.click();
    expect(control._tryIsoline).not.toHaveBeenCalled();

    panelSet.isoCostBtnB.listeners.click();
    expect(control._tryIsoline).toHaveBeenCalledTimes(1);

    control._tryIsoline = vi.fn();
    panelSet.isoThreshold.value = '-1';
    panelSet.isoThreshold.listeners.input();
    expect(control._tryIsoline).not.toHaveBeenCalled();

    control._costField = 'distance';
    panelSet.isoThreshold.value = '5';
    panelSet.isoThreshold.listeners.input();
    expect(control._isoline.maxCost).toBe(5);
    expect(control._tryIsoline).toHaveBeenCalledTimes(1);

    control._costField = 'travelTime';
    panelSet.isoThreshold.value = '2';
    panelSet.isoThreshold.listeners.input();
    expect(control._isoline.maxCost).toBe(120);
    expect(control._tryIsoline).toHaveBeenCalledTimes(2);
  });

  it('binds onAdd map click and contextmenu handlers and handles tile template failures', async () => {
    const tileError = new Error('tile fail');
    const cancelRunningEngine = vi.fn();
    const control = new MapLibreRoutingControl({
      maplibre: fakeMaplibre,
      getEngineWorkerStatus: () => ({ running: false }),
      onEngineWorkerStatusChange: (cb) => {
        cb({ running: false });
        return () => {};
      },
      cancelRunningEngine,
      panelClassName: 'foo bar',
      tileJsonUrl: 'https://example.com/tiles.json',
    });

    const panelSet = createPanelStub();
    panelSet.panel.classList.add = vi.fn();
    global.document = createDocumentStub(panelSet.panel);
    vi.spyOn(UI, 'syncModeAndCostUI').mockImplementation(() => {});
    vi.spyOn(MapModule, 'setupRouteSource').mockImplementation(() => {});
    control._buildPanelMarkup = vi.fn(() => '');
    control._loadTileTemplate = vi.fn(() => Promise.reject(tileError));
    control._setStatus = vi.fn();

    const panel = control.onAdd(fakeMap);

    expect(panel).toBe(panelSet.panel);
    expect(panelSet.panel.classList.add).toHaveBeenCalledWith('routing-panel--theme-light');
    expect(panelSet.panel.classList.add).toHaveBeenCalledWith('foo', 'bar');
    expect(fakeMap.eventHandlers.has('click')).toBe(true);
    expect(fakeMap.eventHandlers.has('contextmenu')).toBe(true);
    expect(control._unsubscribeEngineStatus).toBeTypeOf('function');
    expect(control._engineBusy).toBe(false);

    const clickHandler = fakeMap.eventHandlers.get('click');
    vi.spyOn(control, 'setOriginFromMap').mockImplementation(() => {});
    control._activeTab = 'routing';
    clickHandler({ lngLat: { lng: 1, lat: 2 } });
    expect(control.setOriginFromMap).toHaveBeenCalled();

    const contextHandler = fakeMap.eventHandlers.get('contextmenu');
    const originalEvent = { preventDefault: vi.fn() };
    control._suppressNextMapPointerSet = true;
    vi.spyOn(control, 'setDestFromMap').mockImplementation(() => {});
    contextHandler({ lngLat: { lng: 3, lat: 4 }, originalEvent });
    expect(originalEvent.preventDefault).toHaveBeenCalled();
    expect(control.setDestFromMap).not.toHaveBeenCalled();
    expect(control._suppressNextMapPointerSet).toBe(false);

    control._activeTab = 'isoline';
    contextHandler({ lngLat: { lng: 5, lat: 6 }, originalEvent });
    expect(control.setDestFromMap).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(control._loadTileTemplate).toHaveBeenCalled();
    expect(control._setStatus).toHaveBeenCalledWith(control._text.status.tileMetadata, 'error');

    control.onRemove();
    expect(fakeMap.eventHandlers.has('click')).toBe(false);
    expect(fakeMap.eventHandlers.has('contextmenu')).toBe(false);
  });

  it('calls shared dispose/shutdown when removed from the map', () => {
    const control = new MapLibreRoutingControl({
      maplibre: fakeMaplibre,
      routeFunction: async () => ({}),
      getEngineWorkerStatus: () => ({ running: false }),
      onEngineWorkerStatusChange: () => () => {},
    });
    vi.spyOn(IndexModule, 'dispose');

    control._panel = createElementStub();
    control._map = fakeMap;
    control._isolineWorker = null;

    control.onRemove();

    expect(IndexModule.dispose).toHaveBeenCalled();
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

  it('loads tile template and triggers routing retry when origin and destination are set', async () => {
    const control = new MapLibreRoutingControl({ maplibre: fakeMaplibre });
    const oldFetch = global.fetch;
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ tiles: ['https://example.com/{z}/{x}/{y}.pbf'] }),
    }));
    control._origin = [0, 0];
    control._dest = [1, 1];
    control._tryRoute = vi.fn();
    control._tileJsonUrl = 'https://example.com/tiles.json';

    await expect(control._loadTileTemplate()).resolves.toBe('https://example.com/{z}/{x}/{y}.pbf');
    expect(control._urlTemplate).toBe('https://example.com/{z}/{x}/{y}.pbf');
    expect(control._tryRoute).toHaveBeenCalled();
    global.fetch = oldFetch;
  });

  it('consumes map pointer suppression only once', () => {
    const control = new MapLibreRoutingControl({ maplibre: fakeMaplibre });
    control._suppressNextMapPointerSet = true;

    expect(control._consumeMapPointerSuppression()).toBe(true);
    expect(control._suppressNextMapPointerSet).toBe(false);
    expect(control._consumeMapPointerSuppression()).toBe(false);
  });

  it('sets status for the active isoline tab and clears the routing status', () => {
    const control = new MapLibreRoutingControl({ maplibre: fakeMaplibre });
    control._activeTab = 'isoline';
    control._statusEl = createElementStub();
    control._statusElIsoline = createElementStub();

    control._setStatus('Isoline error', 'error');

    expect(control._statusElIsoline.textContent).toBe('Isoline error');
    expect(control._statusElIsoline.className).toContain('error');
    expect(control._statusEl.hidden).toBe(true);
    expect(control._statusEl.textContent).toBe('');
  });

  it('reverses the route segment and triggers a reroute', () => {
    const control = new MapLibreRoutingControl({ maplibre: fakeMaplibre });
    control._origin = [1, 2];
    control._dest = [3, 4];
    control._originInput = createElementStub();
    control._destInput = createElementStub();
    control._placeMarker = vi.fn();
    control._tryRoute = vi.fn();

    control._reverseRoute();

    expect(control._origin).toEqual([3, 4]);
    expect(control._dest).toEqual([1, 2]);
    expect(control._placeMarker).toHaveBeenCalledTimes(2);
    expect(control._tryRoute).toHaveBeenCalled();
    expect(control._originInput.value).toContain('4.000000');
    expect(control._destInput.value).toContain('2.000000');
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
      once: (event, _cb) => {
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
    fakeMap.sources.set(control._options.isolineSourceId, {
      setData: vi.fn(),
      getBounds: vi.fn(() => new LngLatBoundsStub([0, 0], [1, 1])),
    });
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
    fakeMap.sources.set(control._options.isolineSourceId, {
      setData: vi.fn(),
      getBounds: vi.fn(() => new LngLatBoundsStub([0, 0], [1, 1])),
    });
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
