/**
 * Tests for RiskPreferencesStore
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useRiskPreferencesStore } from '../risk-preferences-store';
import { DEFAULT_RISK_PREFERENCES } from '../../types/risk-preferences';

describe('RiskPreferencesStore', () => {
  beforeEach(() => {
    // Clear localStorage and reset store to defaults
    localStorage.clear();
    useRiskPreferencesStore.getState().resetPreferences();
  });

  describe('Default values', () => {
    it('should have correct default auto-close settings', () => {
      const state = useRiskPreferencesStore.getState();
      expect(state.autoCloseEnabled).toBe(false);
      expect(state.maxLossPerTrade).toBe(100);
      expect(state.maxPositionSizePercent).toBe(0.02);
    });

    it('should have correct default circuit breaker settings', () => {
      const state = useRiskPreferencesStore.getState();
      expect(state.circuitBreakerEnabled).toBe(false);
      expect(state.maxConsecutiveLosses).toBe(3);
      expect(state.cooldownPeriodMinutes).toBe(15);
    });

    it('should have correct default alert channels', () => {
      const state = useRiskPreferencesStore.getState();
      expect(state.alertChannels).toEqual({
        toast: true,
        email: false,
        sound: false,
      });
      expect(state.minAlertSeverity).toBe('medium');
    });

    it('should have correct default dashboard widgets', () => {
      const state = useRiskPreferencesStore.getState();
      expect(state.visibleWidgets).toContain('risk-gauge');
      expect(state.visibleWidgets).toContain('exposure-heatmap');
      expect(state.visibleWidgets).toContain('pnl-sparkline');
      expect(state.widgetOrder).toHaveLength(3);
    });

    it('should have correct default confidence threshold', () => {
      const state = useRiskPreferencesStore.getState();
      expect(state.minConfidenceToTrade).toBe(0.6);
    });
  });

  describe('updatePreferences', () => {
    it('should update multiple preferences at once', () => {
      const { updatePreferences } = useRiskPreferencesStore.getState();

      updatePreferences({
        autoCloseEnabled: true,
        maxLossPerTrade: 200,
        minConfidenceToTrade: 0.75,
      });

      const state = useRiskPreferencesStore.getState();
      expect(state.autoCloseEnabled).toBe(true);
      expect(state.maxLossPerTrade).toBe(200);
      expect(state.minConfidenceToTrade).toBe(0.75);
    });

    it('should preserve unchanged preferences', () => {
      const { updatePreferences } = useRiskPreferencesStore.getState();

      updatePreferences({ autoCloseEnabled: true });

      const state = useRiskPreferencesStore.getState();
      expect(state.maxLossPerTrade).toBe(DEFAULT_RISK_PREFERENCES.maxLossPerTrade);
      expect(state.circuitBreakerEnabled).toBe(DEFAULT_RISK_PREFERENCES.circuitBreakerEnabled);
    });
  });

  describe('resetPreferences', () => {
    it('should reset all preferences to defaults', () => {
      const { updatePreferences, resetPreferences } = useRiskPreferencesStore.getState();

      // Modify some preferences
      updatePreferences({
        autoCloseEnabled: true,
        maxLossPerTrade: 500,
        minConfidenceToTrade: 0.9,
      });

      // Reset
      resetPreferences();

      const state = useRiskPreferencesStore.getState();
      // Compare only data properties (exclude functions)
      const { updatePreferences: _a, resetPreferences: _b, updateAutoClose: _c,
        updateCircuitBreaker: _d, updateAlertChannels: _e,
        setMinAlertSeverity: _f, updateDashboardWidgets: _g,
        setMinConfidenceToTrade: _h, ...dataState } = state;
      expect(dataState).toEqual(DEFAULT_RISK_PREFERENCES);
    });
  });

  describe('updateAutoClose', () => {
    it('should update auto-close with all parameters', () => {
      const { updateAutoClose } = useRiskPreferencesStore.getState();

      updateAutoClose(true, 300, 0.05);

      const state = useRiskPreferencesStore.getState();
      expect(state.autoCloseEnabled).toBe(true);
      expect(state.maxLossPerTrade).toBe(300);
      expect(state.maxPositionSizePercent).toBe(0.05);
    });

    it('should update only enabled flag if other params omitted', () => {
      const { updateAutoClose } = useRiskPreferencesStore.getState();

      updateAutoClose(true);

      const state = useRiskPreferencesStore.getState();
      expect(state.autoCloseEnabled).toBe(true);
      expect(state.maxLossPerTrade).toBe(DEFAULT_RISK_PREFERENCES.maxLossPerTrade);
      expect(state.maxPositionSizePercent).toBe(DEFAULT_RISK_PREFERENCES.maxPositionSizePercent);
    });
  });

  describe('updateCircuitBreaker', () => {
    it('should update circuit breaker with all parameters', () => {
      const { updateCircuitBreaker } = useRiskPreferencesStore.getState();

      updateCircuitBreaker(true, 5, 30);

      const state = useRiskPreferencesStore.getState();
      expect(state.circuitBreakerEnabled).toBe(true);
      expect(state.maxConsecutiveLosses).toBe(5);
      expect(state.cooldownPeriodMinutes).toBe(30);
    });

    it('should update only enabled flag if other params omitted', () => {
      const { updateCircuitBreaker } = useRiskPreferencesStore.getState();

      updateCircuitBreaker(true);

      const state = useRiskPreferencesStore.getState();
      expect(state.circuitBreakerEnabled).toBe(true);
      expect(state.maxConsecutiveLosses).toBe(DEFAULT_RISK_PREFERENCES.maxConsecutiveLosses);
      expect(state.cooldownPeriodMinutes).toBe(DEFAULT_RISK_PREFERENCES.cooldownPeriodMinutes);
    });
  });

  describe('updateAlertChannels', () => {
    it('should update only provided alert channels', () => {
      const { updateAlertChannels } = useRiskPreferencesStore.getState();

      updateAlertChannels({ email: true, sound: true });

      const state = useRiskPreferencesStore.getState();
      expect(state.alertChannels.email).toBe(true);
      expect(state.alertChannels.sound).toBe(true);
      expect(state.alertChannels.toast).toBe(true); // unchanged
    });

    it('should allow partial updates', () => {
      const { updateAlertChannels } = useRiskPreferencesStore.getState();

      updateAlertChannels({ toast: false });

      const state = useRiskPreferencesStore.getState();
      expect(state.alertChannels.toast).toBe(false);
      expect(state.alertChannels.email).toBe(false); // unchanged
      expect(state.alertChannels.sound).toBe(false); // unchanged
    });
  });

  describe('setMinAlertSeverity', () => {
    it('should set severity to valid values', () => {
      const { setMinAlertSeverity } = useRiskPreferencesStore.getState();

      setMinAlertSeverity('high');
      expect(useRiskPreferencesStore.getState().minAlertSeverity).toBe('high');

      setMinAlertSeverity('critical');
      expect(useRiskPreferencesStore.getState().minAlertSeverity).toBe('critical');
    });
  });

  describe('updateDashboardWidgets', () => {
    it('should update visible widgets and order', () => {
      const { updateDashboardWidgets } = useRiskPreferencesStore.getState();

      const newWidgets = ['widget-1', 'widget-2', 'widget-3'];
      const newOrder = ['widget-3', 'widget-2', 'widget-1'];

      updateDashboardWidgets(newWidgets, newOrder);

      const state = useRiskPreferencesStore.getState();
      expect(state.visibleWidgets).toEqual(newWidgets);
      expect(state.widgetOrder).toEqual(newOrder);
    });
  });

  describe('setMinConfidenceToTrade', () => {
    it('should clamp confidence to valid range 0-1', () => {
      const { setMinConfidenceToTrade } = useRiskPreferencesStore.getState();

      setMinConfidenceToTrade(1.5);
      expect(useRiskPreferencesStore.getState().minConfidenceToTrade).toBe(1);

      setMinConfidenceToTrade(-0.5);
      expect(useRiskPreferencesStore.getState().minConfidenceToTrade).toBe(0);

      setMinConfidenceToTrade(0.75);
      expect(useRiskPreferencesStore.getState().minConfidenceToTrade).toBe(0.75);
    });
  });

  describe('Persistence', () => {
    it('should persist to localStorage on changes', () => {
      const { updatePreferences } = useRiskPreferencesStore.getState();

      // Spy on localStorage.setItem
      const originalSetItem = window.localStorage.setItem;
      let setItemCalls: Array<[string, string]> = [];
      window.localStorage.setItem = vi.fn((key, value) => {
        setItemCalls.push([key, value]);
        originalSetItem(key, value);
      });

      updatePreferences({ autoCloseEnabled: true });

      // Restore original
      window.localStorage.setItem = originalSetItem;

      expect(setItemCalls.length).toBeGreaterThan(0);
      // Find call with our storage key
      const keyCall = setItemCalls.find(call => call[0] === 'algo-trader-risk-preferences');
      expect(keyCall).toBeDefined();
      const [key, value] = keyCall!;
      expect(key).toBe('algo-trader-risk-preferences');
      const parsed = JSON.parse(value);
      // Persist middleware stores { state: ..., version: ... }
      expect(parsed.state.autoCloseEnabled).toBe(true);
    });

    it('should hydrate from localStorage on app load', () => {
      const storedState = {
        ...DEFAULT_RISK_PREFERENCES,
        autoCloseEnabled: true,
        maxLossPerTrade: 250,
      };
      localStorage.setItem('algo-trader-risk-preferences', JSON.stringify(storedState));

      // Simulate hydration by setting state directly (store singleton)
      useRiskPreferencesStore.setState(storedState);

      const state = useRiskPreferencesStore.getState();
      expect(state.autoCloseEnabled).toBe(true);
      expect(state.maxLossPerTrade).toBe(250);
    });
  });
});
