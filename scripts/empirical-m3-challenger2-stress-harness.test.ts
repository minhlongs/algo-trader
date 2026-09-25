/**
 * Standalone Empirical Stress Test Harness: Milestone 3 Live Guard Handoff
 *
 * Challenger 2 Verification Harness for LiveGuardHandoffCoordinator
 *
 * Verifies:
 * 1. Promotion state gating: DISCOVERED, PAPER_ACTIVE, RETIRED orders strictly rejected before risk check.
 * 2. Signal TTL boundary: age 199ms passes, age 201ms rejected with STALE / TTL expired.
 * 3. Token bucket rate limiter: 10 burst orders pass, 11th order in same second rejected.
 * 4. Position size boundary on $100k capital: $2,000.00 (2.0%) passes, $2,000.01 rejected.
 * 5. Daily drawdown boundary: -$4,999 on $100k passes, -$5,000 (5.0%) rejected.
 * 6. Circuit breaker: 3 consecutive losses trip breaker; subsequent orders rejected until resetCircuit().
 * 7. Feedback loop: recordFillOutcome correctly updates guard wins, losses, daily PnL, and TieredDrawdownBreaker.
 */

import { describe, it, expect } from 'vitest';
import {
  LiveGuardHandoffCoordinator,
  type LiveOrderHandoffRequest,
  type AlphaLifecycleState,
} from '../src/desk/execution/live-guard-handoff';
import { TieredDrawdownBreaker } from '../src/desk/risk/tiered-drawdown-breaker';
import type { PolymarketOrder } from '../src/desk/execution/polymarket-signer';
import type { TradeSignal } from '../src/polymarket/strategy-live-bridge-types';

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

function createSignal(ageMs = 50): TradeSignal {
  return {
    tokenId: '0x-token-alpha',
    side: 'BUY',
    size: 1000,
    price: 0.50,
    confidence: 0.85,
    timestamp: Date.now() - ageMs,
  };
}

