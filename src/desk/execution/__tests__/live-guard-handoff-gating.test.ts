import { describe, it, expect, beforeEach } from 'vitest';
import {
  LiveGuardHandoffCoordinator,
  type LiveOrderHandoffRequest,
} from '../live-guard-handoff';
import type { PolymarketOrder } from '../polymarket-signer';
import type { TradeSignal } from '../../polymarket/strategy-live-bridge-types';
import { TieredDrawdownBreaker } from '../../risk/tiered-drawdown-breaker';

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

describe('LiveGuardHandoffCoordinator Gating & Rate Limits', () => {
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

  describe('isPromotionEligible', () => {
    it('returns true ONLY for PROMOTED_LIVE_ELIGIBLE', () => {
      expect(coordinator.isPromotionEligible('PROMOTED_LIVE_ELIGIBLE')).toBe(true);
    });

    it('returns false for DISCOVERED, PAPER_ACTIVE, and RETIRED', () => {
      expect(coordinator.isPromotionEligible('DISCOVERED')).toBe(false);
      expect(coordinator.isPromotionEligible('PAPER_ACTIVE')).toBe(false);
      expect(coordinator.isPromotionEligible('RETIRED')).toBe(false);
    });
  });

  describe('evaluateLiveOrder — Pre-Risk Chain Gating', () => {
    it('Step 1: rejects when lifecycleState is not PROMOTED_LIVE_ELIGIBLE', () => {
      const request: LiveOrderHandoffRequest = {
        strategyId: 'strat-alpha',
        lifecycleState: 'PAPER_ACTIVE',
        signal: makeValidSignal(50),
        order: makeValidOrder(0.50, 1000),
      };

      const verdict = coordinator.evaluateLiveOrder(request);

      expect(verdict.approved).toBe(false);
      expect(verdict.checks.promotionEligible).toBe(false);
      expect(verdict.reason).toMatch(/must be PROMOTED_LIVE_ELIGIBLE/i);
    });

    it('Step 2: rejects when signal TTL is exceeded (> 200ms)', () => {
      const request: LiveOrderHandoffRequest = {
        strategyId: 'strat-alpha',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: makeValidSignal(250),
        order: makeValidOrder(0.50, 1000),
      };

      const verdict = coordinator.evaluateLiveOrder(request);

      expect(verdict.approved).toBe(false);
      expect(verdict.checks.promotionEligible).toBe(true);
      expect(verdict.checks.signalTtlOk).toBe(false);
      expect(verdict.reason).toMatch(/STALE_SIGNAL/i);
    });

    it('Step 3: rejects when rate limit is exceeded', () => {
      const burstCoord = new LiveGuardHandoffCoordinator({
        capitalUsdc: CAPITAL,
        rateLimitBurst: 2,
        rateLimitOrdersPerSec: 1,
      });

      const request: LiveOrderHandoffRequest = {
        strategyId: 'strat-fast',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: makeValidSignal(20),
        order: makeValidOrder(0.50, 100),
      };

      expect(burstCoord.evaluateLiveOrder(request).approved).toBe(true);
      expect(burstCoord.evaluateLiveOrder(request).approved).toBe(true);

      const verdict = burstCoord.evaluateLiveOrder(request);
      expect(verdict.approved).toBe(false);
      expect(verdict.checks.rateLimitOk).toBe(false);
      expect(verdict.reason).toMatch(/RATE_LIMITED/i);
    });

    it('Step 4: rejects when TieredDrawdownBreaker halts trading', () => {
      const breaker = new TieredDrawdownBreaker(CAPITAL, {
        haltThreshold: 0.15,
      });
      breaker.update(CAPITAL * 0.84);
      expect(breaker.canOpenNewTrades()).toBe(false);

      const coordWithBreaker = new LiveGuardHandoffCoordinator({
        capitalUsdc: CAPITAL,
        drawdownBreaker: breaker,
      });

      const request: LiveOrderHandoffRequest = {
        strategyId: 'strat-alpha',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: makeValidSignal(20),
        order: makeValidOrder(0.50, 1000),
      };

      const verdict = coordWithBreaker.evaluateLiveOrder(request);
      expect(verdict.approved).toBe(false);
      expect(verdict.checks.drawdownBreakerOk).toBe(false);
      expect(verdict.reason).toMatch(/DRAWDOWN_BREAKER: Trading halted/i);
    });
  });
});
