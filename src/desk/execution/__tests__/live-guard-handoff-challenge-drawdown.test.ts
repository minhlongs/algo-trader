import { describe, it, expect, beforeEach } from 'vitest';
import {
  LiveGuardHandoffCoordinator,
  type LiveOrderHandoffRequest,
} from '../live-guard-handoff';
import type { PolymarketOrder } from '../polymarket-signer';
import type { TradeSignal } from '../../polymarket/strategy-live-bridge-types';

const CAPITAL = 100_000;

function createOrder(price = 0.50, size = 1000): PolymarketOrder {
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

function createSignal(ageMs = 20): TradeSignal {
  return {
    tokenId: '0x-token-alpha',
    side: 'BUY',
    size: 1000,
    price: 0.50,
    confidence: 0.85,
    timestamp: Date.now() - ageMs,
  };
}

describe('Empirical Challenge: Daily Drawdown & Circuit Breaker', () => {
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

  describe('Area 5: Daily Drawdown Boundary', () => {
    it('approves order when daily loss is -$4,999 on $100k capital (drawdown 4.999% < 5.0%)', () => {
      coordinator.recordFillOutcome('strat-dd', -4999);

      const request: LiveOrderHandoffRequest = {
        strategyId: 'strat-dd',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: createSignal(20),
        order: createOrder(0.50, 1000),
      };

      const verdict = coordinator.evaluateLiveOrder(request);

      expect(verdict.approved).toBe(true);
      expect(verdict.checks.dailyDrawdownOk).toBe(true);
    });

    it('rejects order when daily loss reaches -$5,000 on $100k capital (drawdown 5.0% >= 5.0%)', () => {
      coordinator.recordFillOutcome('strat-dd', -5000);

      const request: LiveOrderHandoffRequest = {
        strategyId: 'strat-dd',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: createSignal(20),
        order: createOrder(0.50, 1000),
      };

      const verdict = coordinator.evaluateLiveOrder(request);

      expect(verdict.approved).toBe(false);
      expect(verdict.checks.dailyDrawdownOk).toBe(false);
      expect(verdict.reason).toMatch(/Daily drawdown 5\.0% exceeds limit 5%/i);
    });

    it('correctly nets wins and losses for daily drawdown boundary (-$5,999 + $1,000 = -$4,999 passes; -$1 more fails)', () => {
      coordinator.recordFillOutcome('strat-dd', 1000);
      coordinator.recordFillOutcome('strat-dd', -5999);

      const request: LiveOrderHandoffRequest = {
        strategyId: 'strat-dd',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: createSignal(20),
        order: createOrder(0.50, 1000),
      };

      expect(coordinator.evaluateLiveOrder(request).approved).toBe(true);

      coordinator.recordFillOutcome('strat-dd', -1);
      const breachedVerdict = coordinator.evaluateLiveOrder(request);
      expect(breachedVerdict.approved).toBe(false);
      expect(breachedVerdict.checks.dailyDrawdownOk).toBe(false);
    });

    it('restores order approval after resetDaily() session rollover', () => {
      coordinator.recordFillOutcome('strat-dd', -7500);
      expect(coordinator.getStatus().guardStatus.dailyPnl).toBe(-7500);

      const request: LiveOrderHandoffRequest = {
        strategyId: 'strat-dd',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: createSignal(20),
        order: createOrder(0.50, 1000),
      };
      expect(coordinator.evaluateLiveOrder(request).approved).toBe(false);

      coordinator.resetDaily();
      expect(coordinator.getStatus().guardStatus.dailyPnl).toBe(0);

      const recoveredVerdict = coordinator.evaluateLiveOrder(request);
      expect(recoveredVerdict.approved).toBe(true);
      expect(recoveredVerdict.checks.dailyDrawdownOk).toBe(true);
    });
  });

  describe('Area 6: Circuit Breaker', () => {
    it('trips circuit breaker on 3 consecutive losses, rejects all subsequent orders until resetCircuit()', () => {
      const request: LiveOrderHandoffRequest = {
        strategyId: 'strat-cb',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: createSignal(20),
        order: createOrder(0.50, 1000),
      };

      coordinator.recordFillOutcome('strat-cb', -50);
      expect(coordinator.evaluateLiveOrder(request).approved).toBe(true);

      coordinator.recordFillOutcome('strat-cb', -50);
      expect(coordinator.evaluateLiveOrder(request).approved).toBe(true);

      coordinator.recordFillOutcome('strat-cb', -50);
      expect(coordinator.getStatus().guardStatus.circuitTripped).toBe(true);

      const trip1 = coordinator.evaluateLiveOrder(request);
      expect(trip1.approved).toBe(false);
      expect(trip1.checks.circuitBreakerOk).toBe(false);
      expect(trip1.reason).toMatch(/Circuit breaker tripped after 3 consecutive losses\. Trading halted\./i);

      const trip2 = coordinator.evaluateLiveOrder(request);
      expect(trip2.approved).toBe(false);
      expect(trip2.checks.circuitBreakerOk).toBe(false);

      coordinator.resetCircuit();
      expect(coordinator.getStatus().guardStatus.circuitTripped).toBe(false);
      expect(coordinator.getStatus().guardStatus.consecutiveLosses).toBe(0);

      const restoredVerdict = coordinator.evaluateLiveOrder(request);
      expect(restoredVerdict.approved).toBe(true);
      expect(restoredVerdict.checks.circuitBreakerOk).toBe(true);
    });

    it('interleaved win resets consecutive loss counter and prevents circuit breaker from tripping', () => {
      const request: LiveOrderHandoffRequest = {
        strategyId: 'strat-cb',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: createSignal(20),
        order: createOrder(0.50, 1000),
      };

      coordinator.recordFillOutcome('strat-cb', -50);
      coordinator.recordFillOutcome('strat-cb', -50);
      expect(coordinator.getStatus().guardStatus.consecutiveLosses).toBe(2);

      coordinator.recordFillOutcome('strat-cb', 100);
      expect(coordinator.getStatus().guardStatus.consecutiveLosses).toBe(0);
      expect(coordinator.getStatus().guardStatus.circuitTripped).toBe(false);

      coordinator.recordFillOutcome('strat-cb', -50);
      coordinator.recordFillOutcome('strat-cb', -50);
      expect(coordinator.getStatus().guardStatus.circuitTripped).toBe(false);

      expect(coordinator.evaluateLiveOrder(request).approved).toBe(true);
    });
  });
});
