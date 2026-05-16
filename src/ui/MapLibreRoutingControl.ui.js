import {
  fmtDistance,
  formatDuration,
  formatEngineBadgeName,
  getEngineBadgeIcon,
  fmtTime,
} from './MapLibreRoutingControl.core.js';

/**
 * Build the interactive control panel HTML for routing and isoline features.
 * @param {object} ctrl Control instance containing localization and state.
 * @returns {string} HTML markup for the control panel.
 */
export function buildPanelMarkup(ctrl) {
  const routingHtml = `

      <div class="rp-modes" style="--rp-columns:3">
        <button type="button" class="rp-mode-btn" data-mode="pedestrian" aria-pressed="false" title="${ctrl._text.modeTitles.pedestrian}">
          <span class="rp-mode-icon">🚶</span>
          <span class="rp-mode-label rp-btn-label"><span class="rp-label-measure">${ctrl._text.modes.pedestrian}</span><span class="rp-label-visible">${ctrl._text.modes.pedestrian}</span></span>
        </button>
        <button type="button" class="rp-mode-btn active" data-mode="car" aria-pressed="true" title="${ctrl._text.modeTitles.car}">
          <span class="rp-mode-icon">🚗</span>
          <span class="rp-mode-label rp-btn-label"><span class="rp-label-measure">${ctrl._text.modes.car}</span><span class="rp-label-visible">${ctrl._text.modes.car}</span></span>
        </button>
        <button type="button" class="rp-mode-btn" data-mode="bicycle" aria-pressed="false" title="${ctrl._text.modeTitles.bicycle}">
          <span class="rp-mode-icon">🚲</span>
          <span class="rp-mode-label rp-btn-label"><span class="rp-label-measure">${ctrl._text.modes.bicycle}</span><span class="rp-label-visible">${ctrl._text.modes.bicycle}</span></span>
        </button>
      </div>

      <div class="rp-section">
        <div class="rp-modes rp-costs" style="--rp-columns:3">
          <button type="button" class="rp-cost-btn active" data-cost-field="distance" aria-pressed="true" title="${ctrl._text.costTitles.distance}">
            <span class="rp-btn-label"><span class="rp-label-measure">${ctrl._text.costLabels.distance}</span><span class="rp-label-visible">${ctrl._text.costLabels.distance}</span></span>
          </button>
          <button type="button" class="rp-cost-btn" data-cost-field="travelTime" aria-pressed="false" title="${ctrl._text.costTitles.travelTime}">
            <span class="rp-btn-label"><span class="rp-label-measure">${ctrl._text.costLabels.travelTime}</span><span class="rp-label-visible">${ctrl._text.costLabels.travelTime}</span></span>
          </button>
          <button type="button" class="rp-cost-btn" data-cost-field="optimal" aria-pressed="false" title="${ctrl._text.costTitles.optimal}">
            <span class="rp-btn-label"><span class="rp-label-measure">${ctrl._text.costLabels.optimal}</span><span class="rp-label-visible">${ctrl._text.costLabels.optimal}</span></span>
          </button>
        </div>
        <div class="rp-inputs">
          <div class="rp-input-row">
            <svg class="rp-point-icon rp-point-icon--origin" viewBox="0 0 10 10">
              <circle cx="5" cy="5" r="4.5"/>
            </svg>
            <input id="rp-origin" type="text" placeholder="${ctrl._text.originPlaceholder}" autocomplete="off" spellcheck="false" />
          </div>
          <div class="rp-swap-wrap">
            <button type="button" class="rp-swap-btn" id="rp-swap-btn" title="${ctrl._text.reverseRoute}" aria-label="${ctrl._text.reverseRoute}"><span class="rp-btn-label"><span class="rp-label-measure">⇅</span><span class="rp-label-visible">⇅</span></span></button>
          </div>
          <div class="rp-input-row">
            <svg class="rp-point-icon rp-point-icon--dest" viewBox="0 0 10 10">
              <circle cx="5" cy="5" r="4.5"/>
            </svg>
            <input id="rp-dest" type="text" placeholder="${ctrl._text.destinationPlaceholder}" autocomplete="off" spellcheck="false" />
          </div>
        </div>
      </div>

      <div class="rp-hint">
        <span class="rp-hint-item"><span class="rp-hint-key">${ctrl._text.leftClick}</span> ${ctrl._text.setOrigin}</span>
        <span class="rp-hint-sep">·</span>
        <span class="rp-hint-item"><span class="rp-hint-key">${ctrl._text.rightClick}</span> ${ctrl._text.setDestination}</span>
      </div>

      <div class="rp-stats" id="rp-stats" hidden>
        <div class="rp-stat">
          <span class="rp-stat-value" id="rp-stat-dist">—</span>
          <span class="rp-stat-label" id="rp-stat-dist-label">${ctrl._text.stats.distance}</span>
        </div>
        <div class="rp-stat-divider"></div>
        <div class="rp-stat">
          <span class="rp-stat-value" id="rp-stat-time">—</span>
          <span class="rp-stat-label" id="rp-stat-time-label">${ctrl._text.stats.estTime}</span>
        </div>
      </div>

      <div class="rp-engine" id="rp-engine" hidden></div>
      <div class="rp-status" id="rp-status" role="status" aria-live="polite" hidden></div>
    `;

  const isoThresholdDisplay =
    ctrl._costField === 'travelTime' || ctrl._costField === 'optimal'
      ? Math.round((Number(ctrl._isoline.maxCost) || 0) / 60)
      : Number(ctrl._isoline.maxCost) || 0;
  const isoThresholdUnit =
    ctrl._costField === 'travelTime' || ctrl._costField === 'optimal' ? 'min' : 'm';

  const isolineHtml = `
      <div class="rp-section" id="rp-isoline-controls">

        <div class="rp-modes">
          <button type="button" class="rp-mode-btn ${ctrl._mode === 'pedestrian' ? '' : ''}" data-mode="pedestrian" aria-pressed="false" title="${ctrl._text.modeTitles?.pedestrian || ''}">
            <span class="rp-mode-icon">🚶</span>
            <span class="rp-mode-label rp-btn-label"><span class="rp-label-measure">${ctrl._text.modes?.pedestrian || 'Pedestrian'}</span><span class="rp-label-visible">${ctrl._text.modes?.pedestrian || 'Pedestrian'}</span></span>
          </button>
          <button type="button" class="rp-mode-btn ${ctrl._mode === 'car' ? 'active' : ''}" data-mode="car" aria-pressed="${ctrl._mode === 'car' ? 'true' : 'false'}" title="${ctrl._text.modeTitles?.car || ''}">
            <span class="rp-mode-icon">🚗</span>
            <span class="rp-mode-label rp-btn-label"><span class="rp-label-measure">${ctrl._text.modes?.car || 'Car'}</span><span class="rp-label-visible">${ctrl._text.modes?.car || 'Car'}</span></span>
          </button>
          <button type="button" class="rp-mode-btn ${ctrl._mode === 'bicycle' ? '' : ''}" data-mode="bicycle" aria-pressed="false" title="${ctrl._text.modeTitles?.bicycle || ''}">
            <span class="rp-mode-icon">🚲</span>
            <span class="rp-mode-label rp-btn-label"><span class="rp-label-measure">${ctrl._text.modes?.bicycle || 'Bicycle'}</span><span class="rp-label-visible">${ctrl._text.modes?.bicycle || 'Bicycle'}</span></span>
          </button>
        </div>

        
        <div class="rp-modes rp-costs" style="--rp-columns:3">
          <button type="button" class="rp-cost-btn ${ctrl._costField === 'distance' ? 'active' : ''}" data-cost-field="distance" aria-pressed="${ctrl._costField === 'distance' ? 'true' : 'false'}" title="${ctrl._text.costTitles?.distance || ''}">
            <span class="rp-btn-label"><span class="rp-label-measure">${ctrl._text.costLabels?.distance || 'Distance'}</span><span class="rp-label-visible">${ctrl._text.costLabels?.distance || 'Distance'}</span></span>
          </button>
          <button type="button" class="rp-cost-btn ${ctrl._costField === 'travelTime' ? 'active' : ''}" data-cost-field="travelTime" aria-pressed="${ctrl._costField === 'travelTime' ? 'true' : 'false'}" title="${ctrl._text.costTitles?.travelTime || ''}">
            <span class="rp-btn-label"><span class="rp-label-measure">${ctrl._text.costLabels?.travelTime || 'Time'}</span><span class="rp-label-visible">${ctrl._text.costLabels?.travelTime || 'Time'}</span></span>
          </button>
          <button type="button" class="rp-cost-btn ${ctrl._costField === 'optimal' ? 'active' : ''}" data-cost-field="optimal" aria-pressed="${ctrl._costField === 'optimal' ? 'true' : 'false'}" title="${ctrl._text.costTitles?.optimal || ''}">
            <span class="rp-btn-label"><span class="rp-label-measure">${ctrl._text.costLabels?.optimal || 'Optimal'}</span><span class="rp-label-visible">${ctrl._text.costLabels?.optimal || 'Optimal'}</span></span>
          </button>
        </div>

        <div class="rp-modes rp-costs" style="--rp-columns:2">
          <button type="button" class="rp-isoline-direction-btn ${ctrl._isoline && ctrl._isoline.direction === 'from' ? 'active' : ''}" data-direction="from" aria-pressed="${ctrl._isoline && ctrl._isoline.direction === 'from' ? 'true' : 'false'}"><span class="rp-btn-label"><span class="rp-label-measure">${ctrl._text.isoline?.from || 'From'}</span><span class="rp-label-visible">${ctrl._text.isoline?.from || 'From'}</span></span></button>
          <button type="button" class="rp-isoline-direction-btn ${ctrl._isoline && ctrl._isoline.direction === 'to' ? 'active' : ''}" data-direction="to" aria-pressed="${ctrl._isoline && ctrl._isoline.direction === 'to' ? 'true' : 'false'}"><span class="rp-btn-label"><span class="rp-label-measure">${ctrl._text.isoline?.to || 'To'}</span><span class="rp-label-visible">${ctrl._text.isoline?.to || 'To'}</span></span></button>
        </div>

        <div class="rp-inputs">
          <div class="rp-input-row">
            <svg class="rp-point-icon ${ctrl._isoline.direction === 'to' ? 'rp-point-icon--dest' : 'rp-point-icon--origin'}" viewBox="0 0 10 10">
              <circle cx="5" cy="5" r="4.5"/>
            </svg>
            <input id="rp-isoline-point" type="text" placeholder="${ctrl._text.isoline?.pointPlaceholder || 'lat, lng'}" autocomplete="off" spellcheck="false" />
          </div>
          <div class="rp-input-row">
            <input id="rp-isoline-threshold" type="number" min="0" value="${isoThresholdDisplay}" />
            <span id="rp-isoline-threshold-unit" class="rp-threshold-unit">${isoThresholdUnit}</span>
          </div>
        </div>
      </div>
      <div class="rp-hint">${ctrl._text.isoline?.hint || ''}</div>
      <div class="rp-status" id="rp-status-isoline" role="status" aria-live="polite" hidden></div>
    `;

  if (ctrl._features === 'both') {
    const routingActive = ctrl._activeTab === 'routing';
    const isolineActive = ctrl._activeTab === 'isoline';
    return `
        <div class="rp-modes" style="--rp-columns:2">
          <button type="button" id="rp-tab-routing" class="rp-tab-btn ${routingActive ? 'active' : ''}"><span class="rp-btn-label"><span class="rp-label-measure">${ctrl._text.tabs?.routing || 'Routing'}</span><span class="rp-label-visible">${ctrl._text.tabs?.routing || 'Routing'}</span></span></button>
          <button type="button" id="rp-tab-isoline" class="rp-tab-btn ${isolineActive ? 'active' : ''}"><span class="rp-btn-label"><span class="rp-label-measure">${ctrl._text.tabs?.isolines || 'Isolines'}</span><span class="rp-label-visible">${ctrl._text.tabs?.isolines || 'Isolines'}</span></span></button>
        </div>
        <div id="rp-routing-panel" ${routingActive ? '' : 'hidden'}>
          ${routingHtml}
        </div>
        <div id="rp-isoline-panel" ${isolineActive ? '' : 'hidden'}>
          ${isolineHtml}
        </div>
      `;
  }

  if (ctrl._features === 'isolines') {
    return `${ctrl._text.title ? `<span class="rp-title">${ctrl._text.title}</span>` : ''}${isolineHtml}`;
  }

  return routingHtml;
}

