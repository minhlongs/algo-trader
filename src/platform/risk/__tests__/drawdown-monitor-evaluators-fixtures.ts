/**
 * Shared fixtures and builders for Drawdown Monitor Evaluators tests.
 */

import type { DrawdownMetrics } from '@desk/risk';
import {
  type DrawdownThresholdConfig,
  type DrawdownThresholdEvaluation,
  DEFAULT_THRESHOLD_CONFIG,
} from '../drawdown-monitor-types';

export function makeMetrics(overrides: Partial<DrawdownMetrics> = {}): DrawdownMetrics {
  return {
    currentDrawdown: 0,
    maxDrawdown: 0,
    peakValue: 100,
    currentValue: 100,
    dailyPnl: 0,
    dailyDrawdown: 0,
    consecutiveLosses: 0,
    isHalted: false,
    ...overrides,
  };
}

export function makeConfig(overrides: Partial<DrawdownThresholdConfig> = {}): DrawdownThresholdConfig {
  return { ...DEFAULT_THRESHOLD_CONFIG, ...overrides };
}

export function makeEval(breached: boolean, type: 'daily' | 'total' | 'consecutive' = 'daily'): DrawdownThresholdEvaluation {
  return { type, breached, current: 0, threshold: 0, headroom: 0 };
}
