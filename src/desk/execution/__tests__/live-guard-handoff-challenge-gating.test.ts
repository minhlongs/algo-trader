import { describe, it, expect, beforeEach, vi } from 'vitest';
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

function createSignal(ageMs = 50, base = Date.now()): TradeSignal {
  return {
    tokenId: '0x-token-alpha',
    side: 'BUY',
    size: 1000,
    price: 0.50,
    confidence: 0.85,
    timestamp: base - ageMs,
  };
}

function makeRequest(
  strategyId: string,
  lifecycleState: AlphaLifecycleState,
  signal = createSignal(20),
  order = createOrder(),
): LiveOrderHandoffRequest {
  return { strategyId, lifecycleState, signal, order };
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
      const verdict = coordinator.evaluateLiveOrder(makeRequest(`strat-${state.toLowerCase()}`, state));
      expect(verdict.approved).toBe(false);
      expect(verdict.checks.promotionEligible).toBe(false);
      expect(verdict.reason).toContain('must be PROMOTED_LIVE_ELIGIBLE');
    });

    it('approves promotion eligibility check ONLY for PROMOTED_LIVE_ELIGIBLE', () => {
      const verdict = coordinator.evaluateLiveOrder(makeRequest('strat-promoted', 'PROMOTED_LIVE_ELIGIBLE'));
      expect(verdict.checks.promotionEligible).toBe(true);
      expect(verdict.approved).toBe(true);
    });

    it('adversarial test: non-promoted orders are rejected BEFORE any downstream risk check executes', () => {
      const catastrophicRequest = makeRequest(
        'strat-adversarial',
        'DISCOVERED',
        createSignal(5000),
        createOrder(1.0, 10_000_000),
      );

      const verdict = coordinator.evaluateLiveOrder(catastrophicRequest);
      expect(verdict.approved).toBe(false);
      expect(verdict.checks.promotionEligible).toBe(false);
      expect(verdict.checks.signalTtlOk).toBe(true);
      expect(verdict.checks.positionSizeOk).toBe(true);
      expect(verdict.reason).toContain('must be PROMOTED_LIVE_ELIGIBLE');

      const validPromotedRequest = makeRequest('strat-adversarial', 'PROMOTED_LIVE_ELIGIBLE');
      for (let i = 0; i < 10; i++) {
        expect(coordinator.evaluateLiveOrder(validPromotedRequest).approved).toBe(true);
      }
    });
  });

  describe('Area 2: Signal TTL Boundary', () => {
    it('approves signal with age 199ms (within 200ms TTL)', () => {
      const verdict = coordinator.evaluateLiveOrder(
        makeRequest('strat-ttl', 'PROMOTED_LIVE_ELIGIBLE', createSignal(199)),
      );
      expect(verdict.approved).toBe(true);
      expect(verdict.checks.signalTtlOk).toBe(true);
    });

    it('rejects signal with age 201ms (exceeds 200ms TTL) with STALE / TTL expired reason', () => {
      const fixedNow = 1_700_000_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
      try {
        const verdict = coordinator.evaluateLiveOrder(
          makeRequest('strat-ttl', 'PROMOTED_LIVE_ELIGIBLE', createSignal(201, fixedNow)),
        );
        expect(verdict.approved).toBe(false);
        expect(verdict.checks.signalTtlOk).toBe(false);
        expect(verdict.reason).toMatch(/STALE_SIGNAL.*exceeds TTL of 200ms/i);
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('approves signal on exact boundary age 200ms (inclusive limit: age <= 200ms)', () => {
      const fixedNow = 1_700_000_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
      try {
        const verdict = coordinator.evaluateLiveOrder(
          makeRequest('strat-ttl', 'PROMOTED_LIVE_ELIGIBLE', createSignal(200, fixedNow)),
        );
        expect(verdict.approved).toBe(true);
        expect(verdict.checks.signalTtlOk).toBe(true);
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('rejects missing or zero timestamp signal as stale', () => {
      const verdict = coordinator.evaluateLiveOrder(
        makeRequest('strat-ttl', 'PROMOTED_LIVE_ELIGIBLE', { ...createSignal(50), timestamp: 0 }),
      );
      expect(verdict.approved).toBe(false);
      expect(verdict.checks.signalTtlOk).toBe(false);
      expect(verdict.reason).toMatch(/STALE_SIGNAL/i);
    });
  });
});
