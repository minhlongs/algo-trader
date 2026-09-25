/**
 * AISignalAdapter Class Implementation
 */

import type { MetricsReport } from '../backtesting/types';
import type {
  AISignal,
  AISignalConfig,
  AISignalValidationResult,
} from './ai-signal-adapter-types';

export class AISignalAdapter {
  private readonly config: AISignalConfig;

  constructor(config: AISignalConfig) {
    this.config = config;
  }

  evaluateSignal(signal: AISignal): boolean {
    if (!signal || typeof signal !== 'object') {
      return false;
    }
    const { confidence, expectancy } = signal;
    if (
      typeof confidence !== 'number' ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1 ||
      confidence < this.config.confidenceThreshold
    ) {
      return false;
    }
    if (
      typeof expectancy !== 'number' ||
      !Number.isFinite(expectancy) ||
      expectancy < this.config.minExpectancy
    ) {
      return false;
    }
    return true;
  }

  filterByRegime(signal: AISignal): boolean {
    if (!signal || typeof signal !== 'object') {
      return false;
    }
    const filter = this.config.regimeFilter;
    if (!filter || filter.length === 0) return true;
    return filter.includes(signal.regime);
  }

  validateSignal(signal: AISignal): AISignalValidationResult {
    const rejectionReasons: string[] = [];

    if (!signal || typeof signal !== 'object') {
      return {
        valid: false,
        signal,
        rejectionReasons: ['Signal must be a valid non-null object'],
      };
    }

    if (
      typeof signal.confidence !== 'number' ||
      !Number.isFinite(signal.confidence) ||
      signal.confidence < 0 ||
      signal.confidence > 1 ||
      signal.confidence < this.config.confidenceThreshold
    ) {
      const valStr =
        typeof signal.confidence === 'number' && Number.isFinite(signal.confidence) && signal.confidence >= 0 && signal.confidence <= 1
          ? signal.confidence.toFixed(4)
          : String(signal.confidence);
      rejectionReasons.push(
        `Confidence ${valStr} is below threshold ${this.config.confidenceThreshold.toFixed(4)}`,
      );
    }

    if (
      typeof signal.expectancy !== 'number' ||
      !Number.isFinite(signal.expectancy) ||
      signal.expectancy < this.config.minExpectancy
    ) {
      const valStr =
        typeof signal.expectancy === 'number' && Number.isFinite(signal.expectancy)
          ? signal.expectancy.toFixed(4)
          : String(signal.expectancy);
      rejectionReasons.push(
        `Expectancy ${valStr} is below minimum ${this.config.minExpectancy.toFixed(4)}`,
      );
    }

    if (!this.filterByRegime(signal)) {
      const allowed = (this.config.regimeFilter ?? []).join(', ');
      rejectionReasons.push(
        `Regime "${String(signal.regime)}" is not permitted by filter [${allowed}]`,
      );
    }

    return {
      valid: rejectionReasons.length === 0,
      signal,
      rejectionReasons,
    };
  }

  scoreStrategy(metrics: MetricsReport): number {
    const profitScore = metrics.profitFactor / (1 + metrics.profitFactor);
    const pnlScore = metrics.totalPnl > 0
      ? Math.min(Math.abs(metrics.totalPnl) / 0.05, 1)
      : 0;

    return Math.min(
      metrics.winRate * 0.4 +
        pnlScore * 0.3 +
        profitScore * 0.3,
      1,
    );
  }
}
