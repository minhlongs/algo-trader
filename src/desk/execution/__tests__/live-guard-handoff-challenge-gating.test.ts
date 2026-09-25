import { describe, it, expect, beforeEach } from 'vitest';
import {
  LiveGuardHandoffCoordinator,
  type LiveOrderHandoffRequest,
  type AlphaLifecycleState,
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

describe('Empirical Challenge: Promotion Gating & Signal TTL', () => {
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

  describe('Area 1: Promotion State Gating', () => {
    const nonEligibleStates: AlphaLifecycleState[] = ['DISCOVERED', 'PAPER_ACTIVE', 'RETIRED'];

    it.each(nonEligibleStates)('strictly rejects order with lifecycleState %s', (state) => {
      const request: LiveOrderHandoffRequest = {
        strategyId: `strat-${state.toLowerCase()}`,
        lifecycleState: state,
        signal: createSignal(20),
        order: createOrder(0.50, 1000),
      };

      const verdict = coordinator.evaluateLiveOrder(request);

      expect(verdict.approved).toBe(false);
      expect(verdict.checks.promotionEligible).toBe(false);
      expect(verdict.reason).toContain(`must be PROMOTED_LIVE_ELIGIBLE`);
    });

    it('approves promotion eligibility check ONLY for PROMOTED_LIVE_ELIGIBLE', () => {
      const request: LiveOrderHandoffRequest = {
        strategyId: 'strat-promoted',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: createSignal(20),
        order: createOrder(0.50, 1000),
      };

      const verdict = coordinator.evaluateLiveOrder(request);

      expect(verdict.checks.promotionEligible).toBe(true);
      expect(verdict.approved).toBe(true);
    });

    it('adversarial test: non-promoted orders are rejected BEFORE any downstream risk check executes', () => {
      const catastrophicRequest: LiveOrderHandoffRequest = {
        strategyId: 'strat-adversarial',
        lifecycleState: 'DISCOVERED',
        signal: createSignal(5000),
        order: createOrder(1.0, 10_000_000),
      };

      const verdict = coordinator.evaluateLiveOrder(catastrophicRequest);

      expect(verdict.approved).toBe(false);
      expect(verdict.checks.promotionEligible).toBe(false);
      expect(verdict.checks.signalTtlOk).toBe(true);
      expect(verdict.checks.positionSizeOk).toBe(true);
      expect(verdict.reason).toContain('must be PROMOTED_LIVE_ELIGIBLE');

      const validPromotedRequest: LiveOrderHandoffRequest = {
        strategyId: 'strat-adversarial',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: createSignal(20),
        order: createOrder(0.50, 1000),
      };

      for (let i = 0; i < 10; i++) {
        const v = coordinator.evaluateLiveOrder(validPromotedRequest);
        expect(v.approved).toBe(true);
      }
    });
  });

  describe('Area 2: Signal TTL Boundary', () => {
    it('approves signal with age 199ms (within 200ms TTL)', () => {
      const now = Date.now();
      const request: LiveOrderHandoffRequest = {
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

      const verdict = coordinator.evaluateLiveOrder(request);

      expect(verdict.approved).toBe(true);
      expect(verdict.checks.signalTtlOk).toBe(true);
    });

    it('rejects signal with age 201ms (exceeds 200ms TTL) with STALE / TTL expired reason', () => {
      const now = Date.now();
      const request: LiveOrderHandoffRequest = {
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

      const verdict = coordinator.evaluateLiveOrder(request);

      expect(verdict.approved).toBe(false);
      expect(verdict.checks.signalTtlOk).toBe(false);
      expect(verdict.reason).toMatch(/STALE_SIGNAL.*exceeds TTL of 200ms/i);
    });

    it('approves signal on exact boundary age 200ms (inclusive limit: age <= 200ms)', () => {
      const now = Date.now();
      const request: LiveOrderHandoffRequest = {
        strategyId: 'strat-ttl',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: {
          tokenId: '0x-token-alpha',
          side: 'BUY',
          size: 1000,
          price: 0.50,
          timestamp: now - 200,
        },
        order: createOrder(0.50, 1000),
      };

      const verdict = coordinator.evaluateLiveOrder(request);

      expect(verdict.approved).toBe(true);
      expect(verdict.checks.signalTtlOk).toBe(true);
    });

    it('rejects missing or zero timestamp signal as stale', () => {
      const request: LiveOrderHandoffRequest = {
        strategyId: 'strat-ttl',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: {
          tokenId: '0x-token-alpha',
          side: 'BUY',
          size: 1000,
          price: 0.50,
          timestamp: 0,
        },
        order: createOrder(0.50, 1000),
      };

      const verdict = coordinator.evaluateLiveOrder(request);

      expect(verdict.approved).toBe(false);
      expect(verdict.checks.signalTtlOk).toBe(false);
      expect(verdict.reason).toMatch(/STALE_SIGNAL/i);
    });
  });
});
