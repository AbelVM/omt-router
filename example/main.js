import {
  route,
  getEngineWorkerStatus,
  onEngineWorkerStatusChange,
  cancelRunningEngine,
} from '../dist/omt-router.js';

const TILE_METADATA_URL = new URLSearchParams(window.location.search).get('tileMetadataUrl')
  || 'https://tiles.openfreemap.org/planet';
let URL_TEMPLATE = null;

const SPEEDS_KPH = Object.freeze({ car: 50, pedestrian: 5, bicycle: 15 });
const ROUTE_TIMEOUT_MS = 20_000;
const EARTH_RADIUS_METERS = 6_371_000;
const RAD = Math.PI / 180;
const ENGINE_LABELS = Object.freeze({
  'ultra-dijkstra': 'UltraDijkstra',
  'bidirectional-astar': 'Bidirectional A★',
  'adaptive-barrier': 'Adaptive Barrier',
  'delta-stepping': 'Delta Stepping',
  cpu: 'CPU',
});
const ENGINE_BADGE_ICONS = Object.freeze({
  parallel: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="m4.9 4.9 2.2 2.2"/><path d="m16.9 16.9 2.2 2.2"/><path d="m16.9 7.1 2.2-2.2"/><path d="m4.9 19.1 2.2-2.2"/></svg>',
  cpu: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1"/><path d="M10 7V4"/><path d="M14 7V4"/><path d="M10 20v-3"/><path d="M14 20v-3"/><path d="M7 10H4"/><path d="M7 14H4"/><path d="M20 10h-3"/><path d="M20 14h-3"/></svg>',
});
const COST_LABELS = Object.freeze({ distance: 'shortest', travelTime: 'fastest' });

fetch(TILE_METADATA_URL)
  .then((r) => {
    if (!r.ok) {
      throw new Error(`Tile metadata fetch failed: ${r.status} ${r.statusText}`);
    }
    return r.json();
  })
  .then((meta) => {
    if (!meta || !Array.isArray(meta.tiles) || meta.tiles.length === 0) {
      throw new Error('Tile metadata response does not include a valid `tiles` array.');
    }
    URL_TEMPLATE = meta.tiles[0];
  })
  .catch((err) => console.error('[omt-router] Failed to fetch tile URL:', err));