describe('Challenger 2 Milestone 3 Empirical Harness', () => {
  describe('Requirement 1: Promotion state gating', () => {
    it('strictly rejects DISCOVERED, PAPER_ACTIVE, RETIRED before risk checks', () => {
      const coord = new LiveGuardHandoffCoordinator({ capitalUsdc: CAPITAL });
      const nonEligible: AlphaLifecycleState[] = ['DISCOVERED', 'PAPER_ACTIVE', 'RETIRED'];

      for (const state of nonEligible) {
        const req: LiveOrderHandoffRequest = {
          strategyId: `strat-${state}`,
          lifecycleState: state,
          signal: createSignal(20),
          order: createOrder(0.50, 1000),
        };
        const verdict = coord.evaluateLiveOrder(req);
        expect(verdict.approved).toBe(false);
        expect(verdict.checks.promotionEligible).toBe(false);
        expect(verdict.reason).toContain('must be PROMOTED_LIVE_ELIGIBLE');
      }

      // Permitted
      const validReq: LiveOrderHandoffRequest = {
        strategyId: 'strat-promoted',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: createSignal(20),
        order: createOrder(0.50, 1000),
      };
      const validVerdict = coord.evaluateLiveOrder(validReq);
      expect(validVerdict.approved).toBe(true);
      expect(validVerdict.checks.promotionEligible).toBe(true);

      // Pre-check short-circuit: adversarial order with huge size and stale signal
      const advReq: LiveOrderHandoffRequest = {
        strategyId: 'strat-adv',
        lifecycleState: 'DISCOVERED',
        signal: createSignal(10_000),
        order: createOrder(1.0, 50_000_000),
      };
      const advVerdict = coord.evaluateLiveOrder(advReq);
      expect(advVerdict.approved).toBe(false);
      expect(advVerdict.checks.promotionEligible).toBe(false);
      expect(advVerdict.checks.signalTtlOk).toBe(true);
      expect(advVerdict.checks.positionSizeOk).toBe(true);
    });
  });

  describe('Requirement 2: Signal TTL boundary', () => {
    it('passes age 199ms, rejects age 201ms with STALE / TTL expired', () => {
      const coord = new LiveGuardHandoffCoordinator({ capitalUsdc: CAPITAL, signalTtlMs: 200 });
      const now = Date.now();

      // 199ms
      const passReq: LiveOrderHandoffRequest = {
        strategyId: 'strat-ttl',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: {
          tokenId: '0x-token-alpha',
          side: 'BUY',
          size: 1000,
          price: 0.50,
          timestamp: now - 199,
        },
        order: createOrder(0.50, 1000),
      };
      const passVerdict = coord.evaluateLiveOrder(passReq);
      expect(passVerdict.approved).toBe(true);
      expect(passVerdict.checks.signalTtlOk).toBe(true);

      // 201ms
      const failReq: LiveOrderHandoffRequest = {
        strategyId: 'strat-ttl',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: {
          tokenId: '0x-token-alpha',
          side: 'BUY',
          size: 1000,
          price: 0.50,
          timestamp: now - 201,
        },
        order: createOrder(0.50, 1000),
      };
      const failVerdict = coord.evaluateLiveOrder(failReq);
      expect(failVerdict.approved).toBe(false);
      expect(failVerdict.checks.signalTtlOk).toBe(false);
      expect(failVerdict.reason).toMatch(/STALE_SIGNAL.*exceeds TTL of 200ms/i);
    });
  });

  describe('Requirement 3: Token bucket rate limiter', () => {
    it('allows 10 burst orders in same second, rejects 11th order', () => {
      const coord = new LiveGuardHandoffCoordinator({
        capitalUsdc: CAPITAL,
        rateLimitBurst: 10,
        rateLimitOrdersPerSec: 5,
      });

      const req: LiveOrderHandoffRequest = {
        strategyId: 'strat-burst',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: createSignal(20),
        order: createOrder(0.50, 100),
      };

      for (let i = 1; i <= 10; i++) {
        const v = coord.evaluateLiveOrder(req);
        expect(v.approved).toBe(true);
        expect(v.checks.rateLimitOk).toBe(true);
      }

      const v11 = coord.evaluateLiveOrder(req);
      expect(v11.approved).toBe(false);
      expect(v11.checks.rateLimitOk).toBe(false);
      expect(v11.reason).toContain('RATE_LIMITED');
    });
  });

  describe('Requirement 4: Position size boundary on $100k capital', () => {
    it('passes $2,000.00 (2.0%), rejects $2,000.01', () => {
      const coord = new LiveGuardHandoffCoordinator({
        capitalUsdc: CAPITAL,
        maxPositionFraction: 0.02,
      });

      // $2,000.00 passes
      const passReq: LiveOrderHandoffRequest = {
        strategyId: 'strat-pos',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: createSignal(20),
        order: createOrder(1.00, 2000.00),
      };
      const passVerdict = coord.evaluateLiveOrder(passReq);
      expect(passVerdict.approved).toBe(true);
      expect(passVerdict.checks.positionSizeOk).toBe(true);

      // $2,000.01 rejected
      const failReq: LiveOrderHandoffRequest = {
        strategyId: 'strat-pos',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: createSignal(20),
        order: createOrder(1.00, 2000.01),
      };
      const failVerdict = coord.evaluateLiveOrder(failReq);
      expect(failVerdict.approved).toBe(false);
      expect(failVerdict.checks.positionSizeOk).toBe(false);
      expect(failVerdict.reason).toContain('exceeds max position $2000.00');
    });
  });

  describe('Requirement 5: Daily drawdown boundary', () => {
    it('passes -$4,999 on $100k capital, rejects -$5,000 (5.0%)', () => {
      const coord = new LiveGuardHandoffCoordinator({
        capitalUsdc: CAPITAL,
        maxDailyDrawdown: 0.05,
      });

      const req: LiveOrderHandoffRequest = {
        strategyId: 'strat-dd',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: createSignal(20),
        order: createOrder(0.50, 1000),
      };

      coord.recordFillOutcome('strat-dd', -4999);
      expect(coord.getStatus().guardStatus.dailyPnl).toBe(-4999);
      const passVerdict = coord.evaluateLiveOrder(req);
      expect(passVerdict.approved).toBe(true);
      expect(passVerdict.checks.dailyDrawdownOk).toBe(true);

      coord.recordFillOutcome('strat-dd', -1);
      expect(coord.getStatus().guardStatus.dailyPnl).toBe(-5000);
      const failVerdict = coord.evaluateLiveOrder(req);
      expect(failVerdict.approved).toBe(false);
      expect(failVerdict.checks.dailyDrawdownOk).toBe(false);
      expect(failVerdict.reason).toContain('Daily drawdown 5.0% exceeds limit 5%');
    });
  });

  describe('Requirement 6: Circuit breaker', () => {
    it('trips breaker on 3 consecutive losses; rejects orders until resetCircuit()', () => {
      const coord = new LiveGuardHandoffCoordinator({
        capitalUsdc: CAPITAL,
        maxConsecutiveLosses: 3,
      });

      const req: LiveOrderHandoffRequest = {
        strategyId: 'strat-cb',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: createSignal(20),
        order: createOrder(0.50, 1000),
      };

      coord.recordFillOutcome('strat-cb', -50);
      expect(coord.evaluateLiveOrder(req).approved).toBe(true);

      coord.recordFillOutcome('strat-cb', -50);
      expect(coord.evaluateLiveOrder(req).approved).toBe(true);

      coord.recordFillOutcome('strat-cb', 100);
      expect(coord.getStatus().guardStatus.consecutiveLosses).toBe(0);

      coord.recordFillOutcome('strat-cb', -50);
      coord.recordFillOutcome('strat-cb', -50);
      coord.recordFillOutcome('strat-cb', -50);
      expect(coord.getStatus().guardStatus.circuitTripped).toBe(true);

      const trippedVerdict = coord.evaluateLiveOrder(req);
      expect(trippedVerdict.approved).toBe(false);
      expect(trippedVerdict.checks.circuitBreakerOk).toBe(false);
      expect(trippedVerdict.reason).toContain('Circuit breaker tripped after 3 consecutive losses');

      coord.resetCircuit();
      expect(coord.getStatus().guardStatus.circuitTripped).toBe(false);
      expect(coord.evaluateLiveOrder(req).approved).toBe(true);
    });
  });

  describe('Requirement 7: Feedback loop', () => {
    it('recordFillOutcome updates guard wins, losses, daily PnL, and TieredDrawdownBreaker', () => {
      const breaker = new TieredDrawdownBreaker(CAPITAL, { haltThreshold: 0.15 });
      breaker.reset(CAPITAL);

      const coord = new LiveGuardHandoffCoordinator({
        capitalUsdc: CAPITAL,
        drawdownBreaker: breaker,
      });

      coord.recordFillOutcome('strat-fb', 500);
      let guardStatus = coord.getStatus().guardStatus;
      expect(guardStatus.totalWins).toBe(1);
      expect(guardStatus.dailyPnl).toBe(500);

      coord.recordFillOutcome('strat-fb', -200);
      guardStatus = coord.getStatus().guardStatus;
      expect(guardStatus.totalWins).toBe(1);
      expect(guardStatus.totalLosses).toBe(1);
      expect(guardStatus.dailyPnl).toBe(300);
      expect(guardStatus.consecutiveLosses).toBe(1);

      coord.recordFillOutcome('strat-fb', -16000, 84000);
      expect(breaker.getState().tier).toBe('HALT');
      expect(coord.getStatus().canOpenNewTrades).toBe(false);

      const req: LiveOrderHandoffRequest = {
        strategyId: 'strat-fb',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: createSignal(20),
        order: createOrder(0.50, 1000),
      };
      const haltedVerdict = coord.evaluateLiveOrder(req);
      expect(haltedVerdict.approved).toBe(false);
      expect(haltedVerdict.checks.drawdownBreakerOk).toBe(false);
      expect(haltedVerdict.reason).toContain('DRAWDOWN_BREAKER: Trading halted in tier HALT');
    });
  });
});
