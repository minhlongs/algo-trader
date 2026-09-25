import { describe, it, expect, beforeEach } from 'vitest';
import {
  LiveGuardHandoffCoordinator,
  type LiveOrderHandoffRequest,
} from '../live-guard-handoff';
import { LivePositionTracker } from '../live-position-tracker-core';
import type { PolymarketOrder } from '../polymarket-signer';
import type { TradeSignal } from '../../polymarket/strategy-live-bridge-types';
import { TieredDrawdownBreaker } from '../../risk/tiered-drawdown-breaker';

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

describe('Empirical Challenge: Feedback Loop & Robustness', () => {
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

  describe('Area 7: Feedback Loop', () => {
    it('recordFillOutcome updates guard wins, losses, daily PnL accurately', () => {
      expect(coordinator.getStatus().guardStatus.totalWins).toBe(0);
      expect(coordinator.getStatus().guardStatus.totalLosses).toBe(0);
      expect(coordinator.getStatus().guardStatus.dailyPnl).toBe(0);

      coordinator.recordFillOutcome('strat-alpha', 250);
      let status = coordinator.getStatus().guardStatus;
      expect(status.totalWins).toBe(1);
      expect(status.totalLosses).toBe(0);
      expect(status.dailyPnl).toBe(250);
      expect(status.consecutiveLosses).toBe(0);

      coordinator.recordFillOutcome('strat-alpha', -100);
      status = coordinator.getStatus().guardStatus;
      expect(status.totalWins).toBe(1);
      expect(status.totalLosses).toBe(1);
      expect(status.dailyPnl).toBe(150);
      expect(status.consecutiveLosses).toBe(1);

      coordinator.recordFillOutcome('strat-alpha', 350);
      status = coordinator.getStatus().guardStatus;
      expect(status.totalWins).toBe(2);
      expect(status.totalLosses).toBe(1);
      expect(status.dailyPnl).toBe(500);
      expect(status.consecutiveLosses).toBe(0);
    });

    it('recordFillOutcome correctly synchronizes TieredDrawdownBreaker equity and trips Step 4 gate on HALT tier', () => {
      const breaker = new TieredDrawdownBreaker(CAPITAL, {
        haltThreshold: 0.15,
      });
      breaker.reset(CAPITAL);
      expect(breaker.getState().tier).toBe('NORMAL');

      const coordWithBreaker = new LiveGuardHandoffCoordinator({
        capitalUsdc: CAPITAL,
        drawdownBreaker: breaker,
      });

      const request: LiveOrderHandoffRequest = {
        strategyId: 'strat-tiered-test',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: createSignal(20),
        order: createOrder(0.50, 1000),
      };

      coordWithBreaker.recordFillOutcome('strat-tiered-test', -1000);
      expect(coordWithBreaker.getStatus().canOpenNewTrades).toBe(true);
      expect(coordWithBreaker.evaluateLiveOrder(request).approved).toBe(true);

      coordWithBreaker.recordFillOutcome('strat-tiered-test', -15000, 84000);

      expect(breaker.getState().tier).toBe('HALT');
      expect(coordWithBreaker.getStatus().canOpenNewTrades).toBe(false);

      const haltedVerdict = coordWithBreaker.evaluateLiveOrder(request);
      expect(haltedVerdict.approved).toBe(false);
      expect(haltedVerdict.checks.drawdownBreakerOk).toBe(false);
      expect(haltedVerdict.reason).toMatch(/DRAWDOWN_BREAKER: Trading halted in tier HALT/i);
    });
  });

  describe('Area 8: Additional Robustness & Edge Invariants', () => {
    it('concurrent positions limit halts new orders when tracker count reaches 5', () => {
      const tracker = new LivePositionTracker(CAPITAL);
      for (let i = 0; i < 5; i++) {
        tracker.recordFill({
          tokenId: `0x-token-${i}`,
          side: 'BUY',
          size: 10,
          price: 0.50,
          filledAt: Date.now(),
          orderId: `order-${i}`,
        });
      }

      const coordTracker = new LiveGuardHandoffCoordinator({
        capitalUsdc: CAPITAL,
        maxConcurrentPositions: 5,
        positionTracker: tracker,
      });

      const request: LiveOrderHandoffRequest = {
        strategyId: 'strat-concurrent',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: createSignal(20),
        order: createOrder(0.50, 1000),
      };

      const verdict = coordTracker.evaluateLiveOrder(request);
      expect(verdict.approved).toBe(false);
      expect(verdict.checks.concurrentLimitOk).toBe(false);
      expect(verdict.reason).toMatch(/Open positions \(5\) at max \(5\)/i);
    });

    it('rejects non-positive capital initialization', () => {
      expect(() => new LiveGuardHandoffCoordinator({ capitalUsdc: 0 })).toThrow(/capitalUsdc must be positive/i);
      expect(() => new LiveGuardHandoffCoordinator({ capitalUsdc: -500 })).toThrow(/capitalUsdc must be positive/i);
    });
  });
});
