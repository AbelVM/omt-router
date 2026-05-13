import { buildTileURL as _buildTileURL } from '../index.js';

export function setupRouteSource(ctrl) {
  if (!ctrl._map) return;
  if (ctrl._map.getSource(ctrl._options.routeSourceId)) return;

  ctrl._routeSourceStyleLoadHandler = () => {
    if (!ctrl._mounted || !ctrl._map) return;
    if (ctrl._map.getSource(ctrl._options.routeSourceId)) return;

    ctrl._map.addSource(ctrl._options.routeSourceId, {
      type: 'geojson',
      lineMetrics: true,
      data: { type: 'FeatureCollection', features: [] },
    });
    ctrl._map.addLayer({
      id: ctrl._options.routeCasingLayerId,
      type: 'line',
      source: ctrl._options.routeSourceId,
      paint: {
        'line-color': '#ffffff',
        'line-width': 10,
        'line-opacity': 0.5,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });
    if (ctrl._options.showGraph) {
      ctrl._map.addSource(ctrl._options.graphSourceId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      ctrl._map.addLayer({
        id: ctrl._options.graphLayerId,
        type: 'line',
        source: ctrl._options.graphSourceId,
        paint: {
          'line-color': '#00ff00',
          'line-width': 2,
          'line-opacity': 0.9,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    }

    ctrl._map.addLayer({
      id: ctrl._options.routeLayerId,
      type: 'line',
      source: ctrl._options.routeSourceId,
      paint: {
        'line-color': ctrl._options.startColor,
        'line-gradient': [
          'interpolate-hcl',
          ['linear'],
          ['line-progress'],
          0,
          ctrl._options.startColor,
          1,
          ctrl._options.endColor,
        ],
        'line-width': 4,
        'line-opacity': 0.9,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });

    // Isoline source and layers
    if (!ctrl._map.getSource(ctrl._options.isolineSourceId)) {
      ctrl._map.addSource(ctrl._options.isolineSourceId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      const initialIsolineColor = ctrl._isoline && ctrl._isoline.direction === 'from'
        ? ctrl._options.startColor
        : ctrl._options.endColor;

      ctrl._map.addLayer({
        id: ctrl._options.isolineFillLayerId,
        type: 'fill',
        source: ctrl._options.isolineSourceId,
        paint: {
          'fill-color': initialIsolineColor,
          'fill-outline-color': initialIsolineColor,
          'fill-opacity': 0.4,
        },
        layout: {
          'fill-sort-key': ['-', ['get', 'valueMax']],
        },
      });

      // Symbol layer to render value labels along the fill geometry.
      ctrl._map.addLayer({
        id: ctrl._options.isolineOutlineLayerId,
        type: 'symbol',
        source: ctrl._options.isolineSourceId,
        layout: {
          'symbol-placement': 'point',
          'text-field': ['to-string', ['get', 'valueMax']],
          'text-font': ['Open Sans Regular'],
          'text-size': 12,
        },
        paint: {
          'text-color': ctrl._options.startColor,
          'text-halo-color': '#ffffff',
          'text-halo-width': 1,
        },
      });
    }

    if (ctrl._origin && ctrl._dest) {
      ctrl._tryRoute?.();
    }
  };

  if (ctrl._map.isStyleLoaded()) {
    ctrl._routeSourceStyleLoadHandler();
  } else {
    ctrl._map.once('load', ctrl._routeSourceStyleLoadHandler);
  }
}

export function removeRouteLayers(ctrl) {
  for (const id of [
    ctrl._options.routeLayerId,
    ctrl._options.routeCasingLayerId,
    ctrl._options.graphLayerId,
    ctrl._options.isolineOutlineLayerId,
    ctrl._options.isolineFillLayerId,
  ]) {
    if (ctrl._map.getLayer(id)) {
      ctrl._map.removeLayer(id);
    }
  }
  for (const id of [ctrl._options.routeSourceId, ctrl._options.graphSourceId, ctrl._options.isolineSourceId]) {
    if (ctrl._map.getSource(id)) {
      ctrl._map.removeSource(id);
    }
  }
}

export function placeMarker(ctrl, type, lngLat) {
  if (ctrl._markers[type]) {
    ctrl._markers[type].setLngLat(lngLat);
    return;
  }

  const dot = document.createElement('div');
  dot.className = `rp-map-dot rp-map-dot--${type}`;
  dot.style.backgroundColor = type === 'origin' ? ctrl._options.startColor : ctrl._options.endColor;
  const marker = new ctrl._maplibre.Marker({ element: dot, draggable: true })
    .setLngLat(lngLat)
    .addTo(ctrl._map);

  ctrl._markers[type] = marker;

  marker.on('dragstart', () => {
    ctrl._suppressNextMapPointerSet = true;
    dot.classList.add('is-dragging');
  });

  marker.on('dragend', () => {
    if (dot.classList && typeof dot.classList.remove === 'function') {
      dot.classList.remove('is-dragging');
    }
    const ll = marker.getLngLat();
    const next = [ll.lng, ll.lat];
    if (type === 'origin') {
      ctrl._origin = next;
      if (ctrl._originInput) ctrl._originInput.value = `${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`;
    } else {
      ctrl._dest = next;
      if (ctrl._destInput) ctrl._destInput.value = `${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`;
    }
    ctrl._tryRoute?.();
  });
}

export function placeIsolineMarker(ctrl, lngLat) {
  const coords = [lngLat[0], lngLat[1]];
  const color = ctrl._isoline.direction === 'from' ? ctrl._options.startColor : ctrl._options.endColor;

  if (ctrl._markers.isoline) {
    ctrl._markers.isoline.setLngLat(coords);
    try {
      const el = ctrl._markers.isoline.getElement();
      if (el && el.style) el.style.background = color;
      try {
        const svg = ctrl._panel.querySelector('#rp-isoline-panel .rp-point-icon');
        if (svg && svg.classList) {
          svg.classList.toggle('rp-point-icon--origin', ctrl._isoline.direction === 'from');
          svg.classList.toggle('rp-point-icon--dest', ctrl._isoline.direction === 'to');
        }
      } catch (_e) { void _e; }
    } catch (_e) { void _e; }
    return;
  }

  const dot = document.createElement('div');
  dot.className = 'rp-map-dot';
  dot.style.background = color;
  const marker = new ctrl._maplibre.Marker({ element: dot, draggable: true }).setLngLat(coords).addTo(ctrl._map);
  ctrl._markers.isoline = marker;

  try {
    const svg = ctrl._panel.querySelector('#rp-isoline-panel .rp-point-icon');
    if (svg && svg.classList) {
      svg.classList.toggle('rp-point-icon--origin', ctrl._isoline.direction === 'from');
      svg.classList.toggle('rp-point-icon--dest', ctrl._isoline.direction === 'to');
    }
  } catch (_e) { void _e; }

  marker.on('dragstart', () => {
    ctrl._suppressNextMapPointerSet = true;
    dot.classList.add('is-dragging');
  });

  marker.on('dragend', () => {
    if (dot.classList && typeof dot.classList.remove === 'function') {
      dot.classList.remove('is-dragging');
    }
    const p = marker.getLngLat();
    ctrl._isoline.point = [p.lng, p.lat];
    if (ctrl._isolinePointInput) ctrl._isolinePointInput.value = `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
    try {
      ctrl._routeFunction([p.lng, p.lat], [p.lng, p.lat], ctrl._mode, ctrl._urlTemplate, {
        costField: ctrl._costField,
        includeGraph: true,
        maxAcceptableSnapDistanceM: ctrl._routeOptions.maxAcceptableSnapDistanceM,
        penalties: ctrl._routeOptions.penalties,
        tileUrlTransform: ctrl._tileUrlTransform,
        tileProxyTemplate: ctrl._tileProxyTemplate,
      });
    } catch (_e) { void _e; }
    ctrl._tryIsoline?.();
  });
}

export function clearIsoline(ctrl) {
  if (!ctrl._map) return;
  const src = ctrl._map.getSource(ctrl._options.isolineSourceId);
  if (src && typeof src.setData === 'function') {
    src.setData({ type: 'FeatureCollection', features: [] });
  }
  if (ctrl._markers.isoline) {
    ctrl._markers.isoline.remove();
    ctrl._markers.isoline = null;
  }
}

export function clearRoute(ctrl) {
  if (!ctrl._map || !ctrl._map.getSource(ctrl._options.routeSourceId)) return;
  ctrl._map.getSource(ctrl._options.routeSourceId).setData({ type: 'FeatureCollection', features: [] });
}

export function clearGraph(ctrl) {
  if (!ctrl._map || !ctrl._map.getSource(ctrl._options.graphSourceId)) return;
  ctrl._map.getSource(ctrl._options.graphSourceId).setData({ type: 'FeatureCollection', features: [] });
}

export async function centerMapOnSource(ctrl, sourceId, fitOptions = { padding: 50, maxZoom: 16 }) {
  if (!ctrl._map || !sourceId) return;
  try {
    const src = ctrl._map.getSource(sourceId);
    const bounds = await src.getBounds();
    ctrl._map.fitBounds(bounds, fitOptions);
  } catch (_e) {
    console.warn(`Failed to center map on source ${sourceId}`, _e);
  }
}
