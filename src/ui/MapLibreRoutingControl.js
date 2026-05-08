import {
  route as defaultRoute,
  getEngineWorkerStatus as defaultGetEngineWorkerStatus,
  onEngineWorkerStatusChange as defaultOnEngineWorkerStatusChange,
  cancelRunningEngine as defaultCancelRunningEngine,
  dispose as defaultDispose,
} from '../index.js';
import { DEFAULT_LOCALE, LOCALES, resolveLocale } from './l10n_defaults.js';
import { RouteFailureReason } from '../engines/router.js';
import './MapLibreRoutingControl.css';

const DEFAULT_OPTIONS = {
  defaultMode: 'car',
  defaultCostField: 'distance',
  theme: 'light',
  panelClassName: '',
  routeTimeoutMs: 20_000,
  routeSourceId: 'omtr-route-source',
  routeCasingLayerId: 'omtr-route-casing',
  routeLayerId: 'omtr-route-line',
  graphSourceId: 'omtr-graph-source',
  graphLayerId: 'omtr-graph-line',
  showGraph: false,
  mapPosition: 'top-left',
  startColor: '#2563eb',
  endColor: '#dc2626',
  locale: 'auto',
  routeOptions: {
    maxAutoRadius: 8,
    maxAcceptableSnapDistanceM: 60,
  },
};

const ENGINE_LABELS = Object.freeze({
  'ultra-dijkstra': 'UltraDijkstra',
  'bidirectional-astar': 'Bidirectional A★',
  'adaptive-barrier': 'Adaptive Barrier',
  'delta-stepping': 'Delta Stepping',
  cpu: 'CPU',
});

const ENGINE_BADGE_ICONS = Object.freeze({
  parallel:
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="m4.9 4.9 2.2 2.2"/><path d="m16.9 16.9 2.2 2.2"/><path d="m16.9 7.1 2.2-2.2"/><path d="m4.9 19.1 2.2-2.2"/></svg>',
  cpu:
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1"/><path d="M10 7V4"/><path d="M14 7V4"/><path d="M10 20v-3"/><path d="M14 20v-3"/><path d="M7 10H4"/><path d="M7 14H4"/><path d="M20 10h-3"/><path d="M20 14h-3"/></svg>',
});

const COST_LABELS = Object.freeze({ distance: 'shortest', travelTime: 'fastest', optimal: 'optimal' });

const RAD = Math.PI / 180;
const EARTH_RADIUS_METERS = 6_371_000;

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

function parseCoords(str) {
  const [a, b] = str.split(',').map((s) => parseFloat(s.trim()));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a < -90 || a > 90 || b < -180 || b > 180) return null;
  return [b, a];
}

function lngLatToStr({ lng, lat }) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

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
  const speeds = { car: 50, pedestrian: 5, bicycle: 15 };
  const mins = Math.round((m / 1000 / (speeds[mode] ?? 50)) * 60);
  return formatDuration(mins);
}

function formatEngineBadgeName(engineId) {
  return ENGINE_LABELS[engineId] || engineId;
}

function getEngineBadgeIcon(parallelUsed) {
  return parallelUsed ? ENGINE_BADGE_ICONS.parallel : ENGINE_BADGE_ICONS.cpu;
}

