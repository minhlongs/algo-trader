/**
 * Live Guard Handoff Pre-Trade Evaluator
 */

import type { LiveExecutionGuard } from './live-execution-guard-core';
import type { TokenBucketRateLimiter } from './token-bucket-rate-limiter';
import type { TieredDrawdownBreaker } from '../risk/tiered-drawdown-breaker';
import type { AlphaLifecycleState } from '../../alpha-lab/attribution/alpha-lifecycle-state-machine';
import type {
  LiveOrderHandoffRequest,
  LiveRiskGateChecks,
  LiveOrderHandoffVerdict,
} from './live-guard-handoff-types';

export interface EvaluatorContext {
  signalTtlMs: number;
  rateLimitOrdersPerSec: number;
  drawdownBreaker?: TieredDrawdownBreaker;
  guard: LiveExecutionGuard;
  getOrCreateRateLimiter: (strategyId: string) => TokenBucketRateLimiter;
  isPromotionEligible: (state: AlphaLifecycleState) => boolean;
}

export function evaluateHandoffOrder(
  request: LiveOrderHandoffRequest,
  ctx: EvaluatorContext,
): LiveOrderHandoffVerdict {
  const now = Date.now();
  const checks: LiveRiskGateChecks = {
    promotionEligible: true,
    signalTtlOk: true,
    rateLimitOk: true,
    drawdownBreakerOk: true,
    circuitBreakerOk: true,
    positionSizeOk: true,
    dailyDrawdownOk: true,
    concurrentLimitOk: true,
  };

  // 1. Lifecycle state eligibility
  if (!ctx.isPromotionEligible(request.lifecycleState)) {
    checks.promotionEligible = false;
    return {
      approved: false,
      reason: `Strategy ${request.strategyId} in state ${request.lifecycleState} is not eligible for live execution (must be PROMOTED_LIVE_ELIGIBLE)`,
      checks,
      order: request.order,
      evaluatedAt: now,
    };
  }

  // 2. Signal TTL
  const signalTimestamp = request.signal.timestamp ?? 0;
  const signalAge = now - signalTimestamp;
  if (signalAge > ctx.signalTtlMs) {
    checks.signalTtlOk = false;
    return {
      approved: false,
      reason: `STALE_SIGNAL: Signal age ${signalAge}ms exceeds TTL of ${ctx.signalTtlMs}ms`,
      checks,
      order: request.order,
      evaluatedAt: now,
    };
  }

  // 3. TokenBucketRateLimiter
  const rateLimiter = ctx.getOrCreateRateLimiter(request.strategyId);
  if (!rateLimiter.tryConsume()) {
    checks.rateLimitOk = false;
    return {
      approved: false,
      reason: `RATE_LIMITED: Strategy ${request.strategyId} exceeded rate limit of ${ctx.rateLimitOrdersPerSec} orders/sec`,
      checks,
      order: request.order,
      evaluatedAt: now,
    };
  }

  // 4. TieredDrawdownBreaker
  if (ctx.drawdownBreaker && !ctx.drawdownBreaker.canOpenNewTrades()) {
    checks.drawdownBreakerOk = false;
    const tier = ctx.drawdownBreaker.getState().tier;
    return {
      approved: false,
      reason: `DRAWDOWN_BREAKER: Trading halted in tier ${tier}`,
      checks,
      order: request.order,
      evaluatedAt: now,
    };
  }

  // 5. LiveExecutionGuard.guardOrder()
  const guardResult = ctx.guard.guardOrder(request.order);
  checks.circuitBreakerOk = guardResult.checks.circuitBreakerOk;
  checks.positionSizeOk = guardResult.checks.positionSizeOk;
  checks.dailyDrawdownOk = guardResult.checks.dailyDrawdownOk;
  checks.concurrentLimitOk = guardResult.checks.concurrentLimitOk;

  if (!guardResult.approved) {
    return {
      approved: false,
      reason: guardResult.reason,
      checks,
      order: request.order,
      evaluatedAt: now,
    };
  }

  return {
    approved: true,
    checks,
    order: request.order,
    evaluatedAt: now,
  };
}
