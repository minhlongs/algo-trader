/**
 * Daily Drawdown Circuit Breaker
 * Enforces strict 15% maximum daily drawdown threshold
 * (Milestone 4 / Feature 12)
 */

import { logger } from '../../../shared/utils/logger';
import { DrawdownState } from '../types/risk-types';

export class DrawdownBreaker {
  private peakCapitalUsd: number;
  private currentCapitalUsd: number;
  private maxDrawdownHurdle: number; // default 0.15 (15%)
  private tripped: boolean = false;
  private trippedTimestampMs?: number;

  constructor(initialCapitalUsd: number, maxDrawdownHurdle: number = 0.15) {
    this.peakCapitalUsd = Math.max(0, initialCapitalUsd);
    this.currentCapitalUsd = Math.max(0, initialCapitalUsd);
    this.maxDrawdownHurdle = maxDrawdownHurdle;
  }

  public updateCapital(newCapitalUsd: number): DrawdownState {
    this.currentCapitalUsd = newCapitalUsd;
    if (newCapitalUsd > this.peakCapitalUsd) {
      this.peakCapitalUsd = newCapitalUsd;
    }

    const drawdown =
      this.peakCapitalUsd > 0
        ? Math.max(0, (this.peakCapitalUsd - this.currentCapitalUsd) / this.peakCapitalUsd)
        : 0;

    if (drawdown >= this.maxDrawdownHurdle && !this.tripped) {
      this.tripped = true;
      this.trippedTimestampMs = Date.now();
      logger.error('[DrawdownBreaker] Circuit breaker TRIPPED: Drawdown hurdle breached', {
        currentCapitalUsd: this.currentCapitalUsd,
        peakCapitalUsd: this.peakCapitalUsd,
        drawdown: Number((drawdown * 100).toFixed(2)),
        maxDrawdownHurdle: Number((this.maxDrawdownHurdle * 100).toFixed(2)),
      });
    }

    return this.getState();
  }

  public isTripped(): boolean {
    return this.tripped;
  }

  public resetPeak(newCapitalUsd?: number): void {
    if (newCapitalUsd !== undefined) {
      this.currentCapitalUsd = newCapitalUsd;
      this.peakCapitalUsd = newCapitalUsd;
    } else {
      this.peakCapitalUsd = this.currentCapitalUsd;
    }
    this.tripped = false;
    this.trippedTimestampMs = undefined;
    logger.info('[DrawdownBreaker] Circuit breaker reset', {
      peakCapitalUsd: this.peakCapitalUsd,
    });
  }

  public getState(): DrawdownState {
    const drawdown =
      this.peakCapitalUsd > 0
        ? Math.max(0, (this.peakCapitalUsd - this.currentCapitalUsd) / this.peakCapitalUsd)
        : 0;

    return {
      peakCapitalUsd: this.peakCapitalUsd,
      currentCapitalUsd: this.currentCapitalUsd,
      currentDrawdown: Number(drawdown.toFixed(6)),
      maxDrawdownHurdle: this.maxDrawdownHurdle,
      tripped: this.tripped,
      trippedTimestampMs: this.trippedTimestampMs,
    };
  }
}