/**
 * Synchronize the isoline threshold input and unit label with the selected cost mode.
 * @param {object} ctrl Control instance.
 */
export function updateIsolineThresholdUI(ctrl) {
  try {
    const isoPanel =
      ctrl._panel && ctrl._panel.querySelector
        ? ctrl._panel.querySelector('#rp-isoline-panel')
        : null;
    if (!isoPanel) return;
    const isoThreshold = isoPanel.querySelector('#rp-isoline-threshold');
    const isoUnit = isoPanel.querySelector('#rp-isoline-threshold-unit');
    if (!isoThreshold || !isoUnit) return;
    if (ctrl._costField === 'travelTime' || ctrl._costField === 'optimal') {
      isoUnit.textContent = 'min';
      isoThreshold.value = Number.isFinite(ctrl._isoline.maxCost)
        ? Math.round(ctrl._isoline.maxCost / 60)
        : '';
    } else {
      isoUnit.textContent = 'm';
      isoThreshold.value = Number.isFinite(ctrl._isoline.maxCost) ? ctrl._isoline.maxCost : '';
    }
  } catch (_e) {
    void _e;
  }
}

/**
 * Update the visible status message for the current active tab.
 * @param {object} ctrl Control instance.
 * @param {string} html Status text or HTML.
 * @param {string} [cls] Optional CSS class for status styling.
 */
