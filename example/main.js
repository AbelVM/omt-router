import { route } from '../dist/omt-router.js';

const URL_TEMPLATE =
  'https://api.maptiler.com/tiles/v3-openmaptiles/{z}/{x}/{y}.pbf?key=14pGsuZUnf0Y98AevmDA';

// Average speeds used for travel-time estimates
const SPEEDS_KPH = { car: 50, pedestrian: 5, bicycle: 15 };

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

// ── RoutingControl ──────────────────────────────────────────────────────────

class RoutingControl {
  constructor() {
    this._origin = null;   // [lng, lat]
    this._dest   = null;   // [lng, lat]
    this._mode   = 'car';
    this._map    = null;
    this._el     = null;
    this._markers = { origin: null, dest: null };
    this._calcId  = 0;     // incremented on each new calculation to discard stale results
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

      <div class="rp-inputs">
        <div class="rp-input-row">
          <svg class="rp-point-icon rp-point-icon--origin" viewBox="0 0 10 10">
            <circle cx="5" cy="5" r="4.5"/>
          </svg>
          <input id="rp-origin" type="text" placeholder="Origin (lat, lng)"
            autocomplete="off" spellcheck="false" />
        </div>
        <div class="rp-connector"></div>
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
          <span class="rp-stat-label">Distance</span>
        </div>
        <div class="rp-stat-divider"></div>
        <div class="rp-stat">
          <span class="rp-stat-value" id="rp-stat-time">—</span>
          <span class="rp-stat-label">Est. time</span>
        </div>
      </div>

      <div class="rp-engine" id="rp-engine" hidden></div>

      <div class="rp-status" id="rp-status" hidden></div>
    `;

    this._el = el;

    // Mode buttons
    el.querySelectorAll('.rp-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._mode = btn.dataset.mode;
        el.querySelectorAll('.rp-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
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

    // Prevent panel interactions from bleeding through to the map
    el.addEventListener('mousedown', e => e.stopPropagation());
    el.addEventListener('wheel',     e => e.stopPropagation());
    el.addEventListener('contextmenu', e => e.stopPropagation());

    return el;
  }

  onRemove() {
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

  // ── private helpers ───────────────────────────────────────

  _placeMarker(type, lngLat) {
    if (this._markers[type]) {
      this._markers[type].setLngLat(lngLat);
      return;
    }
    const dot = document.createElement('div');
    dot.className = `rp-map-dot rp-map-dot--${type}`;
    this._markers[type] = new maplibregl.Marker({ element: dot })
      .setLngLat(lngLat)
      .addTo(this._map);
  }

  _setStatus(html, cls = '') {
    const el = this._el.querySelector('#rp-status');
    el.className = `rp-status${cls ? ' ' + cls : ''}`;
    el.innerHTML = html;
    el.hidden = !html;
  }

  _showStats(distM, engine) {
    this._el.querySelector('#rp-stat-dist').textContent = fmtDistance(distM);
    this._el.querySelector('#rp-stat-time').textContent = fmtTime(distM, this._mode);
    this._el.querySelector('#rp-stats').hidden = false;
    const badge = this._el.querySelector('#rp-engine');
    const isGpu = engine === 'gpu';
    badge.className = `rp-engine rp-engine--${isGpu ? 'gpu' : 'cpu'}`;
    badge.innerHTML = isGpu
      ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>GPU accelerated`
      : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1"/><path d="M10 7V4M14 7V4M10 20v-3M14 20v-3M7 10H4M7 14H4M20 10h-3M20 14h-3"/></svg>CPU fallback`;
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

    const id = ++this._calcId;   // invalidates any previous in-flight call
    this._hideStats();
    this._setStatus('<span class="rp-spinner"></span>Calculating route…', 'loading');

    try {
      const result = await route(this._origin, this._dest, this._mode, URL_TEMPLATE);
      if (id !== this._calcId) return; // stale — a newer call is already running

      if (!result.found || !result.coordinates?.length) {
        this._setStatus('No route found between these points.', 'error');
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

      this._showStats(result.cost, result.engine);
      this._setStatus('');

    } catch (err) {
      if (id !== this._calcId) return;
      console.error('[omp-router] routing error:', err);
      this._setStatus('Routing error — check the console for details.', 'error');
      this._clearRoute();
    }
  }
}

// ── Map ─────────────────────────────────────────────────────────────────────

const map = new maplibregl.Map({
  container: 'map',
  style: './style.json',
  center: [-3.7038, 40.4168],
  zoom: 14,
  minZoom: 10,
});

const ctrl = new RoutingControl();
map.addControl(ctrl, 'top-left');
map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

// Left-click → origin  |  Right-click → destination
map.on('click', e => ctrl.setOrigin(e.lngLat));
map.on('contextmenu', e => {
  e.originalEvent.preventDefault();
  ctrl.setDest(e.lngLat);
});

map.on('load', () => {
  map.addSource('route-source', {
    type: 'geojson',
    lineMetrics: true,
    data: { type: 'FeatureCollection', features: [] },
  });

/*   // Soft shadow casing behind the route line
  map.addLayer({
    id: 'route-casing',
    type: 'line',
    source: 'route-source',
    paint: {
      'line-color': '#0f0',
      'line-width': 8,
      'line-opacity': 0.18,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  }); */

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

