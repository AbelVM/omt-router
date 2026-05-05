import {
  route,
  getEngineWorkerStatus,
  onEngineWorkerStatusChange,
  cancelRunningEngine,
} from '../src/index.js';

let URL_TEMPLATE = null;

fetch('https://tiles.openfreemap.org/planet')
  .then(r => r.json())
  .then(meta => { URL_TEMPLATE = meta.tiles[0]; })
  .catch(err => console.error('[omt-router] Failed to fetch tile URL:', err));

// Average speeds used for travel-time estimates
const SPEEDS_KPH = { car: 50, pedestrian: 5, bicycle: 15 };
const ROUTE_TIMEOUT_MS = 20_000;

function fmtDistance(m) {
  if (m < 1000) return `${Math.round(m)}\u202fm`;
  return `${(m / 1000).toFixed(1)}\u202fkm`;
}

function fmtTime(m, mode) {
  const mins = Math.round((m / 1000 / SPEEDS_KPH[mode]) * 60);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${h} h ${rem} min` : `${h} h`;
}

function fmtDurationSeconds(seconds) {
  const mins = Math.round(seconds / 60);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${h} h ${rem} min` : `${h} h`;
}

function haversineMeters(a, b) {
  const toRad = deg => (deg * Math.PI) / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1Rad) * Math.cos(lat2Rad) * sinDLng * sinDLng;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

function getRouteDistance(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineMeters(coords[i - 1], coords[i]);
  }
  return total;
}

// Accept "lat, lng" from user; return [lng, lat] for MapLibre / route()
function parseCoords(str) {
  const [a, b] = str.split(',').map(s => parseFloat(s.trim()));
  if (isNaN(a) || isNaN(b)) return null;
  if (a < -90 || a > 90 || b < -180 || b > 180) return null;
  return [b, a];
}

// Convert a MapLibre LngLat object to a user-readable "lat, lng" string
function lngLatToStr({ lng, lat }) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function formatEngineBadgeName(engineId) {
  switch (engineId) {
    case 'ultra-dijkstra':
      return 'UltraDijkstra';
    case 'bidirectional-astar':
      return 'Bidirectional A★';
    case 'adaptive-barrier':
      return 'Adaptive Barrier';
    case 'delta-stepping':
      return 'Delta Stepping';
    case 'cpu':
      return 'CPU';
    default:
      return engineId;
  }
}

function getEngineBadgeIcon(parallelUsed) {
  if (parallelUsed) {
    return '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="m4.9 4.9 2.2 2.2"/><path d="m16.9 16.9 2.2 2.2"/><path d="m16.9 7.1 2.2-2.2"/><path d="m4.9 19.1 2.2-2.2"/></svg>';
  }

  return '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1"/><path d="M10 7V4M14 7V4M10 20v-3M14 20v-3M7 10H4M7 14H4M20 10h-3M20 14h-3"/></svg>';
}

// ── RoutingControl ──────────────────────────────────────────────────────────

class RoutingControl {
  constructor() {
    this._origin = null;   // [lng, lat]
    this._dest   = null;   // [lng, lat]
    this._mode   = 'car';
    this._costField = 'distance';
    this._map    = null;
    this._el     = null;
    this._markers = { origin: null, dest: null };
    this._calcId  = 0;     // incremented on each new calculation to discard stale results
    this._suppressNextMapPointerSet = false;
    this._engineBusy = false;
    this._pendingRecalc = false;
    this._unsubscribeEngineStatus = null;
  }