export function setStatus(ctrl, html, cls = '') {
  const target =
    ctrl._activeTab === 'isoline'
      ? ctrl._statusElIsoline || ctrl._statusEl
      : ctrl._statusEl || ctrl._statusElIsoline;
  if (!target) return;

  const other = target === ctrl._statusEl ? ctrl._statusElIsoline : ctrl._statusEl;

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

/**
 * Render route statistics and engine badge details in the control panel.
 * @param {object} ctrl Control instance.
 * @param {object} result Route result object.
 */
export function showStats(ctrl, result) {
  if (
    !ctrl._statsEl ||
    !ctrl._statDistEl ||
    !ctrl._statTimeEl ||
    !ctrl._statDistLabelEl ||
    !ctrl._statTimeLabelEl ||
    !ctrl._engineBadgeEl
  ) {
    console.warn('[omt-router] skipping stats update because the control panel is not mounted');
    return;
  }

  const distanceM =
    result.costField === 'distance' ? result.cost : getRouteDistanceFallback(result.coordinates);
  const timeText =
    result.costField !== 'distance'
      ? formatDurationSeconds(result.cost)
      : fmtTime(distanceM, ctrl._mode);
  const engine = result.engine ?? 'cpu';
  const parallelUsed = Boolean(result.parallelUsed);

  ctrl._statDistEl.textContent = fmtDistance(distanceM);
  ctrl._statTimeEl.textContent = timeText;
  ctrl._statDistLabelEl.textContent = ctrl._text.stats.distance;
  ctrl._statTimeLabelEl.textContent =
    ctrl._costField === 'distance' ? ctrl._text.stats.estTime : ctrl._text.stats.travelTime;
  ctrl._statsEl.hidden = false;
  ctrl._engineBadgeEl.className = `rp-engine ${parallelUsed ? 'rp-engine--parallel' : 'rp-engine--cpu'}`;
  const costLabel = ctrl._text.costLabels[ctrl._costField] ?? ctrl._text.costLabels.distance;
  const engineLabel = formatEngineBadgeName(engine);
  ctrl._engineBadgeEl.innerHTML = `${getEngineBadgeIcon(parallelUsed)}${engineLabel} · ${costLabel}`;
  ctrl._engineBadgeEl.hidden = false;
}

/**
 * Fallback distance calculation when route result lacks explicit distance.
 * @param {Array<number[]>} coords Route coordinates.
 * @returns {number} Total distance in meters.
 */
function getRouteDistanceFallback(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const dLat = (b[1] - a[1]) * (Math.PI / 180);
    const dLng = (b[0] - a[0]) * (Math.PI / 180);
    const lat1Rad = a[1] * (Math.PI / 180);
    const lat2Rad = b[1] * (Math.PI / 180);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1Rad) * Math.cos(lat2Rad) * sinDLng * sinDLng;
    total += 2 * 6371000 * Math.asin(Math.sqrt(h));
  }
  return total;
}

