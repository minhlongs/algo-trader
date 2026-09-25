import { describe, it, expect, beforeEach } from 'vitest';
import {
  LiveGuardHandoffCoordinator,
  type LiveOrderHandoffRequest,
} from '../live-guard-handoff';
import { LivePositionTracker } from '../live-position-tracker-core';
import type { PolymarketOrder } from '../polymarket-signer';
import type { TradeSignal } from '../../polymarket/strategy-live-bridge-types';

function makeValidOrder(price = 0.50, size = 1000): PolymarketOrder {
  return {
    tokenId: '0x-token-alpha',
    price,
    size,
    side: 'BUY',
    expiration: Math.floor(Date.now() / 1000) + 3600,
    nonce: '1',
    feeRateBps: 0,
    signatureType: 0,
  };
}

function makeValidSignal(ageMs = 50): TradeSignal {
  return {
    tokenId: '0x-token-alpha',
    side: 'BUY',
    size: 1000,
    price: 0.50,
    confidence: 0.85,
    timestamp: Date.now() - ageMs,
  };
}

describe('LiveGuardHandoffCoordinator Guard & Position Limits', () => {
  const CAPITAL = 100_000;
  let coordinator: LiveGuardHandoffCoordinator;

  beforeEach(() => {
    coordinator = new LiveGuardHandoffCoordinator({
      capitalUsdc: CAPITAL,
      maxPositionFraction: 0.02,
      maxDailyDrawdown: 0.05,
      maxConcurrentPositions: 5,
      maxConsecutiveLosses: 3,
      signalTtlMs: 200,
      rateLimitOrdersPerSec: 5,
      rateLimitBurst: 10,
    });
  });

  it('Step 5: rejects when LiveExecutionGuard detects position size > 2%', () => {
    const request: LiveOrderHandoffRequest = {
      strategyId: 'strat-alpha',
      lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
      signal: makeValidSignal(20),
      order: makeValidOrder(0.50, 6000),
    };

    const verdict = coordinator.evaluateLiveOrder(request);
    expect(verdict.approved).toBe(false);
    expect(verdict.checks.positionSizeOk).toBe(false);
    expect(verdict.reason).toMatch(/exceeds max position/i);
  });

  it('Step 5: rejects when daily drawdown >= 5% ($5,000)', () => {
    coordinator.recordFillOutcome('strat-alpha', -5000);

    const request: LiveOrderHandoffRequest = {
      strategyId: 'strat-alpha',
      lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
      signal: makeValidSignal(20),
      order: makeValidOrder(0.50, 1000),
    };

    const verdict = coordinator.evaluateLiveOrder(request);
    expect(verdict.approved).toBe(false);
    expect(verdict.checks.dailyDrawdownOk).toBe(false);
    expect(verdict.reason).toMatch(/Daily drawdown/i);
  });

  it('Step 5: rejects when circuit breaker trips on 3 consecutive losses', () => {
    coordinator.recordFillOutcome('strat-alpha', -100);
    coordinator.recordFillOutcome('strat-alpha', -100);
    coordinator.recordFillOutcome('strat-alpha', -100);

    const request: LiveOrderHandoffRequest = {
      strategyId: 'strat-alpha',
      lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
      signal: makeValidSignal(20),
      order: makeValidOrder(0.50, 1000),
    };

    const verdict = coordinator.evaluateLiveOrder(request);
    expect(verdict.approved).toBe(false);
    expect(verdict.checks.circuitBreakerOk).toBe(false);
    expect(verdict.reason).toMatch(/Circuit breaker tripped/i);
  });

  it('Step 5: rejects when concurrent positions limit is reached', () => {
    const tracker = new LivePositionTracker(CAPITAL);
    for (let i = 0; i < 5; i++) {
      tracker.recordFill({
        tokenId: `0x${i.toString(16).padStart(8, '0')}`,
        side: 'BUY',
        size: 1,
        price: 0.50,
        filledAt: Date.now(),
        orderId: `order-${i}`,
      });
    }

    const coordWithTracker = new LiveGuardHandoffCoordinator({
      capitalUsdc: CAPITAL,
      maxConcurrentPositions: 5,
      positionTracker: tracker,
    });

    const request: LiveOrderHandoffRequest = {
      strategyId: 'strat-alpha',
      lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
      signal: makeValidSignal(20),
      order: makeValidOrder(0.50, 1000),
    };

    const verdict = coordWithTracker.evaluateLiveOrder(request);
    expect(verdict.approved).toBe(false);
    expect(verdict.checks.concurrentLimitOk).toBe(false);
    expect(verdict.reason).toMatch(/Open positions/i);
  });

  it('approves order when all checks pass', () => {
    const request: LiveOrderHandoffRequest = {
      strategyId: 'strat-alpha',
      lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
      signal: makeValidSignal(50),
      order: makeValidOrder(0.50, 1000),
    };

    const verdict = coordinator.evaluateLiveOrder(request);

    expect(verdict.approved).toBe(true);
    expect(verdict.reason).toBeUndefined();
    expect(verdict.checks.promotionEligible).toBe(true);
    expect(verdict.checks.signalTtlOk).toBe(true);
    expect(verdict.checks.rateLimitOk).toBe(true);
    expect(verdict.checks.drawdownBreakerOk).toBe(true);
    expect(verdict.checks.circuitBreakerOk).toBe(true);
    expect(verdict.checks.positionSizeOk).toBe(true);
    expect(verdict.checks.dailyDrawdownOk).toBe(true);
    expect(verdict.checks.concurrentLimitOk).toBe(true);
    expect(verdict.order).toEqual(request.order);
    expect(verdict.evaluatedAt).toBeGreaterThan(0);
  });
});
