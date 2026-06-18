/**
 * Risk preferences store — Centralized state management for user risk settings
 * Uses Zustand with localStorage persistence
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { RiskPreferences, DEFAULT_RISK_PREFERENCES } from '../types/risk-preferences';

interface RiskPreferencesState extends RiskPreferences {
  // Actions
  updatePreferences: (prefs: Partial<RiskPreferences>) => void;
  resetPreferences: () => void;
  updateAutoClose: (enabled: boolean, maxLoss?: number, maxPositionPercent?: number) => void;
  updateCircuitBreaker: (enabled: boolean, maxLosses?: number, cooldownMinutes?: number) => void;
  updateAlertChannels: (channels: Partial<RiskPreferences['alertChannels']>) => void;
  setMinAlertSeverity: (severity: 'low' | 'medium' | 'high' | 'critical') => void;
  updateDashboardWidgets: (visible: string[], order: string[]) => void;
  setMinConfidenceToTrade: (confidence: number) => void;
}

export const useRiskPreferencesStore = create<RiskPreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULT_RISK_PREFERENCES,

      updatePreferences: (prefs) =>
        set((state) => ({ ...state, ...prefs })),

      resetPreferences: () =>
        set(DEFAULT_RISK_PREFERENCES),

      updateAutoClose: (enabled, maxLoss, maxPositionPercent) =>
        set((state) => ({
          autoCloseEnabled: enabled,
          maxLossPerTrade: maxLoss ?? state.maxLossPerTrade,
          maxPositionSizePercent: maxPositionPercent ?? state.maxPositionSizePercent,
        })),

      updateCircuitBreaker: (enabled, maxLosses, cooldownMinutes) =>
        set((state) => ({
          circuitBreakerEnabled: enabled,
          maxConsecutiveLosses: maxLosses ?? state.maxConsecutiveLosses,
          cooldownPeriodMinutes: cooldownMinutes ?? state.cooldownPeriodMinutes,
        })),

      updateAlertChannels: (channels) =>
        set((state) => ({
          alertChannels: { ...state.alertChannels, ...channels },
        })),

      setMinAlertSeverity: (severity) =>
        set({ minAlertSeverity: severity }),

      updateDashboardWidgets: (visible, order) =>
        set({
          visibleWidgets: visible,
          widgetOrder: order,
        }),

      setMinConfidenceToTrade: (confidence) =>
        set({ minConfidenceToTrade: Math.max(0, Math.min(1, confidence)) }),
    }),
    {
      name: 'algo-trader-risk-preferences',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
