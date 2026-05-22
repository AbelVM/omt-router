import {
  route as defaultRoute,
  getEngineWorkerStatus as defaultGetEngineWorkerStatus,
  onEngineWorkerStatusChange as defaultOnEngineWorkerStatusChange,
  cancelRunningEngine as defaultCancelRunningEngine,
  dispose as defaultDispose,
} from '../index.js';
import { DEFAULT_LOCALE, LOCALES, resolveLocale } from './l10n_defaults.js';
import './MapLibreRoutingControl.css';

import * as Core from './MapLibreRoutingControl.core.js';
import * as UI from './MapLibreRoutingControl.ui.js';
import * as MapModule from './MapLibreRoutingControl.map.js';

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
  features: 'both',
  isolineSourceId: 'omtr-isoline-source',
  isolineFillLayerId: 'omtr-isoline-fill',
  isolineOutlineLayerId: 'omtr-isoline-outline',
  // Controls how many extra meters / multiplier to apply when selecting
  // tiles for isoline graph building. Increasing these fetches a larger
  // neighborhood to avoid isoline clipping at tile seams.
  isolineTileSearchMultiplier: 1.6,
  isolineTileSearchExtraMeters: 200,
  locale: 'auto',
  routeOptions: {
    maxAutoRadius: 8,
    maxAcceptableSnapDistanceM: 60,
  },
};

// (intentionally omitted duplicate badge/label constants present in core)

const { parseCoords, lngLatToStr } = Core;

/**
 * Merge nested option objects while preserving base defaults.
 * @param {object} base Default option values.
 * @param {object} override User-provided options.
 * @returns {object} Merged options object.
 */
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

/**
 * Merge locale text overrides into a base locale bundle.
 * @param {object} base Base locale text values.
 * @param {object} override Optional locale override values.
 * @returns {object} Merged locale text.
 */
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

// (Removed) per-control isoline tile cache — use shared cache via buildGraphForTiles

/**
 * MapLibre control for route planning, isoline display, and route status UI.
 */
