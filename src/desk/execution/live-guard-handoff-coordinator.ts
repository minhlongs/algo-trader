/**
 * Live Guard Handoff Coordinator Class
 */

import { LiveExecutionGuard } from './live-execution-guard-core';
import type { LivePositionTracker } from './live-position-tracker';
import { TokenBucketRateLimiter } from './token-bucket-rate-limiter';
import type { TieredDrawdownBreaker } from '../risk/tiered-drawdown-breaker';
import type { AlphaLifecycleState } from '../../alpha-lab/attribution/alpha-lifecycle-state-machine';
import { evaluateHandoffOrder } from './live-guard-handoff-evaluator';
import type {
  LiveGuardHandoffConfig,
  LiveOrderHandoffRequest,
  LiveOrderHandoffVerdict,
  LiveHandoffStatus,
} from './live-guard-handoff-types';

export class LiveGuardHandoffCoordinator {
  private readonly guard: LiveExecutionGuard;
  private readonly config: {
    capitalUsdc: number;
    maxPositionFraction: number;
    maxDailyDrawdown: number;
    maxConcurrentPositions: number;
    maxConsecutiveLosses: number;
    signalTtlMs: number;
    rateLimitOrdersPerSec: number;
    rateLimitBurst: number;
    drawdownBreaker?: TieredDrawdownBreaker;
    positionTracker?: LivePositionTracker;
  };
  private readonly rateLimiters = new Map<string, TokenBucketRateLimiter>();

  constructor(config: LiveGuardHandoffConfig) {
    if (config.capitalUsdc <= 0) {
      throw new Error('capitalUsdc must be positive');
    }

    this.config = {
      capitalUsdc: config.capitalUsdc,
      maxPositionFraction: config.maxPositionFraction ?? 0.02,
      maxDailyDrawdown: config.maxDailyDrawdown ?? 0.05,
      maxConcurrentPositions: config.maxConcurrentPositions ?? 5,
      maxConsecutiveLosses: config.maxConsecutiveLosses ?? 3,
      signalTtlMs: config.signalTtlMs ?? 200,
      rateLimitOrdersPerSec: config.rateLimitOrdersPerSec ?? 5,
      rateLimitBurst: config.rateLimitBurst ?? 10,
      drawdownBreaker: config.drawdownBreaker,
      positionTracker: config.positionTracker,
    };

    if (config.guard) {
      this.guard = config.guard;
    } else {
      this.guard = new LiveExecutionGuard({
        capitalUsdc: this.config.capitalUsdc,
        maxPositionFraction: this.config.maxPositionFraction,
        maxDailyDrawdown: this.config.maxDailyDrawdown,
        maxConcurrentPositions: this.config.maxConcurrentPositions,
        maxConsecutiveLosses: this.config.maxConsecutiveLosses,
        enabled: true,
      });
    }

    if (this.config.positionTracker) {
      this.guard.attachTracker(this.config.positionTracker);
    }
  }

  public isPromotionEligible(lifecycleState: AlphaLifecycleState): boolean {
    return lifecycleState === 'PROMOTED_LIVE_ELIGIBLE';
  }

  public evaluateLiveOrder(request: LiveOrderHandoffRequest): LiveOrderHandoffVerdict {
    return evaluateHandoffOrder(request, {
      signalTtlMs: this.config.signalTtlMs,
      rateLimitOrdersPerSec: this.config.rateLimitOrdersPerSec,
      drawdownBreaker: this.config.drawdownBreaker,
      guard: this.guard,
      getOrCreateRateLimiter: (stratId) => this.getOrCreateRateLimiter(stratId),
      isPromotionEligible: (state) => this.isPromotionEligible(state),
    });
  }

  public recordFillOutcome(strategyId: string, realizedPnl: number, currentEquity?: number): void {
    if (realizedPnl >= 0) {
      this.guard.recordWin(realizedPnl);
    } else {
      this.guard.recordLoss(realizedPnl);
    }

    if (this.config.drawdownBreaker) {
      const equity = currentEquity !== undefined
        ? currentEquity
        : this.config.capitalUsdc + this.guard.getStatus().dailyPnl;
      this.config.drawdownBreaker.update(equity);
    }
  }

  public resetCircuit(): void {
    this.guard.resetCircuit();
  }

  public resetDaily(): void {
    this.guard.resetDaily();
  }

  public getStatus(): LiveHandoffStatus {
    const guardStatus = this.guard.getStatus();
    const drawdownTier = this.config.drawdownBreaker?.getState().tier;
    const breakerAllows = this.config.drawdownBreaker ? this.config.drawdownBreaker.canOpenNewTrades() : true;
    const canOpenNewTrades = breakerAllows && !guardStatus.circuitTripped;
    const openPositionsCount = this.config.positionTracker?.getPositions().length ?? guardStatus.openPositions;

    return {
      guardStatus,
      capitalUsdc: this.config.capitalUsdc,
      drawdownTier,
      canOpenNewTrades,
      openPositionsCount,
      activeStrategyRateLimitersCount: this.rateLimiters.size,
    };
  }

  public getGuard(): LiveExecutionGuard {
    return this.guard;
  }

  private getOrCreateRateLimiter(strategyId: string): TokenBucketRateLimiter {
    let limiter = this.rateLimiters.get(strategyId);
    if (!limiter) {
      limiter = new TokenBucketRateLimiter(
        this.config.rateLimitBurst,
        this.config.rateLimitOrdersPerSec,
      );
      this.rateLimiters.set(strategyId, limiter);
    }
    return limiter;
  }
}