/**
 * Format isoline duration seconds into a readable duration label.
 * @param {number} seconds Duration in seconds.
 * @returns {string}
 */
export function formatDurationSeconds(seconds) {
  return formatDuration(Math.round(seconds / 60));
}

/**
 * Reflect selected travel mode, cost field, and isoline direction in the panel UI.
 * @param {object} ctrl Control instance.
 */
export function syncModeAndCostUI(ctrl) {
  try {
    if (!ctrl || !ctrl._panel) return;

    const routingPanel = ctrl._panel.querySelector('#rp-routing-panel');
    const isolinePanel = ctrl._panel.querySelector('#rp-isoline-panel');
    const panels = [];
    if (routingPanel) panels.push(routingPanel);
    if (isolinePanel) panels.push(isolinePanel);

    panels.forEach((panel) => {
      const modeBtns = panel.querySelectorAll('.rp-mode-btn');
      modeBtns.forEach((b) => {
        const isActive = b.dataset.mode === ctrl._mode;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });

      const costBtns = panel.querySelectorAll('.rp-cost-btn');
      costBtns.forEach((b) => {
        const isActive = b.dataset.costField === ctrl._costField;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });

      // sync isoline direction buttons when present
      const isoDirBtns = panel.querySelectorAll('.rp-isoline-direction-btn');
      isoDirBtns.forEach((b) => {
        const isActive = ctrl._isoline && b.dataset.direction === ctrl._isoline.direction;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    });

    // Ensure isoline threshold UI matches the selected costField
    updateIsolineThresholdUI(ctrl);
  } catch (_e) {
    void _e;
  }
}

/**
 * Reset inputs and status for the inactive control mode when tabs switch.
 * @param {object} ctrl Control instance.
 * @param {'routing'|'isoline'} activeTab Currently active tab name.
 */
export function resetOtherUI(ctrl, activeTab) {
  try {
    if (!ctrl || !ctrl._panel) return;

    if (activeTab === 'routing') {
      // Reset isoline inputs/state (keep mode/cost)
      // Derive default isoline max cost based on currently selected costField
      const _optIso = ctrl._options.isolineMaxCost;
      const _defaultIso = Number.isFinite(Number(_optIso))
        ? Number(_optIso)
        : ctrl._costField === 'travelTime' || ctrl._costField === 'optimal'
          ? 15 * 60
          : 100;
      ctrl._isoline = ctrl._isoline || { point: null, direction: 'from', maxCost: _defaultIso };
      ctrl._isoline.point = null;
      ctrl._isoline.direction = 'from';
      ctrl._isoline.maxCost = _defaultIso;

      const isoPanel = ctrl._panel.querySelector('#rp-isoline-panel');
      if (isoPanel) {
        const isoPoint = isoPanel.querySelector('#rp-isoline-point');
        if (isoPoint) isoPoint.value = '';

        const isoThreshold = isoPanel.querySelector('#rp-isoline-threshold');
        const isoUnit = isoPanel.querySelector('#rp-isoline-threshold-unit');
        if (isoThreshold && isoUnit) {
          if (ctrl._costField === 'travelTime' || ctrl._costField === 'optimal') {
            isoUnit.textContent = 'min';
            isoThreshold.value = Number.isFinite(ctrl._isoline.maxCost)
              ? Math.round(ctrl._isoline.maxCost / 60)
              : '';
          } else {
            isoUnit.textContent = 'm';
            isoThreshold.value = Number.isFinite(ctrl._isoline.maxCost)
              ? ctrl._isoline.maxCost
              : '';
          }
        }

        const isoDirBtns = isoPanel.querySelectorAll('.rp-isoline-direction-btn');
        isoDirBtns.forEach((b) => {
          const isActive = b.dataset.direction === 'from';
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        const svg = isoPanel.querySelector('.rp-point-icon');
        if (svg && svg.classList) {
          svg.classList.toggle('rp-point-icon--origin', true);
          svg.classList.toggle('rp-point-icon--dest', false);
        }

        const statusIso = isoPanel.querySelector('#rp-status-isoline') || ctrl._statusElIsoline;
        if (statusIso) {
          statusIso.textContent = '';
          statusIso.hidden = true;
          statusIso.className = 'rp-status';
        }
      }
    } else if (activeTab === 'isoline') {
      // Reset routing inputs/state (keep mode/cost)
      ctrl._origin = null;
      ctrl._dest = null;
      if (ctrl._originInput) ctrl._originInput.value = '';
      if (ctrl._destInput) ctrl._destInput.value = '';

      if (ctrl._statsEl) ctrl._statsEl.hidden = true;
      if (ctrl._engineBadgeEl) ctrl._engineBadgeEl.hidden = true;

      const statusRoute = ctrl._statusEl || null;
      if (statusRoute) {
        statusRoute.textContent = '';
        statusRoute.hidden = true;
        statusRoute.className = 'rp-status';
      }
    }
  } catch (_e) {
    void _e;
  }
}