export class MapLibreRoutingControl {
  /**
   * @param {object} [options] Control configuration.
   */
  constructor(options = {}) {
    this._options = mergeOptions(DEFAULT_OPTIONS, options);
    this._routeFunction = this._options.routeFunction ?? defaultRoute;
    this._getEngineWorkerStatus =
      this._options.getEngineWorkerStatus ?? defaultGetEngineWorkerStatus;
    this._onEngineWorkerStatusChange =
      this._options.onEngineWorkerStatusChange ?? defaultOnEngineWorkerStatusChange;
    this._cancelRunningEngine = this._options.cancelRunningEngine ?? defaultCancelRunningEngine;
    this._tileJsonUrl = this._options.tileJsonUrl;
    this._urlTemplate = this._options.urlTemplate || null;
    this._tileUrlTransform = this._options.tileUrlTransform;
    this._tileProxyTemplate = this._options.tileProxyTemplate;
    this._routeOptions = { ...this._options.routeOptions };
    this._routeTimeoutMs = Number(this._options.routeTimeoutMs);
    this._theme = String(this._options.theme ?? 'auto').toLowerCase();
    this._panelClassName =
      typeof this._options.panelClassName === 'string' ? this._options.panelClassName.trim() : '';
    const locale = this._options.locale ?? this._options.language;
    const localeOverride =
      this._options.locale_override ??
      this._options.localeOverride ??
      (locale && typeof locale === 'object' && !Array.isArray(locale) ? locale : undefined);
    const baseLocale =
      typeof locale === 'string'
        ? resolveLocale(locale)
        : resolveLocale(this._options.language ?? 'auto');
    this._locale = baseLocale;
    this._text = localeOverride
      ? mergeLocaleText(LOCALES[baseLocale] ?? LOCALES[DEFAULT_LOCALE], localeOverride)
      : (LOCALES[baseLocale] ?? LOCALES[DEFAULT_LOCALE]);

    this._text.status = {
      ...LOCALES[DEFAULT_LOCALE].status,
      ...this._text.status,
    };

    // Use l10n defaults and any provided locale overrides. Keep minimal
    // fallbacks in-place if l10n entries are missing.
    this._text.isoline = this._text.isoline || {};
    this._text.tabs = this._text.tabs || {
      routing: this._text.title || 'Routing',
      isolines: this._text.isoline.heading || 'Isolines',
    };
    this._maplibre =
      this._options.maplibre ?? (typeof window !== 'undefined' ? window.maplibregl : null);

    if (!this._maplibre || typeof this._maplibre.Marker !== 'function') {
      throw new Error(
        'MapLibreRoutingControl requires a compatible maplibre instance via options.maplibre or window.maplibregl.'
      );
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
    this._statusElIsoline = null;
    this._statsEl = null;
    this._statDistEl = null;
    this._statTimeEl = null;
    this._engineBadgeEl = null;
    this._isolineThresholdInput = null;
    this._isolineThresholdUnitEl = null;
    this._isolinePanel = null;
    this._routingPanel = null;
    this._modeButtons = null;
    this._costButtons = null;
    this._isolineModeButtons = null;
    this._isolineCostButtons = null;
    this._isolineDirectionButtons = null;
    this._isolinePointIconEl = null;
    this._swapBtn = null;
    this._tabRoutingBtn = null;
    this._tabIsolineBtn = null;
    this._markers = { origin: null, dest: null, isoline: null };
    this._calcId = 0;
    this._suppressNextMapPointerSet = false;
    this._engineBusy = false;
    this._unsubscribeEngineStatus = null;
    this._mapClickHandler = null;
    this._mapContextMenuHandler = null;
    this._routeSourceStyleLoadHandler = null;
    this._tileTemplatePromise = null;
    this._mounted = false;
    // Normalize `features` option and accept common aliases.
    let f = String(this._options.features ?? 'both')
      .toLowerCase()
      .trim();
    if (f === 'isoline') f = 'isolines';
    if (f === 'route') f = 'routing';
    if (!['both', 'isolines', 'routing'].includes(f)) f = 'both';
    this._features = f;
    this._activeTab = this._features === 'isolines' ? 'isoline' : 'routing';
    // Default isoline max cost: allow explicit option, otherwise choose
    // sensible defaults depending on the cost field:
    // - distance: metres (default 100 m)
    // - travelTime/optimal: seconds (default 15 minutes -> 900 s)
    const _optIso = this._options.isolineMaxCost;
    const _defaultIso = Number.isFinite(Number(_optIso))
      ? Number(_optIso)
      : this._costField === 'travelTime' || this._costField === 'optimal'
        ? 15 * 60
        : 1000;
    this._isoline = { point: null, direction: 'from', maxCost: _defaultIso };
    this._isolineWorker = null;
    this._isolinePendingRequests = null;
  }

  _resolveThemeClass() {
    const theme = String(this._theme ?? 'auto').toLowerCase();
    if (theme === 'dark') return 'routing-panel--theme-dark';
    if (theme === 'light') return 'routing-panel--theme-light';
    return 'routing-panel--theme-auto';
  }

  /**
   * MapLibre control lifecycle method invoked when the control is added to the map.
   * @param {object} map MapLibre map instance.
   * @returns {HTMLElement} DOM element for the control.
   */
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
    this._statusElIsoline = this._panel.querySelector('#rp-status-isoline');
    this._statsEl = this._panel.querySelector('#rp-stats');
    this._statDistEl = this._panel.querySelector('#rp-stat-dist');
    this._statTimeEl = this._panel.querySelector('#rp-stat-time');
    this._statDistLabelEl = this._panel.querySelector('#rp-stat-dist-label');
    this._statTimeLabelEl = this._panel.querySelector('#rp-stat-time-label');
    this._engineBadgeEl = this._panel.querySelector('#rp-engine');
    this._isolinePointInput = this._panel.querySelector('#rp-isoline-point');
    this._isolineThresholdInput = this._panel.querySelector('#rp-isoline-threshold');
    this._isolineThresholdUnitEl = this._panel.querySelector('#rp-isoline-threshold-unit');
    this._isolinePanel = this._panel.querySelector('#rp-isoline-panel');
    this._routingPanel = this._panel.querySelector('#rp-routing-panel');
    this._modeButtons = this._routingPanel ? Array.from(this._routingPanel.querySelectorAll('.rp-mode-btn')) : [];
    this._costButtons = this._routingPanel ? Array.from(this._routingPanel.querySelectorAll('.rp-cost-btn')) : [];
    this._isolineModeButtons = Array.from(this._isolinePanel?.querySelectorAll('.rp-mode-btn') || []);
    this._isolineCostButtons = Array.from(this._isolinePanel?.querySelectorAll('.rp-cost-btn') || []);
    this._isolineDirectionButtons = Array.from(this._panel.querySelectorAll('.rp-isoline-direction-btn'));
    this._isolinePointIconEl = this._panel.querySelector('#rp-isoline-panel .rp-point-icon');
    this._swapBtn = this._panel.querySelector('#rp-swap-btn');
    this._tabRoutingBtn = this._panel.querySelector('#rp-tab-routing');
    this._tabIsolineBtn = this._panel.querySelector('#rp-tab-isoline');

    this._bindPanelEvents();
    // Ensure mode/cost UI and threshold UI are synced on mount
    UI.syncModeAndCostUI(this);
    this._setupRouteSource();

    this._mapClickHandler = (e) => {
      if (this._activeTab === 'isoline') return this.setIsolineFromMap(e.lngLat);
      return this.setOriginFromMap(e.lngLat);
    };
    this._mapContextMenuHandler = (e) => {
      e.originalEvent?.preventDefault();
      // Don't place a destination marker when in isoline mode.
      if (this._activeTab === 'isoline') return;
      if (this._consumeMapPointerSuppression()) return;
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

  /**
   * MapLibre control lifecycle method invoked when the control is removed.
   * Cleans up event listeners, markers, workers, and map layers.
   */
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
    this._markers = { origin: null, dest: null, isoline: null };

    if (this._map) {
      this._removeRouteLayers();
    }

    this._panel?.remove();
    this._map = null;
    // Clean up any isoline worker and pending requests when the control is removed.
    try {
      if (this._isolinePendingRequests) {
        for (const [_id, p] of this._isolinePendingRequests) {
          try {
            p.reject(new Error('control removed'));
          } catch (_e) {
            void _e;
          }
        }
        this._isolinePendingRequests = null;
      }
    } catch (_e) {
      void _e;
    }
    try {
      if (this._isolineWorker) {
        try {
          this._isolineWorker.postMessage({ type: 'dispose' });
        } catch (_e) {
          void _e;
        }
        try {
          this._isolineWorker.terminate();
        } catch (_e) {
          void _e;
        }
        this._isolineWorker = null;
      }
    } catch (_e) {
      void _e;
    }
    defaultDispose();
  }

  /**
   * Set the route origin from a MapLibre lngLat object and trigger routing.
   * @param {{lng:number,lat:number}} lngLat Origin coordinate.
   */
  setOrigin(lngLat) {
    this._origin = [lngLat.lng, lngLat.lat];
    this._originInput.value = lngLatToStr(lngLat);
    this._placeMarker('origin', this._origin);
    this._tryRoute();
  }

  /**
   * Set the route destination from a MapLibre lngLat object and trigger routing.
   * @param {{lng:number,lat:number}} lngLat Destination coordinate.
   */
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

  /**
   * Set the isoline origin point from a MapLibre lngLat object and trigger isoline computation.
   * @param {{lng:number,lat:number}} lngLat Isoline coordinate.
   */
  setIsoline(lngLat) {
    this._isoline.point = [lngLat.lng, lngLat.lat];
    if (this._isolinePointInput) this._isolinePointInput.value = lngLatToStr(lngLat);
    this._placeIsolineMarker(this._isoline.point);
    this._tryIsoline();
  }

  setIsolineFromMap(lngLat) {
    if (this._consumeMapPointerSuppression()) return;
    this.setIsoline(lngLat);
  }

  /**
   * Update the tile URL template used for routing and isoline graph requests.
   * @param {string|null} urlTemplate Template string for tile requests.
   */
  setUrlTemplate(urlTemplate) {
    this._urlTemplate = urlTemplate;
    this._tryRoute();
  }

  /**
   * Configure a tile metadata JSON URL and reload tile template metadata.
   * @param {string} url TileJSON endpoint URL.
   */
  setTileJsonUrl(url) {
    this._tileJsonUrl = url;
    this._urlTemplate = null;
    this._tileTemplatePromise = null;
    this._loadTileTemplate().catch((err) => {
      console.error('[omt-router] tile metadata load failed:', err);
      this._setStatus(this._text.status.tileMetadata, 'error');
    });
  }

  /**
   * Load tile metadata from TileJSON and cache the resolved URL template.
   * @returns {Promise<string|null>} Resolved URL template or null.
   */
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
    return UI.buildPanelMarkup(this);
  }