function mergeOptions(base, override) {
  const result = { ...base };
  for (const key in override) {
    if (Object.prototype.hasOwnProperty.call(override, key)) {
      const value = override[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = mergeOptions(base[key] || {}, value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

function mergeLocaleText(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    return base;
  }

  const result = { ...base };
  for (const key in base) {
    if (!Object.prototype.hasOwnProperty.call(base, key)) continue;
    if (!Object.prototype.hasOwnProperty.call(override, key)) continue;

    const baseValue = base[key];
    const overrideValue = override[key];

    if (baseValue && typeof baseValue === 'object' && !Array.isArray(baseValue)) {
      if (overrideValue && typeof overrideValue === 'object' && !Array.isArray(overrideValue)) {
        result[key] = mergeLocaleText(baseValue, overrideValue);
      } else {
        result[key] = baseValue;
      }
    } else if (typeof overrideValue === typeof baseValue) {
      result[key] = overrideValue;
    } else {
      result[key] = baseValue;
    }
  }
  return result;
}

export class MapLibreRoutingControl {
  constructor(options = {}) {
    this._options = mergeOptions(DEFAULT_OPTIONS, options);
    this._routeFunction = this._options.routeFunction ?? defaultRoute;
    this._getEngineWorkerStatus = this._options.getEngineWorkerStatus ?? defaultGetEngineWorkerStatus;
    this._onEngineWorkerStatusChange = this._options.onEngineWorkerStatusChange ?? defaultOnEngineWorkerStatusChange;
    this._cancelRunningEngine = this._options.cancelRunningEngine ?? defaultCancelRunningEngine;
    this._tileJsonUrl = this._options.tileJsonUrl;
    this._urlTemplate = this._options.urlTemplate || null;
    this._tileUrlTransform = this._options.tileUrlTransform;
    this._tileProxyTemplate = this._options.tileProxyTemplate;
    this._routeOptions = { ...this._options.routeOptions };
    this._routeTimeoutMs = Number(this._options.routeTimeoutMs);
    this._theme = String(this._options.theme ?? 'auto').toLowerCase();
    this._panelClassName = typeof this._options.panelClassName === 'string'
      ? this._options.panelClassName.trim()
      : '';
    const locale = this._options.locale ?? this._options.language;
    const localeOverride = this._options.locale_override ?? this._options.localeOverride ??
      (locale && typeof locale === 'object' && !Array.isArray(locale) ? locale : undefined);
    const baseLocale = typeof locale === 'string' ? resolveLocale(locale) : resolveLocale(this._options.language ?? 'auto');
    this._locale = baseLocale;
    this._text = localeOverride
      ? mergeLocaleText(LOCALES[baseLocale] ?? LOCALES[DEFAULT_LOCALE], localeOverride)
      : LOCALES[baseLocale] ?? LOCALES[DEFAULT_LOCALE];
    this._maplibre = this._options.maplibre ?? (typeof window !== 'undefined' ? window.maplibregl : null);

    if (!this._maplibre || typeof this._maplibre.Marker !== 'function') {
      throw new Error('MapLibreRoutingControl requires a compatible maplibre instance via options.maplibre or window.maplibregl.');
    }

    this._mode = this._options.defaultMode;
    this._costField = this._options.defaultCostField;
    this._origin = null;
    this._dest = null;
    this._map = null;
    this._panel = null;
    this._originInput = null;
    this._destInput = null;
    this._statusEl = null;
    this._statsEl = null;
    this._statDistEl = null;
    this._statTimeEl = null;
    this._engineBadgeEl = null;
    this._markers = { origin: null, dest: null };
    this._calcId = 0;
    this._suppressNextMapPointerSet = false;
    this._engineBusy = false;
    this._unsubscribeEngineStatus = null;
    this._mapClickHandler = null;
    this._mapContextMenuHandler = null;
    this._routeSourceStyleLoadHandler = null;
    this._tileTemplatePromise = null;
    this._mounted = false;
  }

  _resolveThemeClass() {
    const theme = String(this._theme ?? 'auto').toLowerCase();
    if (theme === 'dark') return 'routing-panel--theme-dark';
    if (theme === 'light') return 'routing-panel--theme-light';
    return 'routing-panel--theme-auto';
  }

  onAdd(map) {
    this._mounted = true;
    this._map = map;
    this._panel = document.createElement('div');
    this._panel.className = 'routing-panel';
    this._panel.classList.add(this._resolveThemeClass());
    if (this._panelClassName) {
      this._panel.classList.add(...this._panelClassName.split(/\s+/).filter(Boolean));
    }
    this._panel.dataset.theme = this._theme;
    this._panel.innerHTML = this._buildPanelMarkup();

    this._originInput = this._panel.querySelector('#rp-origin');
    this._destInput = this._panel.querySelector('#rp-dest');
    this._statusEl = this._panel.querySelector('#rp-status');
    this._statsEl = this._panel.querySelector('#rp-stats');
    this._statDistEl = this._panel.querySelector('#rp-stat-dist');
    this._statTimeEl = this._panel.querySelector('#rp-stat-time');
    this._statDistLabelEl = this._panel.querySelector('#rp-stat-dist-label');
    this._statTimeLabelEl = this._panel.querySelector('#rp-stat-time-label');
    this._engineBadgeEl = this._panel.querySelector('#rp-engine');

    this._bindPanelEvents();
    this._setupRouteSource();

    this._mapClickHandler = (e) => this.setOriginFromMap(e.lngLat);
    this._mapContextMenuHandler = (e) => {
      e.originalEvent?.preventDefault();
      this.setDestFromMap(e.lngLat);
    };
    this._map.on('click', this._mapClickHandler);
    this._map.on('contextmenu', this._mapContextMenuHandler);

    if (this._onEngineWorkerStatusChange) {
      this._unsubscribeEngineStatus = this._onEngineWorkerStatusChange((status) => {
        this._engineBusy = Boolean(status.running);
      });
      this._engineBusy = Boolean(this._getEngineWorkerStatus?.().running);
    }

    if (this._tileJsonUrl && !this._urlTemplate) {
      this._loadTileTemplate().catch((err) => {
        console.error('[omt-router] tile metadata load failed:', err);
        this._setStatus(this._text.status.tileMetadata, 'error');
      });
    }

    return this._panel;
  }

  onRemove() {
    this._mounted = false;
    this._unsubscribeEngineStatus?.();
    this._unsubscribeEngineStatus = null;

    if (this._engineBusy) {
      this._cancelRunningEngine?.('routing_control_removed');
    }

    if (this._map) {
      if (this._mapClickHandler) {
        this._map.off('click', this._mapClickHandler);
        this._mapClickHandler = null;
      }
      if (this._mapContextMenuHandler) {
        this._map.off('contextmenu', this._mapContextMenuHandler);
        this._mapContextMenuHandler = null;
      }
      if (this._routeSourceStyleLoadHandler) {
        this._map.off('load', this._routeSourceStyleLoadHandler);
        this._routeSourceStyleLoadHandler = null;
      }
    }

    Object.values(this._markers).forEach((marker) => marker?.remove());
    this._markers = { origin: null, dest: null };

    if (this._map) {
      this._removeRouteLayers();
    }

    this._panel?.remove();
    this._map = null;
    defaultDispose();
  }

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

  setUrlTemplate(urlTemplate) {
    this._urlTemplate = urlTemplate;
    this._tryRoute();
  }

  setTileJsonUrl(url) {
    this._tileJsonUrl = url;
    this._urlTemplate = null;
    this._tileTemplatePromise = null;
    this._loadTileTemplate().catch((err) => {
      console.error('[omt-router] tile metadata load failed:', err);
      this._setStatus(this._text.status.tileMetadata, 'error');
    });
  }

  async _loadTileTemplate() {
    if (!this._tileJsonUrl) return null;
    if (this._tileTemplatePromise) return this._tileTemplatePromise;

    this._tileTemplatePromise = fetch(this._tileJsonUrl)
      .then((r) => {
        if (!r.ok) {
          throw new Error(`Tile metadata request failed: ${r.status} ${r.statusText}`);
        }
        return r.json();
      })
      .then((meta) => {
        if (!meta || !Array.isArray(meta.tiles) || meta.tiles.length === 0) {
          throw new Error('Tile metadata response does not contain a valid tiles array.');
        }
        this._urlTemplate = meta.tiles[0];
        if (this._origin && this._dest) {
          this._tryRoute();
        }
        return this._urlTemplate;
      });

    return this._tileTemplatePromise;
  }

  _buildPanelMarkup() {
    return `
      <span class="rp-title">${this._text.title}</span>

      <div class="rp-modes">
        <button type="button" class="rp-mode-btn" data-mode="pedestrian" aria-pressed="false" title="${this._text.modeTitles.pedestrian}">
          <span class="rp-mode-icon">🚶</span>
          <span class="rp-mode-label">${this._text.modes.pedestrian}</span>
        </button>
        <button type="button" class="rp-mode-btn active" data-mode="car" aria-pressed="true" title="${this._text.modeTitles.car}">
          <span class="rp-mode-icon">🚗</span>
          <span class="rp-mode-label">${this._text.modes.car}</span>
        </button>
        <button type="button" class="rp-mode-btn" data-mode="bicycle" aria-pressed="false" title="${this._text.modeTitles.bicycle}">
          <span class="rp-mode-icon">🚲</span>
          <span class="rp-mode-label">${this._text.modes.bicycle}</span>
        </button>
      </div>

      <div class="rp-section">
        <span class="rp-section-label">${this._text.optimizeFor}</span>
        <div class="rp-costs">
          <button type="button" class="rp-cost-btn active" data-cost-field="distance" aria-pressed="true" title="${this._text.costTitles.distance}">
            ${this._text.costLabels.distance}
          </button>
          <button type="button" class="rp-cost-btn" data-cost-field="travelTime" aria-pressed="false" title="${this._text.costTitles.travelTime}">
            ${this._text.costLabels.travelTime}
          </button>
          <button type="button" class="rp-cost-btn" data-cost-field="optimal" aria-pressed="false" title="${this._text.costTitles.optimal}">
            ${this._text.costLabels.optimal}
          </button>
        </div>
        <div class="rp-inputs">
          <div class="rp-input-row">
            <svg class="rp-point-icon rp-point-icon--origin" viewBox="0 0 10 10">
              <circle cx="5" cy="5" r="4.5"/>
            </svg>
            <input id="rp-origin" type="text" placeholder="${this._text.originPlaceholder}" autocomplete="off" spellcheck="false" />
          </div>
          <div class="rp-swap-wrap">
            <button type="button" class="rp-swap-btn" id="rp-swap-btn" title="${this._text.reverseRoute}" aria-label="${this._text.reverseRoute}">⇅</button>
          </div>
          <div class="rp-input-row">
            <svg class="rp-point-icon rp-point-icon--dest" viewBox="0 0 10 10">
              <circle cx="5" cy="5" r="4.5"/>
            </svg>
            <input id="rp-dest" type="text" placeholder="${this._text.destinationPlaceholder}" autocomplete="off" spellcheck="false" />
          </div>
        </div>
      </div>

      <div class="rp-hint">
        <span class="rp-hint-item"><span class="rp-hint-key">${this._text.leftClick}</span> ${this._text.setOrigin}</span>
        <span class="rp-hint-sep">·</span>
        <span class="rp-hint-item"><span class="rp-hint-key">${this._text.rightClick}</span> ${this._text.setDestination}</span>
      </div>

      <div class="rp-stats" id="rp-stats" hidden>
        <div class="rp-stat">
          <span class="rp-stat-value" id="rp-stat-dist">—</span>
          <span class="rp-stat-label" id="rp-stat-dist-label">${this._text.stats.distance}</span>
        </div>
        <div class="rp-stat-divider"></div>
        <div class="rp-stat">
          <span class="rp-stat-value" id="rp-stat-time">—</span>
          <span class="rp-stat-label" id="rp-stat-time-label">${this._text.stats.estTime}</span>
        </div>
      </div>

      <div class="rp-engine" id="rp-engine" hidden></div>
      <div class="rp-status" id="rp-status" role="status" aria-live="polite" hidden></div>
    `;
  }

  _bindPanelEvents() {
    const modeButtons = this._panel.querySelectorAll('.rp-mode-btn');
    modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this._mode = btn.dataset.mode;
        modeButtons.forEach((b) => {
          const isActive = b === btn;
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        this._tryRoute();
      });
    });

    const costButtons = this._panel.querySelectorAll('.rp-cost-btn');
    costButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this._costField = btn.dataset.costField;
        costButtons.forEach((b) => {
          const isActive = b === btn;
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        this._tryRoute();
      });
    });

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

    this._panel.querySelector('#rp-swap-btn').addEventListener('click', () => {
      this._reverseRoute();
    });

    this._panel.addEventListener('mousedown', (e) => e.stopPropagation());
    this._panel.addEventListener('wheel', (e) => e.stopPropagation());
    this._panel.addEventListener('contextmenu', (e) => e.stopPropagation());
  }

  _setupRouteSource() {
    if (!this._map) return;
    if (this._map.getSource(this._options.routeSourceId)) return;
    this._routeSourceStyleLoadHandler = () => {
      if (!this._mounted || !this._map) return;
      if (this._map.getSource(this._options.routeSourceId)) return;
      this._map.addSource(this._options.routeSourceId, {
        type: 'geojson',
        lineMetrics: true,
        data: { type: 'FeatureCollection', features: [] },
      });
      this._map.addLayer({
        id: this._options.routeCasingLayerId,
        type: 'line',
        source: this._options.routeSourceId,
        paint: {
          'line-color': '#ffffff',
          'line-width': 10,
          'line-opacity': 0.5,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      if (this._options.showGraph) {
        this._map.addSource(this._options.graphSourceId, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        this._map.addLayer({
          id: this._options.graphLayerId,
          type: 'line',
          source: this._options.graphSourceId,
          paint: {
            'line-color': '#00ff00',
            'line-width': 2,
            'line-opacity': 0.9,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
      }

      this._map.addLayer({
        id: this._options.routeLayerId,
        type: 'line',
        source: this._options.routeSourceId,
        paint: {
          'line-color': this._options.startColor,
          'line-gradient': [
            'interpolate-hcl',
            ['linear'],
            ['line-progress'],
            0,
            this._options.startColor,
            1,
            this._options.endColor,
          ],
          'line-width': 4,
          'line-opacity': 0.9,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      if (this._origin && this._dest) {
        this._tryRoute();
      }
    };

    if (this._map.isStyleLoaded()) {
      this._routeSourceStyleLoadHandler();
    } else {
      this._map.once('load', this._routeSourceStyleLoadHandler);
    }
  }

  _removeRouteLayers() {
    for (const id of [
      this._options.routeLayerId,
      this._options.routeCasingLayerId,
      this._options.graphLayerId,
    ]) {
      if (this._map.getLayer(id)) {
        this._map.removeLayer(id);
      }
    }
    for (const id of [this._options.routeSourceId, this._options.graphSourceId]) {
      if (this._map.getSource(id)) {
        this._map.removeSource(id);
      }
    }
  }

  _placeMarker(type, lngLat) {
    if (this._markers[type]) {
      this._markers[type].setLngLat(lngLat);
      return;
    }

    const dot = document.createElement('div');
    dot.className = `rp-map-dot rp-map-dot--${type}`;
    dot.style.backgroundColor = type === 'origin'
      ? this._options.startColor
      : this._options.endColor;
    const marker = new this._maplibre.Marker({ element: dot, draggable: true })
      .setLngLat(lngLat)
      .addTo(this._map);

    this._markers[type] = marker;

    marker.on('dragstart', () => {
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
    const previousOrigin = this._origin;
    this._origin = this._dest;
    this._dest = previousOrigin;

    if (this._origin) {
      this._originInput.value = `${this._origin[1].toFixed(6)}, ${this._origin[0].toFixed(6)}`;
      this._placeMarker('origin', this._origin);
    }

    if (this._dest) {
      this._destInput.value = `${this._dest[1].toFixed(6)}, ${this._dest[0].toFixed(6)}`;
      this._placeMarker('dest', this._dest);
    }

    this._tryRoute();
  }

  _setStatus(html, cls = '') {
    if (!this._statusEl) return;
    this._statusEl.className = `rp-status${cls ? ' ' + cls : ''}`;
    if (cls === 'loading' && html.includes('rp-spinner')) {
      this._statusEl.innerHTML = html;
    } else {
      this._statusEl.textContent = html;
    }
    this._statusEl.hidden = !html;
  }

  _showStats(result) {
    if (
      !this._statsEl ||
      !this._statDistEl ||
      !this._statTimeEl ||
      !this._statDistLabelEl ||
      !this._statTimeLabelEl ||
      !this._engineBadgeEl
    ) {
      console.warn('[omt-router] skipping stats update because the control panel is not mounted');
      return;
    }

    const distanceM = result.costField === 'distance' ? result.cost : getRouteDistance(result.coordinates);
    const timeText = result.costField !== 'distance' ? this._formatDurationSeconds(result.cost) : fmtTime(distanceM, this._mode);
    const engine = result.engine ?? 'cpu';
    const parallelUsed = Boolean(result.parallelUsed);

    this._statDistEl.textContent = fmtDistance(distanceM);
    this._statTimeEl.textContent = timeText;
    this._statDistLabelEl.textContent = this._text.stats.distance;
    this._statTimeLabelEl.textContent = this._costField === 'distance' ? this._text.stats.estTime : this._text.stats.travelTime;
    this._statsEl.hidden = false;
    this._engineBadgeEl.className = `rp-engine ${parallelUsed ? 'rp-engine--parallel' : 'rp-engine--cpu'}`;
    const costLabel = this._text.costLabels[this._costField] ?? this._text.costLabels.distance;
    const engineLabel = formatEngineBadgeName(engine);
    this._engineBadgeEl.innerHTML = `${getEngineBadgeIcon(parallelUsed)}${engineLabel} · ${costLabel}`;
    this._engineBadgeEl.hidden = false;
  }

  _formatDurationSeconds(seconds) {
    return formatDuration(Math.round(seconds / 60));
  }

  _hideStats() {
    this._statsEl.hidden = true;
    this._engineBadgeEl.hidden = true;
  }

  _clearRoute() {
    if (!this._map || !this._map.getSource(this._options.routeSourceId)) return;
    this._map.getSource(this._options.routeSourceId).setData({ type: 'FeatureCollection', features: [] });
  }

  _clearGraph() {
    if (!this._map || !this._map.getSource(this._options.graphSourceId)) return;
    this._map.getSource(this._options.graphSourceId).setData({ type: 'FeatureCollection', features: [] });
  }

  async _tryRoute() {
    if (!this._mounted) return;
    if (!this._origin || !this._dest) return;
    this._setupRouteSource();
    if (!this._map?.getSource(this._options.routeSourceId)) {
      this._setStatus(this._text.status.waitingStyle, 'loading');
      return;
    }
    if (!this._urlTemplate) {
      if (this._tileJsonUrl) {
        await this._loadTileTemplate();
        if (!this._mounted) return;
      }
      if (!this._urlTemplate) {
        this._setStatus(this._text.status.tileUrl, 'error');
        this._clearRoute();
        return;
      }
    }


    const id = ++this._calcId;
    this._hideStats();
    this._clearRoute();
    this._clearGraph();
    this._setStatus(`<span class="rp-spinner"></span>${this._text.status.calculating}`, 'loading');

    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      this._cancelRunningEngine?.(`timeout_${this._routeTimeoutMs}ms`);
    }, this._routeTimeoutMs);

    try {
      const result = await this._routeFunction(this._origin, this._dest, this._mode, this._urlTemplate, {
        costField: this._costField,
        tileUrlTransform: this._tileUrlTransform,
        tileProxyTemplate: this._tileProxyTemplate,
        includeGraph: this._options.showGraph,
        ...this._routeOptions,
      });

      if (!this._mounted || id !== this._calcId) return;
      if (!result.found || !result.coordinates?.length) {
        this._handleRouteFailure(result);
        return;
      }

      this._map.getSource(this._options.routeSourceId).setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: result.coordinates },
        properties: {},
      });

      if (this._options.showGraph) {
        if (result.graph) {
          this._map.getSource(this._options.graphSourceId).setData(this._buildGraphGeoJSON(result.graph));
        } else {
          this._clearGraph();
        }
      }

      const coords = result.coordinates;
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

      if (coords.length > 1) {
        const bounds = coords.reduce(
          (b, c) => b.extend(c),
          new this._maplibre.LngLatBounds(coords[0], coords[0])
        );
        this._map.fitBounds(bounds, { padding: 100, maxZoom: 16, duration: 600 });
      }

      this._showStats(result);
      this._setStatus('');
    } catch (err) {
      if (!this._mounted || id !== this._calcId) return;
      console.error('[omt-router] routing error:', err);
      if (err?.code === 'engine_cancelled') {
        this._setStatus(
          timedOut ? this._text.status.timedOut : this._text.status.cancelled,
          'error'
        );
      } else {
        const errorMessage = err?.message || (typeof err === 'string' ? err : this._text.status.unknownError ?? 'Unknown routing error');
        this._setStatus(`${this._text.status.routeErrorPrefix} ${errorMessage}`, 'error');
      }
      this._clearRoute();
      this._clearGraph();
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  _handleRouteFailure(result) {
    console.warn('[omt-router] route failed:', result);
    const reason = result?.reason;
    switch (reason) {
      case RouteFailureReason.TILE_CORS:
        this._setStatus(this._text.status.tileCors, 'error');
        break;
      case RouteFailureReason.POOR_SNAP:
        this._setStatus(this._text.status.poorSnap, 'error');
        break;
      case RouteFailureReason.NO_NODE:
        this._setStatus(this._text.status.noNode, 'error');
        break;
      case RouteFailureReason.NO_PATH:
        this._setStatus(this._text.status.noPath, 'error');
        break;
      case RouteFailureReason.INCOMPLETE_PATH:
        this._setStatus(this._text.status.incompletePath, 'error');
        break;
      default:
        this._setStatus(this._text.status.noRoute, 'error');
        break;
    }
    this._clearRoute();
    this._clearGraph();
  }

  _buildGraphGeoJSON(graph) {
    const nodes = graph?.nodes;
    if (!graph?.nodes || !graph?.edges?.length) {
      return { type: 'FeatureCollection', features: [] };
    }

    const features = [];
    for (const edge of graph.edges) {
      const sourceNode = nodes.get(edge.source);
      const targetNode = nodes.get(edge.target);
      if (!sourceNode || !targetNode) continue;
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [sourceNode.coords, targetNode.coords],
        },
        properties: {},
      });
    }

    return { type: 'FeatureCollection', features };
  }
}

export { parseCoords };
