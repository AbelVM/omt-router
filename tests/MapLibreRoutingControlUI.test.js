import { describe, expect, it, vi } from 'vitest';
import {
  buildPanelMarkup,
  updateIsolineThresholdUI,
  setStatus,
  showStats,
  syncModeAndCostUI,
  resetOtherUI,
} from '../src/ui/MapLibreRoutingControl.ui.js';

function createElementStub() {
  return {
    className: '',
    hidden: false,
    innerHTML: '',
    textContent: '',
    value: '',
    classList: {
      add: vi.fn(),
      toggle: vi.fn(),
    },
    setAttribute: vi.fn(),
    querySelector: vi.fn(() => null),
  };
}

describe('MapLibreRoutingControl UI helpers', () => {
  it('builds a combined panel markup with tabs when features is both', () => {
    const ctrl = {
      _features: 'both',
      _activeTab: 'routing',
      _mode: 'car',
      _costField: 'distance',
      _isoline: { direction: 'from', maxCost: 100 },
      _text: {
        modeTitles: { pedestrian: 'Ped', car: 'Car', bicycle: 'Bike' },
        modes: { pedestrian: 'Ped', car: 'Car', bicycle: 'Bike' },
        costTitles: { distance: 'Dist', travelTime: 'Time', optimal: 'Opt' },
        costLabels: { distance: 'Dist', travelTime: 'Time', optimal: 'Opt' },
        originPlaceholder: 'Origin',
        reverseRoute: 'Swap',
        destinationPlaceholder: 'Dest',
        leftClick: 'Left click',
        setOrigin: 'Set origin',
        rightClick: 'Right click',
        setDestination: 'Set dest',
        stats: { distance: 'Distance', estTime: 'Time' },
        estTime: 'Time',
        tabs: { routing: 'Routing', isolines: 'Isolines' },
      },
    };

    const html = buildPanelMarkup(ctrl);

    expect(html).toContain('id="rp-tab-routing"');
    expect(html).toContain('id="rp-tab-isoline"');
    expect(html).toContain('id="rp-isoline-panel"');
    expect(html).toContain('id="rp-routing-panel"');
  });

  it('builds isoline-only markup when features is isolines', () => {
    const ctrl = {
      _features: 'isolines',
      _activeTab: 'isoline',
      _mode: 'car',
      _costField: 'distance',
      _isoline: { direction: 'from', maxCost: 100 },
      _text: {
        modeTitles: { pedestrian: 'Ped', car: 'Car', bicycle: 'Bike' },
        modes: { pedestrian: 'Ped', car: 'Car', bicycle: 'Bike' },
        costTitles: { distance: 'Dist', travelTime: 'Time', optimal: 'Opt' },
        costLabels: { distance: 'Dist', travelTime: 'Time', optimal: 'Opt' },
        isoline: { pointPlaceholder: 'Point', hint: 'Hint', from: 'From', to: 'To' },
        stats: { distance: 'Distance', estTime: 'Time' },
        tabs: { routing: 'Routing', isolines: 'Isolines' },
      },
    };

    const html = buildPanelMarkup(ctrl);

    expect(html).not.toContain('id="rp-tab-routing"');
    expect(html).toContain('id="rp-isoline-threshold"');
  });

  it('updates isoline threshold UI for travelTime and distance modes', () => {
    const threshold = { value: '' };
    const unit = { textContent: '' };
    const isoPanel = {
      querySelector: (selector) => (selector === '#rp-isoline-threshold' ? threshold : unit),
    };
    const ctrl = {
      _panel: { querySelector: (selector) => (selector === '#rp-isoline-panel' ? isoPanel : null) },
      _costField: 'travelTime',
      _isoline: { maxCost: 300 },
    };

    updateIsolineThresholdUI(ctrl);
    expect(threshold.value).toBe(5);
    expect(unit.textContent).toBe('min');

    ctrl._costField = 'distance';
    ctrl._isoline.maxCost = 450;
    updateIsolineThresholdUI(ctrl);
    expect(threshold.value).toBe(450);
    expect(unit.textContent).toBe('m');
  });

  it('does not throw when the isoline panel is missing during threshold updates', () => {
    const ctrl = {
      _panel: { querySelector: () => null },
      _costField: 'distance',
      _isoline: { maxCost: 100 },
    };
    expect(() => updateIsolineThresholdUI(ctrl)).not.toThrow();
  });

  it('sets status on the correct panel and clears the other panel status', () => {
    const status = { className: '', innerHTML: '', textContent: '', hidden: false };
    const statusIso = { className: '', innerHTML: '', textContent: '', hidden: false };
    const ctrl = { _activeTab: 'routing', _statusEl: status, _statusElIsoline: statusIso };

    setStatus(ctrl, 'Working', 'loading');
    expect(status.className).toContain('loading');
    expect(status.innerHTML).toContain('rp-spinner');
    expect(status.hidden).toBe(false);
    expect(statusIso.hidden).toBe(true);
    expect(statusIso.textContent).toBe('');

    ctrl._activeTab = 'isoline';
    setStatus(ctrl, 'Paused', 'error');
    expect(statusIso.textContent).toBe('Paused');
    expect(statusIso.className).toContain('error');
    expect(status.hidden).toBe(true);
  });

  it('renders stats for both distance and travel time results', () => {
    const ctrl = {
      _statsEl: createElementStub(),
      _statDistEl: createElementStub(),
      _statTimeEl: createElementStub(),
      _statDistLabelEl: createElementStub(),
      _statTimeLabelEl: createElementStub(),
      _engineBadgeEl: createElementStub(),
      _mode: 'car',
      _costField: 'distance',
      _text: {
        stats: { distance: 'Distance', estTime: 'Time', travelTime: 'Travel time' },
        costLabels: { distance: 'Distance', travelTime: 'Time', optimal: 'Optimal' },
      },
    };

    showStats(ctrl, {
      costField: 'distance',
      coordinates: [
        [0, 0],
        [1, 0],
      ],
      engine: 'cpu',
      parallelUsed: false,
      cost: 1200,
    });

    expect(ctrl._statsEl.hidden).toBe(false);
    expect(ctrl._engineBadgeEl.hidden).toBe(false);
    expect(ctrl._engineBadgeEl.className).toContain('cpu');
    expect(ctrl._statDistLabelEl.textContent).toBe('Distance');

    ctrl._costField = 'travelTime';
    showStats(ctrl, {
      costField: 'travelTime',
      cost: 420,
      coordinates: [
        [0, 0],
        [0, 0],
      ],
      engine: 'gpu',
      parallelUsed: true,
    });

    expect(ctrl._statTimeLabelEl.textContent).toBe('Travel time');
    expect(ctrl._engineBadgeEl.className).toContain('parallel');
  });

  it('syncs mode, cost, and isoline direction UI state correctly', () => {
    const panel = {
      querySelectorAll: (selector) => {
        if (selector === '.rp-mode-btn') {
          return [
            { dataset: { mode: 'car' }, classList: { toggle: vi.fn() }, setAttribute: vi.fn() },
            {
              dataset: { mode: 'pedestrian' },
              classList: { toggle: vi.fn() },
              setAttribute: vi.fn(),
            },
          ];
        }
        if (selector === '.rp-cost-btn') {
          return [
            {
              dataset: { costField: 'distance' },
              classList: { toggle: vi.fn() },
              setAttribute: vi.fn(),
            },
            {
              dataset: { costField: 'travelTime' },
              classList: { toggle: vi.fn() },
              setAttribute: vi.fn(),
            },
          ];
        }
        if (selector === '.rp-isoline-direction-btn') {
          return [
            {
              dataset: { direction: 'from' },
              classList: { toggle: vi.fn() },
              setAttribute: vi.fn(),
            },
            { dataset: { direction: 'to' }, classList: { toggle: vi.fn() }, setAttribute: vi.fn() },
          ];
        }
        return [];
      },
    };

    const ctrl = {
      _panel: panel,
      _mode: 'car',
      _costField: 'distance',
      _isoline: { direction: 'from' },
    };

    expect(() => syncModeAndCostUI(ctrl)).not.toThrow();
  });

  it('syncs mode and cost button state across routing and isoline tabs', () => {
    const routingModeBtn = { dataset: { mode: 'car' }, classList: { toggle: vi.fn() }, setAttribute: vi.fn() };
    const isolineModeBtn = { dataset: { mode: 'car' }, classList: { toggle: vi.fn() }, setAttribute: vi.fn() };
    const routingCostBtn = { dataset: { costField: 'travelTime' }, classList: { toggle: vi.fn() }, setAttribute: vi.fn() };
    const isolineCostBtn = { dataset: { costField: 'travelTime' }, classList: { toggle: vi.fn() }, setAttribute: vi.fn() };
    const panel = {
      querySelectorAll: (selector) => {
        if (selector === '.rp-mode-btn') return [routingModeBtn, isolineModeBtn];
        if (selector === '.rp-cost-btn') return [routingCostBtn, isolineCostBtn];
        if (selector === '.rp-isoline-direction-btn') return [];
        return [];
      },
    };
    const ctrl = {
      _panel: panel,
      _mode: 'car',
      _costField: 'travelTime',
      _isoline: { direction: 'from' },
      _modeButtons: [routingModeBtn],
      _costButtons: [routingCostBtn],
      _isolineModeButtons: [isolineModeBtn],
      _isolineCostButtons: [isolineCostBtn],
    };

    syncModeAndCostUI(ctrl);

    expect(routingModeBtn.classList.toggle).toHaveBeenCalledWith('active', true);
    expect(isolineModeBtn.classList.toggle).toHaveBeenCalledWith('active', true);
    expect(routingCostBtn.classList.toggle).toHaveBeenCalledWith('active', true);
    expect(isolineCostBtn.classList.toggle).toHaveBeenCalledWith('active', true);
    expect(routingModeBtn.setAttribute).toHaveBeenCalledWith('aria-pressed', 'true');
    expect(isolineModeBtn.setAttribute).toHaveBeenCalledWith('aria-pressed', 'true');
    expect(routingCostBtn.setAttribute).toHaveBeenCalledWith('aria-pressed', 'true');
    expect(isolineCostBtn.setAttribute).toHaveBeenCalledWith('aria-pressed', 'true');
  });

  it('resets other UI state when switching tabs', () => {
    const statusIso = { textContent: 'bad', hidden: false, className: 'rp-status error' };
    const isoPanel = {
      querySelector: (selector) => {
        if (selector === '#rp-isoline-point') return { value: 'foo' };
        if (selector === '#rp-isoline-threshold') return { value: '10' };
        if (selector === '#rp-isoline-threshold-unit') return { textContent: '' };
        if (selector === '.rp-point-icon') return { classList: { toggle: vi.fn() } };
        if (selector === '#rp-status-isoline') return statusIso;
        return null;
      },
      querySelectorAll: () => [
        { dataset: { direction: 'from' }, classList: { toggle: vi.fn() }, setAttribute: vi.fn() },
        { dataset: { direction: 'to' }, classList: { toggle: vi.fn() }, setAttribute: vi.fn() },
      ],
    };
    const ctrl = {
      _panel: { querySelector: (selector) => (selector === '#rp-isoline-panel' ? isoPanel : null) },
      _options: { isolineMaxCost: 50 },
      _costField: 'distance',
      _isoline: { point: [0, 0], direction: 'to', maxCost: 100 },
      _origin: [0, 0],
      _dest: [1, 1],
      _originInput: { value: 'foo' },
      _destInput: { value: 'bar' },
      _statsEl: { hidden: false },
      _engineBadgeEl: { hidden: false },
      _statusEl: { textContent: 'x', hidden: false, className: 'rp-status error' },
      _statusElIsoline: statusIso,
    };

    expect(() => resetOtherUI(ctrl, 'routing')).not.toThrow();
    expect(ctrl._isoline.point).toBeNull();
    expect(ctrl._statusElIsoline.hidden).toBe(true);

    expect(() => resetOtherUI(ctrl, 'isoline')).not.toThrow();
    expect(ctrl._origin).toBeNull();
    expect(ctrl._dest).toBeNull();
    expect(ctrl._statsEl.hidden).toBe(true);
    expect(ctrl._engineBadgeEl.hidden).toBe(true);
  });
});