  /**
   * Bind DOM event handlers for the control panel controls and tabs.
   */
  _bindPanelEvents() {
    // Scope routing controls to the routing panel (if present) so isoline
    // controls don't accidentally get bound by the routing handlers.
    const routingPanel =
      this._routingPanel || this._panel.querySelector('#rp-routing-panel') || this._panel;
    const modeButtons = this._modeButtons || Array.from(routingPanel.querySelectorAll('.rp-mode-btn'));
    modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const newMode = btn.dataset.mode;
        // If the selection didn't change, keep UI consistent but avoid re-running route
        if (this._mode === newMode) {
          modeButtons.forEach((b) => {
            const isActive = b === btn;
            b.classList.toggle('active', isActive);
            b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          });
          UI.syncModeAndCostUI(this);
          return;
        }
        this._mode = newMode;
        modeButtons.forEach((b) => {
          const isActive = b === btn;
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        UI.syncModeAndCostUI(this);
        this._tryRoute();
      });
    });

    const costButtons = this._costButtons || Array.from(routingPanel.querySelectorAll('.rp-cost-btn'));
    costButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const newCost = btn.dataset.costField;
        // Avoid recomputing if the cost field didn't change; keep UI state consistent
        if (this._costField === newCost) {
          costButtons.forEach((b) => {
            const isActive = b === btn;
            b.classList.toggle('active', isActive);
            b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          });
          UI.syncModeAndCostUI(this);
          return;
        }
        this._costField = newCost;
        costButtons.forEach((b) => {
          const isActive = b === btn;
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        UI.syncModeAndCostUI(this);
        this._tryRoute();
      });
    });

    if (this._originInput) {
      this._originInput.addEventListener('change', () => {
        const coords = parseCoords(this._originInput.value);
        if (coords) {
          this._origin = coords;
          this._placeMarker('origin', coords);
          this._tryRoute();
        }
      });
    }

    if (this._destInput) {
      this._destInput.addEventListener('change', () => {
        const coords = parseCoords(this._destInput.value);
        if (coords) {
          this._dest = coords;
          this._placeMarker('dest', coords);
          this._tryRoute();
        }
      });
    }

    const swapBtn = this._swapBtn || this._panel.querySelector('#rp-swap-btn');
    if (swapBtn) {
      swapBtn.addEventListener('click', () => {
        this._reverseRoute();
      });
    }

    this._panel.addEventListener('mousedown', (e) => e.stopPropagation());
    this._panel.addEventListener('wheel', (e) => e.stopPropagation());
    this._panel.addEventListener('contextmenu', (e) => e.stopPropagation());

    // Tabs (when both features available)
    const tabRoutingBtn = this._tabRoutingBtn || this._panel.querySelector('#rp-tab-routing');
    const tabIsolineBtn = this._tabIsolineBtn || this._panel.querySelector('#rp-tab-isoline');
    const routePanel = this._routingPanel || this._panel.querySelector('#rp-routing-panel');
    const isolinePanel = this._isolinePanel || this._panel.querySelector('#rp-isoline-panel');
    if (tabRoutingBtn && tabIsolineBtn) {
      tabRoutingBtn.addEventListener('click', () => {
        tabRoutingBtn.classList.add('active');
        tabIsolineBtn.classList.remove('active');
        if (routePanel) routePanel.hidden = false;
        if (isolinePanel) isolinePanel.hidden = true;
        this._activeTab = 'routing';
        this._clearIsoline();
        UI.syncModeAndCostUI(this);
        UI.resetOtherUI(this, 'routing');
      });
      tabIsolineBtn.addEventListener('click', () => {
        tabIsolineBtn.classList.add('active');
        tabRoutingBtn.classList.remove('active');
        if (routePanel) routePanel.hidden = true;
        if (isolinePanel) isolinePanel.hidden = false;
        this._activeTab = 'isoline';
        // Clear routing visuals (route layers/sources) and remove any
        // routing markers (origin/dest) so the isoline view is clean.
        this._clearRoute();
        try {
          if (this._markers.origin) {
            this._markers.origin.remove();
            this._markers.origin = null;
          }
        } catch (_e) {
          void _e;
        }
        try {
          if (this._markers.dest) {
            this._markers.dest.remove();
            this._markers.dest = null;
          }
        } catch (_e) {
          void _e;
        }
        UI.syncModeAndCostUI(this);
        UI.resetOtherUI(this, 'isoline');
      });
    }

    // Isoline controls
    const isoDirBtns =
      this._isolineDirectionButtons || Array.from(this._panel.querySelectorAll('.rp-isoline-direction-btn') || []);
    isoDirBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const newDir = btn.dataset.direction;
        // If direction unchanged, refresh UI/marker but avoid recalculation
        const wasSame = this._isoline.direction === newDir;
        this._isoline.direction = newDir;
        isoDirBtns.forEach((b) => b.classList.toggle('active', b === btn));
        // Update marker color immediately so UI reflects the selected direction
        const color =
          this._isoline.direction === 'from' ? this._options.startColor : this._options.endColor;
        try {
          const mk = this._markers.isoline;
          if (mk && typeof mk.getElement === 'function') {
            const el = mk.getElement();
            if (el && el.style) el.style.background = color;
          }
        } catch (_e) {
          void _e;
        }
        if (this._isolinePointIconEl && this._isolinePointIconEl.classList) {
          this._isolinePointIconEl.classList.toggle('rp-point-icon--origin', this._isoline.direction === 'from');
          this._isolinePointIconEl.classList.toggle('rp-point-icon--dest', this._isoline.direction === 'to');
        }

        if (!wasSame && this._isoline.point) this._tryIsoline();
      });
    });

    const isoPoint = this._isolinePointInput;
    if (isoPoint) {
      isoPoint.addEventListener('change', () => {
        const coords = parseCoords(isoPoint.value || '');
        if (coords) {
          this._isoline.point = coords;
          this._placeIsolineMarker(coords);
          this._tryIsoline();
        }
      });
    }

    // Bind isoline-specific mode/cost controls (scoped to isoline panel)
    const isoModeBtns =
      this._isolineModeButtons || Array.from(isolinePanel?.querySelectorAll('.rp-mode-btn') || []);
    isoModeBtns.forEach((b) => {
      b.addEventListener('click', () => {
        const newMode = b.dataset.mode;
        // If mode unchanged, refresh UI state only
        if (this._mode === newMode) {
          isoModeBtns.forEach((bb) => {
            const isActive = bb === b;
            bb.classList.toggle('active', isActive);
            bb.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          });
          UI.syncModeAndCostUI(this);
          return;
        }
        this._mode = newMode;
        isoModeBtns.forEach((bb) => {
          const isActive = bb === b;
          bb.classList.toggle('active', isActive);
          bb.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        UI.syncModeAndCostUI(this);
        this._tryIsoline();
      });
    });

    const isoCostBtns =
      this._isolineCostButtons || Array.from(isolinePanel?.querySelectorAll('.rp-cost-btn') || []);
    isoCostBtns.forEach((b) => {
      b.addEventListener('click', () => {
        const newCost = b.dataset.costField;
        // If the cost selection didn't change, just refresh UI/threshold
        if (this._costField === newCost) {
          isoCostBtns.forEach((bb) => {
            const isActive = bb === b;
            bb.classList.toggle('active', isActive);
            bb.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          });
          UI.syncModeAndCostUI(this);
          return;
        }
        this._costField = newCost;
        isoCostBtns.forEach((bb) => {
          const isActive = bb === b;
          bb.classList.toggle('active', isActive);
          bb.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        UI.syncModeAndCostUI(this);
        this._tryIsoline();
      });
    });

    const isoThreshold =
      this._isolineThresholdInput || isolinePanel?.querySelector('#rp-isoline-threshold');
    if (isoThreshold) {
      const handleIsoThresholdChange = () => {
        const raw = Number(isoThreshold.value || 0);
        if (!Number.isFinite(raw) || raw < 0) return;
        // Convert minutes -> seconds for travelTime/optimal, otherwise meters
        if (this._costField === 'travelTime' || this._costField === 'optimal') {
          this._isoline.maxCost = raw * 60;
        } else {
          this._isoline.maxCost = raw;
        }
        this._tryIsoline();
      };
      // Trigger recalculation immediately on input changes (not just on blur/enter)
      isoThreshold.addEventListener('input', handleIsoThresholdChange);
      isoThreshold.addEventListener('change', handleIsoThresholdChange);
    }
  }

  _updateIsolineThresholdUI() {
    return UI.updateIsolineThresholdUI(this);
  }

  _setupRouteSource() {
    return MapModule.setupRouteSource(this);
  }

  _removeRouteLayers() {
    return MapModule.removeRouteLayers(this);
  }

  _placeMarker(type, lngLat) {
    return MapModule.placeMarker(this, type, lngLat);
  }

  _placeIsolineMarker(lngLat) {
    return MapModule.placeIsolineMarker(this, lngLat);
  }

  _clearIsoline() {
    return MapModule.clearIsoline(this);
  }

  /**
   * Delegate isoline computation to the core UI module.
   * @returns {Promise<void>}
   */
  async _tryIsoline() {
    return Core.tryIsoline(this);
  }

  _consumeMapPointerSuppression() {
    if (!this._suppressNextMapPointerSet) return false;
    this._suppressNextMapPointerSet = false;
    return true;
  }

  /**
   * Swap origin and destination and recompute the route.
   */
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

  /**
   * Set the visible status message for the active control tab.
   * @param {string} html Status text or HTML.
   * @param {string} [cls] Optional status CSS class.
   */
  _setStatus(html, cls = '') {
    // Choose the status element for the currently active tab, falling back
    // to whichever status element exists. Clear the other to avoid stale
    // messages appearing in the hidden panel.
    const target =
      this._activeTab === 'isoline'
        ? this._statusElIsoline || this._statusEl
        : this._statusEl || this._statusElIsoline;
    if (!target) return;

    const other = target === this._statusEl ? this._statusElIsoline : this._statusEl;

    target.className = `rp-status${cls ? ' ' + cls : ''}`;
    if (cls === 'loading') {
      const spinnerHtml = '<span class="rp-spinner"></span>';
      const hasSpinner = /rp-spinner/.test(String(html));
      target.innerHTML = hasSpinner ? String(html) : `${spinnerHtml}${String(html)}`;
    } else {
      target.textContent = html;
    }
    target.hidden = !html;

    if (other && other !== target) {
      other.textContent = '';
      other.hidden = true;
      other.className = 'rp-status';
    }
  }

  _showStats(result) {
    return UI.showStats(this, result);
  }

  _formatDurationSeconds(seconds) {
    return UI.formatDurationSeconds(seconds);
  }

  _hideStats() {
    this._statsEl.hidden = true;
    this._engineBadgeEl.hidden = true;
  }

  _clearRoute() {
    return MapModule.clearRoute(this);
  }

  _clearGraph() {
    return MapModule.clearGraph(this);
  }

  /**
   * Delegate route computation to the core UI module.
   * @returns {Promise<void>}
   */
  async _tryRoute() {
    return Core.tryRoute(this);
  }

  _handleRouteFailure(result) {
    return Core.handleRouteFailure(this, result);
  }

  _buildGraphGeoJSON(graph) {
    return Core.buildGraphGeoJSON(graph);
  }

  /**
   * Center the map view on a named GeoJSON source.
   * @param {string} sourceId Map source id.
   * @param {object} [fitOptions] Map fitBounds options.
   * @returns {Promise<void>|undefined}
   */
  _centerMapOnSource(sourceId, fitOptions = { padding: 100, maxZoom: 16, duration: 600 }) {
    try {
      console.log('[dbg] _centerMapOnSource delegator called', {
        sourceId,
        mapPresent: !!this._map,
      });
    } catch (_e) {
      void _e;
    }
    return MapModule.centerMapOnSource(this, sourceId, fitOptions);
  }
}

export { parseCoords };
