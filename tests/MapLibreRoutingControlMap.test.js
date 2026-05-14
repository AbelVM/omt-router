import { describe, expect, it, vi, beforeEach } from 'vitest';
import { setupRouteSource, removeRouteLayers, placeMarker, placeIsolineMarker, clearIsoline, centerMapOnSource } from '../src/ui/MapLibreRoutingControl.map.js';

function createElementStub() {
  return {
    className: '',
    style: {},
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
      toggle: vi.fn(),
    },
    querySelector: vi.fn(() => null),
  };
}

function createMarkerStub() {
  const marker = {
    setLngLat: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    on: vi.fn((event, cb) => {
      marker.listeners[event] = cb;
      return marker;
    }),
    getLngLat: vi.fn(() => ({ lng: 1, lat: 2 })),
    getElement: vi.fn(() => ({ style: {}, classList: { toggle: vi.fn() } })),
    remove: vi.fn(),
    listeners: {},
  };
  return marker;
}

describe('MapLibreRoutingControl.map helpers', () => {
  let map;

  beforeEach(() => {
    global.document = {
      createElement: () => ({ className: '', style: {}, classList: { add: vi.fn() } }),
    };

    map = {
      sources: new Map(),
      layers: new Set(),
      addSource: vi.fn((id, source) => map.sources.set(id, source)),
      addLayer: vi.fn((layer) => map.layers.add(layer.id)),
      getSource: vi.fn((id) => map.sources.get(id) || null),
      getLayer: vi.fn((id) => (map.layers.has(id) ? { id } : null)),
      removeLayer: vi.fn((id) => map.layers.delete(id)),
      removeSource: vi.fn((id) => map.sources.delete(id)),
      isStyleLoaded: () => true,
      once: vi.fn(),
      setPaintProperty: vi.fn(),
      setLayoutProperty: vi.fn(),
      fitBounds: vi.fn(),
    };
  });

  it('creates map sources and layers including graph when showGraph is enabled', () => {
    const ctrl = {
      _mounted: true,
      _map: map,
      _options: {
        routeSourceId: 'route-src',
        routeCasingLayerId: 'route-casing',
        routeLayerId: 'route-line',
        graphSourceId: 'graph-src',
        graphLayerId: 'graph-line',
        isolineSourceId: 'isoline-src',
        isolineFillLayerId: 'isoline-fill',
        isolineOutlineLayerId: 'isoline-outline',
        startColor: '#00f',
        endColor: '#f00',
        showGraph: true,
      },
      _isoline: { direction: 'from' },
      _origin: [0, 0],
      _dest: [1, 1],
      _tryRoute: vi.fn(),
    };

    setupRouteSource(ctrl);

    expect(map.addSource).toHaveBeenCalledWith('route-src', expect.any(Object));
    expect(map.addSource).toHaveBeenCalledWith('graph-src', expect.any(Object));
    expect(map.addSource).toHaveBeenCalledWith('isoline-src', expect.any(Object));
    expect(map.addLayer).toHaveBeenCalled();
    expect(map.layers.has('route-line')).toBe(true);
    expect(map.layers.has('graph-line')).toBe(true);
    expect(map.layers.has('isoline-fill')).toBe(true);
    expect(ctrl._tryRoute).toHaveBeenCalled();
  });

  it('removes existing route, graph, and isoline layers and sources', () => {
    map.layers.add('route-line');
    map.layers.add('route-casing');
    map.layers.add('graph-line');
    map.layers.add('isoline-fill');
    map.layers.add('isoline-outline');
    map.sources.set('route-src', {});
    map.sources.set('graph-src', {});
    map.sources.set('isoline-src', {});

    const ctrl = {
      _map: map,
      _options: {
        routeLayerId: 'route-line',
        routeCasingLayerId: 'route-casing',
        graphLayerId: 'graph-line',
        isolineFillLayerId: 'isoline-fill',
        isolineOutlineLayerId: 'isoline-outline',
        routeSourceId: 'route-src',
        graphSourceId: 'graph-src',
        isolineSourceId: 'isoline-src',
      },
    };

    removeRouteLayers(ctrl);

    expect(map.removeLayer).toHaveBeenCalledWith('route-line');
    expect(map.removeLayer).toHaveBeenCalledWith('graph-line');
    expect(map.removeSource).toHaveBeenCalledWith('graph-src');
    expect(map.getLayer('route-casing')).toBeNull();
  });

  it('places a new route marker and reuses existing marker on update', () => {
    const marker = createMarkerStub();
    const ctrl = {
      _map: map,
      _maplibre: { Marker: vi.fn(function () { return marker; }) },
      _markers: {},
      _options: { startColor: '#00f', endColor: '#f00' },
      _originInput: null,
      _destInput: null,
      _tryRoute: vi.fn(),
    };

    placeMarker(ctrl, 'origin', [10, 20]);
    expect(ctrl._markers.origin).toBe(marker);
    expect(marker.setLngLat).toHaveBeenCalledWith([10, 20]);

    placeMarker(ctrl, 'origin', [30, 40]);
    expect(marker.setLngLat).toHaveBeenCalledWith([30, 40]);
    expect(ctrl._markers.origin).toBe(marker);
  });

  it('updates existing isoline marker appearance and direction classes', () => {
    const marker = createMarkerStub();
    marker.getElement.mockReturnValue({ style: {}, classList: { toggle: vi.fn() } });
    const panel = {
      querySelector: vi.fn(() => ({ classList: { toggle: vi.fn() } })),
    };
    const ctrl = {
      _markers: { isoline: marker },
      _map: map,
      _panel: panel,
      _isoline: { direction: 'to' },
      _options: { startColor: '#00f', endColor: '#f00' },
    };

    placeIsolineMarker(ctrl, [2, 3]);

    expect(marker.setLngLat).toHaveBeenCalledWith([2, 3]);
    expect(panel.querySelector).toHaveBeenCalledWith('#rp-isoline-panel .rp-point-icon');
  });

  it('clears isoline geometry and removes the isoline marker when present', () => {
    const marker = createMarkerStub();
    const src = { setData: vi.fn() };
    map.sources.set('isoline-src', src);

    const ctrl = {
      _map: map,
      _markers: { isoline: marker },
      _options: { isolineSourceId: 'isoline-src' },
    };

    clearIsoline(ctrl);

    expect(src.setData).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [] });
    expect(marker.remove).toHaveBeenCalled();
    expect(ctrl._markers.isoline).toBeNull();
  });

  it('centers the map on a source bounds when available', async () => {
    const bounds = { north: 1, south: 0, east: 1, west: 0 };
    map.getSource = vi.fn(() => ({ getBounds: vi.fn(async () => bounds) }));
    const ctrl = { _map: map };

    await centerMapOnSource(ctrl, 'route-src', { padding: 10, maxZoom: 12 });

    expect(map.fitBounds).toHaveBeenCalledWith(bounds, { padding: 10, maxZoom: 12 });
  });
});
