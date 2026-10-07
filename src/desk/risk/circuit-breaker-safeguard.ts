/**
 * Real-Time Circuit Breaker Safeguard Engine
 *
 * Tracks high-water mark NAV, rolling drawdown, loss velocity, and emits emergency
 * halt signals to cancel open quotes and halt trading immediately.
 *
 * @module desk/risk/circuit-breaker-safeguard
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  SafeguardConfig,
  SafeguardState,
  EmergencyActionSignal,
  SafeguardStatus,
  SafeguardTripReason,
} from './circuit-breaker-safeguard-types';

export class CircuitBreakerSafeguard extends EventEmitter {
  private readonly maxDrawdownPct: number;
  private readonly warningDrawdownPct: number;
  private readonly maxLossPerMinuteUsd: number;
  private readonly cooldownDurationMs: number;

  private state: SafeguardState = 'NORMAL';
  private peakNavUsd = 0;
  private currentNavUsd = 0;
  private trippedAt?: number;
  private tripReason?: SafeguardTripReason;
  private lossHistory: Array<{ timestamp: number; nav: number }> = [];

  constructor(config: SafeguardConfig) {
    super();
    this.maxDrawdownPct = config.maxDrawdownPct;
    this.warningDrawdownPct = config.warningDrawdownPct ?? config.maxDrawdownPct * 0.6;
    this.maxLossPerMinuteUsd = config.maxLossPerMinuteUsd ?? Infinity;
    this.cooldownDurationMs = config.cooldownDurationMs ?? 60000;
  }

  public updateNav(nav: number, timestamp: number = Date.now()): SafeguardStatus {
    this.currentNavUsd = nav;
    if (nav > this.peakNavUsd) {
      this.peakNavUsd = nav;
    }

    this.pruneHistory(timestamp);
    this.lossHistory.push({ timestamp, nav });

    const recentLoss = this.calculateRecentLoss();
    const drawdownPct =
      this.peakNavUsd > 0 ? (this.peakNavUsd - this.currentNavUsd) / this.peakNavUsd : 0;

    if (this.state === 'TRIPPED') {
      if (this.trippedAt && timestamp - this.trippedAt >= this.cooldownDurationMs) {
        this.state = 'COOLING_DOWN';
        this.emit('coolingDown', this.getStatus());
      }
      return this.getStatus();
    }

    if (drawdownPct >= this.maxDrawdownPct) {
      this.trip('MAX_DRAWDOWN_BREACH', timestamp);
    } else if (recentLoss >= this.maxLossPerMinuteUsd) {
      this.trip('RAPID_LOSS_SPIKE', timestamp);
    } else if (drawdownPct >= this.warningDrawdownPct) {
      if (this.state === 'NORMAL') {
        this.state = 'WARNING';
        this.emit('warning', this.getStatus());
      }
    } else if (this.state === 'WARNING' || this.state === 'COOLING_DOWN') {
      this.state = 'NORMAL';
      this.emit('recovered', this.getStatus());
    }

    return this.getStatus();
  }

  public trip(reason: SafeguardTripReason, timestamp: number = Date.now()): EmergencyActionSignal {
    this.state = 'TRIPPED';
    this.trippedAt = timestamp;
    this.tripReason = reason;

    const signal: EmergencyActionSignal = {
      actionId: `halt-${randomUUID()}`,
      timestamp,
      cancelAllOpenOrders: true,
      flattenExposure: reason === 'MAX_DRAWDOWN_BREACH',
      reason,
      message: `Safeguard tripped: ${reason}`,
    };

    this.emit('tripped', signal);
    return signal;
  }

  public reset(): void {
    this.state = 'NORMAL';
    this.trippedAt = undefined;
    this.tripReason = undefined;
    this.emit('reset', this.getStatus());
  }

  public getStatus(): SafeguardStatus {
    const drawdownPct =
      this.peakNavUsd > 0 ? (this.peakNavUsd - this.currentNavUsd) / this.peakNavUsd : 0;
    return {
      state: this.state,
      peakNavUsd: this.peakNavUsd,
      currentNavUsd: this.currentNavUsd,
      currentDrawdownPct: Math.max(0, drawdownPct),
      recentLossUsd: this.calculateRecentLoss(),
      isTradingAllowed: this.state === 'NORMAL' || this.state === 'WARNING',
      trippedAt: this.trippedAt,
      tripReason: this.tripReason,
    };
  }

  private pruneHistory(currentTime: number): void {
    const cutoff = currentTime - 60000;
    this.lossHistory = this.lossHistory.filter((h) => h.timestamp >= cutoff);
  }

  private calculateRecentLoss(): number {
    if (this.lossHistory.length < 2) return 0;
    const oldest = this.lossHistory[0].nav;
    return Math.max(0, oldest - this.currentNavUsd);
  }
}
