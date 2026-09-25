import { describe, it, expect, beforeEach } from 'vitest';
import {
  LiveGuardHandoffCoordinator,
  type LiveOrderHandoffRequest,
} from '../live-guard-handoff';
import type { PolymarketOrder } from '../polymarket-signer';
import type { TradeSignal } from '../../polymarket/strategy-live-bridge-types';

const CAPITAL = 100_000;

function createOrder(price = 0.50, size = 100): PolymarketOrder {
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

function createSignal(ageMs = 10): TradeSignal {
  return {
    tokenId: '0x-token-alpha',
    side: 'BUY',
    size: 100,
    price: 0.50,
    confidence: 0.85,
    timestamp: Date.now() - ageMs,
  };
}

describe('Empirical Challenge: Token Bucket Rate Limiter', () => {
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

  it('allows 10 burst orders in same second, strictly rejects 11th order', () => {
    const request: LiveOrderHandoffRequest = {
      strategyId: 'strat-burst-test',
      lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
      signal: createSignal(10),
      order: createOrder(0.50, 100),
    };

    for (let i = 1; i <= 10; i++) {
      const verdict = coordinator.evaluateLiveOrder(request);
      expect(verdict.approved).toBe(true);
      expect(verdict.checks.rateLimitOk).toBe(true);
    }

    const overflowVerdict = coordinator.evaluateLiveOrder(request);
    expect(overflowVerdict.approved).toBe(false);
    expect(overflowVerdict.checks.rateLimitOk).toBe(false);
    expect(overflowVerdict.reason).toMatch(/RATE_LIMITED.*exceeded rate limit of 5 orders\/sec/i);
  });

  it('provides per-strategy rate limiter isolation (burst on Strategy A does not affect Strategy B)', () => {
    const requestA: LiveOrderHandoffRequest = {
      strategyId: 'strat-isolated-A',
      lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
      signal: createSignal(10),
      order: createOrder(0.50, 100),
    };

    const requestB: LiveOrderHandoffRequest = {
      strategyId: 'strat-isolated-B',
      lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
      signal: createSignal(10),
      order: createOrder(0.50, 100),
    };

    for (let i = 0; i < 10; i++) {
      expect(coordinator.evaluateLiveOrder(requestA).approved).toBe(true);
    }
    expect(coordinator.evaluateLiveOrder(requestA).approved).toBe(false);

    const verdictB = coordinator.evaluateLiveOrder(requestB);
    expect(verdictB.approved).toBe(true);
    expect(verdictB.checks.rateLimitOk).toBe(true);
  });
});