function formatDuration(minutes) {
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours} h ${remainder} min` : `${hours} h`;
}

function fmtDistance(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function fmtTime(m, mode) {
  const mins = Math.round((m / 1000 / SPEEDS_KPH[mode]) * 60);
  return formatDuration(mins);
}

function fmtDurationSeconds(seconds) {
  return formatDuration(Math.round(seconds / 60));
}

function haversineMeters(a, b) {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = (lat2 - lat1) * RAD;
  const dLng = (lng2 - lng1) * RAD;
  const lat1Rad = lat1 * RAD;
  const lat2Rad = lat2 * RAD;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1Rad) * Math.cos(lat2Rad) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
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
  return ENGINE_LABELS[engineId] || engineId;
}

function getEngineBadgeIcon(parallelUsed) {
  return parallelUsed ? ENGINE_BADGE_ICONS.parallel : ENGINE_BADGE_ICONS.cpu;
}

// ── RoutingControl ──────────────────────────────────────────────────────────

class RoutingControl {
  constructor() {
    this._origin = null;   // [lng, lat]
    this._dest = null;   // [lng, lat]
    this._mode = 'car';
    this._costField = 'distance';
    this._map = null;
    this._el = null;
    this._markers = { origin: null, dest: null };
    this._calcId = 0;     // incremented on each new calculation to discard stale results
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
    this._originInput = el.querySelector('#rp-origin');
    this._destInput = el.querySelector('#rp-dest');
    this._statusEl = el.querySelector('#rp-status');
    this._statsEl = el.querySelector('#rp-stats');
    this._statDistEl = el.querySelector('#rp-stat-dist');
    this._statTimeEl = el.querySelector('#rp-stat-time');
    this._statDistLabelEl = el.querySelector('#rp-stat-dist-label');
    this._statTimeLabelEl = el.querySelector('#rp-stat-time-label');
    this._engineBadgeEl = el.querySelector('#rp-engine');

    this._engineBusy = Boolean(getEngineWorkerStatus().running);
    this._unsubscribeEngineStatus = onEngineWorkerStatusChange((status) => {
      this._engineBusy = Boolean(status.running);
      if (!status.running && this._pendingRecalc) {
        this._pendingRecalc = false;
        this._tryRoute();
      }
    });

    // Mode buttons
    const modeButtons = el.querySelectorAll('.rp-mode-btn');
    modeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this._mode = btn.dataset.mode;
        modeButtons.forEach(b => b.classList.toggle('active', b === btn));
        this._tryRoute();
      });
    });

    const costButtons = el.querySelectorAll('.rp-cost-btn');
    costButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this._costField = btn.dataset.costField;
        costButtons.forEach(b => b.classList.toggle('active', b === btn));
        this._tryRoute();
      });
    });

    // Coordinate inputs — fire on Enter or blur
    this._originInput.addEventListener('change', () => {
      const coords = parseCoords(this._originInput.value);
      if (coords) {
        this._origin = coords;
        this._placeMarker('origin', coords);
        this._tryRoute();
      }
    });

    this._destInput.addEventListener('change', () => {
      const coords = parseCoords(this._destInput.value);
      if (coords) {
        this._dest = coords;
        this._placeMarker('dest', coords);
        this._tryRoute();
      }
    });

    el.querySelector('#rp-swap-btn').addEventListener('click', () => {
      this._reverseRoute();
    });

    // Prevent panel interactions from bleeding through to the map
    el.addEventListener('mousedown', e => e.stopPropagation());
    el.addEventListener('wheel', e => e.stopPropagation());
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
    this._originInput.value = lngLatToStr(lngLat);
    this._placeMarker('origin', this._origin);
    this._tryRoute();
  }

  setDest(lngLat) {
    this._dest = [lngLat.lng, lngLat.lat];
    this._destInput.value = lngLatToStr(lngLat);
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

    this._markers[type] = marker;

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
        this._originInput.value = lngLatToStr(ll);
      } else {
        this._dest = next;
        this._destInput.value = lngLatToStr(ll);
      }
      this._tryRoute();
    });
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

    this._originInput.value = this._origin ? `${this._origin[1].toFixed(6)}, ${this._origin[0].toFixed(6)}` : '';
    this._destInput.value = this._dest ? `${this._dest[1].toFixed(6)}, ${this._dest[0].toFixed(6)}` : '';

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
    this._statusEl.className = `rp-status${cls ? ' ' + cls : ''}`;
    this._statusEl.innerHTML = html;
    this._statusEl.hidden = !html;
  }

  _showStats(result) {
    const distanceM = result.costField === 'distance'
      ? result.cost
      : getRouteDistance(result.coordinates);
    const timeText = result.costField === 'travelTime'
      ? fmtDurationSeconds(result.cost)
      : fmtTime(distanceM, this._mode);
    const engine = result.engine ?? 'cpu';
    const parallelUsed = Boolean(result.parallelUsed);

    this._statDistEl.textContent = fmtDistance(distanceM);
    this._statTimeEl.textContent = timeText;
    this._statDistLabelEl.textContent = 'Distance';
    this._statTimeLabelEl.textContent =
      this._costField === 'travelTime' ? 'Travel time' : 'Est. time';
    this._statsEl.hidden = false;
    this._engineBadgeEl.className = `rp-engine ${parallelUsed ? 'rp-engine--parallel' : 'rp-engine--cpu'}`;
    const costLabel = COST_LABELS[this._costField] ?? 'shortest';
    const engineLabel = formatEngineBadgeName(engine);
    this._engineBadgeEl.innerHTML = `${getEngineBadgeIcon(parallelUsed)}${engineLabel} · ${costLabel}`;
    this._engineBadgeEl.hidden = false;
  }

  _hideStats() {
    this._statsEl.hidden = true;
    this._engineBadgeEl.hidden = true;
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
      const coords = result.coordinates;
      this._map.getSource('route-source')?.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      });

      if (coords.length > 0) {
        const snappedOrigin = coords[0];
        const snappedDest = coords[coords.length - 1];
        this._origin = snappedOrigin;
        this._dest = snappedDest;
        this._placeMarker('origin', snappedOrigin);
        this._placeMarker('dest', snappedDest);
        this._originInput.value = lngLatToStr({ lng: snappedOrigin[0], lat: snappedOrigin[1] });
        this._destInput.value = lngLatToStr({ lng: snappedDest[0], lat: snappedDest[1] });
      }

      // Fit map to the route extent
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
  style: 'https://tiles.openfreemap.org/styles/bright',
  center: [-3.7038, 40.4168],
  zoom: 14,
  minZoom: 10,
});

// map.showTileBoundaries = true;
// window._map = map;

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
        0, '#2563eb',
        0.5, '#7c3aed',
        1, '#dc2626',
      ],
      'line-width': 4,
      'line-opacity': 0.9,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });
});

