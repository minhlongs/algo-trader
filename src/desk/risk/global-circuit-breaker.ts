import { logger } from '../../shared/utils/logger';
import type { CircuitBreakerState, CircuitBreakerTier } from './portfolio-risk-types';

export class GlobalCircuitBreaker {
  private currentTier: CircuitBreakerTier = 'NORMAL';
  private highWaterMark = 0;
  private lastEvaluatedAt = 0;

  constructor(initialNav = 0) {
    this.highWaterMark = Math.max(0, initialNav);
    this.lastEvaluatedAt = Date.now();
  }

  public evaluate(currentNav: number, meanCorrelation = 0.25): CircuitBreakerState {
    const safeNav = Number.isFinite(currentNav) ? Math.max(0, currentNav) : 0;
    const safeCorrelation = Number.isFinite(meanCorrelation) ? meanCorrelation : 0;

    if (safeNav > this.highWaterMark) {
      this.highWaterMark = safeNav;
    }

    const dd =
      this.highWaterMark > 0 ? (this.highWaterMark - safeNav) / this.highWaterMark : 0;

    let tier: CircuitBreakerTier = 'NORMAL';
    let reason = 'Normal market operation';

    if (dd >= 0.20) {
      tier = 'HARD_STOP';
      reason = `Terminal drawdown breach: ${(dd * 100).toFixed(2)}% >= 20%`;
    } else if (dd >= 0.15) {
      tier = 'HALT';
      reason = `Drawdown breach: ${(dd * 100).toFixed(2)}% >= 15%`;
    } else if (dd >= 0.10) {
      tier = 'REDUCE';
      reason = `Drawdown breach: ${(dd * 100).toFixed(2)}% >= 10%`;
    } else if (dd >= 0.05 || safeCorrelation > 0.85) {
      tier = 'ALERT';
      reason =
        dd >= 0.05
          ? `Drawdown breach: ${(dd * 100).toFixed(2)}% >= 5%`
          : `Correlation spike: ${safeCorrelation.toFixed(2)} > 0.85`;
    }

    if (tier !== this.currentTier) {
      logger.warn(
        `[GlobalCircuitBreaker] Transition: ${this.currentTier} -> ${tier}. Reason: ${reason}`
      );
      this.currentTier = tier;
    }

    this.lastEvaluatedAt = Date.now();

    return {
      tier,
      peakToTroughDrawdown: dd,
      meanCorrelation: safeCorrelation,
      grossLeverage: 1.0,
      triggeredAt: this.lastEvaluatedAt,
      reason,
    };
  }

  public getTier(): CircuitBreakerTier {
    return this.currentTier;
  }

  public getHighWaterMark(): number {
    return this.highWaterMark;
  }

  public reset(initialNav = 0): void {
    logger.info(`[GlobalCircuitBreaker] Manual reset to NORMAL with initialNav=${initialNav}`);
    this.currentTier = 'NORMAL';
    this.highWaterMark = Math.max(0, initialNav);
  }

  public getSizingMultiplier(): number {
    switch (this.currentTier) {
      case 'NORMAL':
        return 1.0;
      case 'ALERT':
        return 0.75;
      case 'REDUCE':
        return 0.5;
      case 'HALT':
      case 'HARD_STOP':
        return 0.0;
    }
  }

  public getLiquidationFraction(): number {
    switch (this.currentTier) {
      case 'NORMAL':
      case 'ALERT':
        return 0.0;
      case 'REDUCE':
        return 0.25;
      case 'HALT':
        return 0.5;
      case 'HARD_STOP':
        return 1.0;
    }
  }
}