  onAdd(map) {
    this._map = map;

    const el = document.createElement('div');
    el.className = 'routing-panel';
    el.innerHTML = `
      <span class="rp-title">Route Planner</span>

      <div class="rp-modes">
        <button class="rp-mode-btn" data-mode="pedestrian" title="Walking">
          <span class="rp-mode-icon">🚶</span>
          <span class="rp-mode-label">Walk</span>
        </button>
        <button class="rp-mode-btn active" data-mode="car" title="Driving">
          <span class="rp-mode-icon">🚗</span>
          <span class="rp-mode-label">Car</span>
        </button>
        <button class="rp-mode-btn" data-mode="bicycle" title="Cycling">
          <span class="rp-mode-icon">🚲</span>
          <span class="rp-mode-label">Bike</span>
        </button>
      </div>

      <div class="rp-section">
        <span class="rp-section-label">Optimize for</span>
        <div class="rp-costs">
          <button class="rp-cost-btn active" data-cost-field="distance" title="Shortest route">
            Shortest
          </button>
          <button class="rp-cost-btn" data-cost-field="travelTime" title="Fastest route">
            Fastest
          </button>
        </div>
      </div>

      <div class="rp-inputs">
        <div class="rp-input-row">
          <svg class="rp-point-icon rp-point-icon--origin" viewBox="0 0 10 10">
            <circle cx="5" cy="5" r="4.5"/>
          </svg>
          <input id="rp-origin" type="text" placeholder="Origin (lat, lng)"
            autocomplete="off" spellcheck="false" />
        </div>
        <div class="rp-swap-wrap">
          <button type="button" class="rp-swap-btn" id="rp-swap-btn" title="Reverse route direction" aria-label="Reverse route direction">
            ⇅
          </button>
        </div>
        <div class="rp-input-row">
          <svg class="rp-point-icon rp-point-icon--dest" viewBox="0 0 10 10">
            <circle cx="5" cy="5" r="4.5"/>
          </svg>
          <input id="rp-dest" type="text" placeholder="Destination (lat, lng)"
            autocomplete="off" spellcheck="false" />
        </div>
      </div>

      <div class="rp-hint">
        <span class="rp-hint-item">
          <span class="rp-hint-key">Left-click</span> set origin
        </span>
        <span class="rp-hint-sep">·</span>
        <span class="rp-hint-item">
          <span class="rp-hint-key">Right-click</span> set destination
        </span>
      </div>

      <div class="rp-stats" id="rp-stats" hidden>
        <div class="rp-stat">
          <span class="rp-stat-value" id="rp-stat-dist">—</span>
          <span class="rp-stat-label" id="rp-stat-dist-label">Distance</span>
        </div>
        <div class="rp-stat-divider"></div>
        <div class="rp-stat">
          <span class="rp-stat-value" id="rp-stat-time">—</span>
          <span class="rp-stat-label" id="rp-stat-time-label">Est. time</span>
        </div>
      </div>

      <div class="rp-engine" id="rp-engine" hidden></div>

      <div class="rp-status" id="rp-status" hidden></div>
    `;

    this._el = el;
    this._engineBusy = Boolean(getEngineWorkerStatus().running);
    this._unsubscribeEngineStatus = onEngineWorkerStatusChange((status) => {
      this._engineBusy = Boolean(status.running);
      if (!status.running && this._pendingRecalc) {
        this._pendingRecalc = false;
        this._tryRoute();
      }
    });

    // Mode buttons
    el.querySelectorAll('.rp-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._mode = btn.dataset.mode;
        el.querySelectorAll('.rp-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
        this._tryRoute();
      });
    });

    el.querySelectorAll('.rp-cost-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._costField = btn.dataset.costField;
        el.querySelectorAll('.rp-cost-btn').forEach(b => b.classList.toggle('active', b === btn));
        this._tryRoute();
      });
    });

    // Coordinate inputs — fire on Enter or blur
    const originInput = el.querySelector('#rp-origin');
    const destInput   = el.querySelector('#rp-dest');

    originInput.addEventListener('change', () => {
      const c = parseCoords(originInput.value);
      if (c) { this._origin = c; this._placeMarker('origin', c); this._tryRoute(); }
    });

    destInput.addEventListener('change', () => {
      const c = parseCoords(destInput.value);
      if (c) { this._dest = c; this._placeMarker('dest', c); this._tryRoute(); }
    });

    el.querySelector('#rp-swap-btn').addEventListener('click', () => {
      this._reverseRoute();
    });

    // Prevent panel interactions from bleeding through to the map
    el.addEventListener('mousedown', e => e.stopPropagation());
    el.addEventListener('wheel',     e => e.stopPropagation());
    el.addEventListener('contextmenu', e => e.stopPropagation());

    return el;
  }

  onRemove() {
    this._unsubscribeEngineStatus?.();
    this._unsubscribeEngineStatus = null;
    if (this._engineBusy) cancelRunningEngine('panel_removed');
    Object.values(this._markers).forEach(m => m?.remove());
    this._el?.remove();
    this._map = null;
  }

  // Called by the map click handlers
  setOrigin(lngLat) {
    this._origin = [lngLat.lng, lngLat.lat];
    this._el.querySelector('#rp-origin').value = lngLatToStr(lngLat);
    this._placeMarker('origin', this._origin);
    this._tryRoute();
  }

  setDest(lngLat) {
    this._dest = [lngLat.lng, lngLat.lat];
    this._el.querySelector('#rp-dest').value = lngLatToStr(lngLat);
    this._placeMarker('dest', this._dest);
    this._tryRoute();
  }

  setOriginFromMap(lngLat) {
    if (this._consumeMapPointerSuppression()) return;
    this.setOrigin(lngLat);
  }

  setDestFromMap(lngLat) {
    if (this._consumeMapPointerSuppression()) return;
    this.setDest(lngLat);
  }

  // ── private helpers ───────────────────────────────────────

  _placeMarker(type, lngLat) {
    if (this._markers[type]) {
      this._markers[type].setLngLat(lngLat);
      return;
    }

    const dot = document.createElement('div');
    dot.className = `rp-map-dot rp-map-dot--${type}`;
    const marker = new maplibregl.Marker({ element: dot, draggable: true })
      .setLngLat(lngLat)
      .addTo(this._map);

    marker.on('dragstart', () => {
      // Ignore the map click/contextmenu event that fires on pointer release.
      this._suppressNextMapPointerSet = true;
      dot.classList.add('is-dragging');
    });

    marker.on('dragend', () => {
      dot.classList.remove('is-dragging');
      const ll = marker.getLngLat();
      const next = [ll.lng, ll.lat];
      if (type === 'origin') {
        this._origin = next;
        this._el.querySelector('#rp-origin').value = lngLatToStr(ll);
      } else {
        this._dest = next;
        this._el.querySelector('#rp-dest').value = lngLatToStr(ll);
      }
      this._tryRoute();
    });

    this._markers[type] = marker;
  }

  _consumeMapPointerSuppression() {
    if (!this._suppressNextMapPointerSet) return false;
    this._suppressNextMapPointerSet = false;
    return true;
  }

  _reverseRoute() {
    if (!this._origin && !this._dest) return;

    const oldOrigin = this._origin;
    this._origin = this._dest;
    this._dest = oldOrigin;

    const originInput = this._el.querySelector('#rp-origin');
    const destInput = this._el.querySelector('#rp-dest');
    originInput.value = this._origin ? `${this._origin[1].toFixed(6)}, ${this._origin[0].toFixed(6)}` : '';
    destInput.value = this._dest ? `${this._dest[1].toFixed(6)}, ${this._dest[0].toFixed(6)}` : '';

    if (this._origin) {
      this._placeMarker('origin', this._origin);
    } else {
      this._markers.origin?.remove();
      this._markers.origin = null;
    }

    if (this._dest) {
      this._placeMarker('dest', this._dest);
    } else {
      this._markers.dest?.remove();
      this._markers.dest = null;
    }

    this._tryRoute();
  }

  _setStatus(html, cls = '') {
    const el = this._el.querySelector('#rp-status');
    el.className = `rp-status${cls ? ' ' + cls : ''}`;
    el.innerHTML = html;
    el.hidden = !html;
  }

  _showStats(result) {
    const distanceM = this._costField === 'distance'
      ? result.cost
      : getRouteDistance(result.coordinates);
    const timeText = this._costField === 'travelTime'
      ? fmtDurationSeconds(result.cost)
      : fmtTime(distanceM, this._mode);
    const engine = result.engine ?? 'cpu';
    const parallelUsed = Boolean(result.parallelUsed);

    this._el.querySelector('#rp-stat-dist').textContent = fmtDistance(distanceM);
    this._el.querySelector('#rp-stat-time').textContent = timeText;
    this._el.querySelector('#rp-stat-dist-label').textContent = 'Distance';
    this._el.querySelector('#rp-stat-time-label').textContent =
      this._costField === 'travelTime' ? 'Travel time' : 'Est. time';
    this._el.querySelector('#rp-stats').hidden = false;
    const badge = this._el.querySelector('#rp-engine');
    badge.className = `rp-engine ${parallelUsed ? 'rp-engine--parallel' : 'rp-engine--cpu'}`;
    const costLabel = this._costField === 'travelTime' ? 'fastest' : 'shortest';
    const engineLabel = formatEngineBadgeName(engine);
    badge.innerHTML = `${getEngineBadgeIcon(parallelUsed)}${engineLabel} · ${costLabel}`;
    badge.hidden = false;
  }

  _hideStats() {
    this._el.querySelector('#rp-stats').hidden = true;
    this._el.querySelector('#rp-engine').hidden = true;
  }

  _clearRoute() {
    this._map.getSource('route-source')?.setData({ type: 'FeatureCollection', features: [] });
  }

  async _tryRoute() {
    if (!this._origin || !this._dest) return;
      if (!URL_TEMPLATE) {
        this._setStatus('Tile URL not yet loaded. Please wait a moment and try again.', 'error');
        this._clearRoute();
        return;
      }

    if (this._engineBusy) {
      this._pendingRecalc = true;
      this._setStatus('Routing engine is busy. Waiting for the current route to finish…', 'loading');
      return;
    }

    const id = ++this._calcId;   // invalidates any previous in-flight call
    this._hideStats();
    this._setStatus('<span class="rp-spinner"></span>Calculating route…', 'loading');

    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      cancelRunningEngine(`timeout_${ROUTE_TIMEOUT_MS}ms`);
    }, ROUTE_TIMEOUT_MS);

    try {
      const result = await route(this._origin, this._dest, this._mode, URL_TEMPLATE, {
        costField: this._costField,
        maxAutoRadius: 8,
        maxAcceptableSnapDistanceM: 60,
      });
      if (id !== this._calcId) return; // stale — a newer call is already running

      if (!result.found || !result.coordinates?.length) {
          if (result.reason === 'tile_cors') {
            this._setStatus('Tile request blocked. Check that your tile server allows requests from this origin.', 'error');
          } else if (result.reason === 'poor_snap') {
          this._setStatus('Route incomplete near one endpoint. Try placing points closer to roads.', 'error');
        } else if (result.reason === 'incomplete_path') {
          this._setStatus('Routing engine returned an incomplete path. Retrying with a broader corridor may help.', 'error');
        } else {
          this._setStatus('No route found between these points.', 'error');
        }
        this._clearRoute();
        return;
      }

      // Draw route
      this._map.getSource('route-source')?.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: result.coordinates },
        properties: {},
      });

      // Fit map to the route extent
      const coords = result.coordinates;
      if (coords.length > 1) {
        const bounds = coords.reduce(
          (b, c) => b.extend(c),
          new maplibregl.LngLatBounds(coords[0], coords[0])
        );
        this._map.fitBounds(bounds, { padding: 100, maxZoom: 16, duration: 600 });
      }

      this._showStats(result);
      this._setStatus('');

    } catch (err) {
      if (id !== this._calcId) return;
      console.error('[omt-router] routing error:', err);
      if (err?.code === 'engine_cancelled') {
        this._setStatus(
          timedOut
            ? 'Routing timed out and was cancelled. Try a shorter route or retry.'
            : 'Routing was cancelled.',
          'error',
        );
      } else {
        this._setStatus('Routing error — check the console for details.', 'error');
      }
      this._clearRoute();
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

// ── Map ─────────────────────────────────────────────────────────────────────

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/bright',//'./style.json',
  center: [-3.7038, 40.4168],
  zoom: 14,
  minZoom: 10,
});

window._map=map;

const ctrl = new RoutingControl();
map.addControl(ctrl, 'top-left');
map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

// Left-click → origin  |  Right-click → destination
map.on('click', e => ctrl.setOriginFromMap(e.lngLat));
map.on('contextmenu', e => {
  e.originalEvent.preventDefault();
  ctrl.setDestFromMap(e.lngLat);
});

map.on('load', () => {
  map.addSource('route-source', {
    type: 'geojson',
    lineMetrics: true,
    data: { type: 'FeatureCollection', features: [] },
  });

   // Soft shadow casing behind the route line
  map.addLayer({
    id: 'route-casing',
    type: 'line',
    source: 'route-source',
    paint: {
      'line-color': '#ffffff',
      'line-width': 10,
      'line-opacity': 0.5,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  }); 

  // Gradient route line
  map.addLayer({
    id: 'route',
    type: 'line',
    source: 'route-source',
    paint: {
      'line-gradient': [
        'interpolate', ['linear'], ['line-progress'],
        0,   '#2563eb',
        0.5, '#7c3aed',
        1,   '#dc2626',
      ],
      'line-width': 4,
      'line-opacity': 0.9,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });
});

