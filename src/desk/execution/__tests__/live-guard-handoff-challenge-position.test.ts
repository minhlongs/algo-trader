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

describe('Empirical Challenge: Position Size Boundary on $100k Capital', () => {
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

  it('approves order of exactly $2,000.00 (2.0% cap on $100,000)', () => {
    const request: LiveOrderHandoffRequest = {
      strategyId: 'strat-pos-boundary',
      lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
      signal: createSignal(20),
      order: createOrder(1.00, 2000.00),
    };

    const verdict = coordinator.evaluateLiveOrder(request);

    expect(verdict.approved).toBe(true);
    expect(verdict.checks.positionSizeOk).toBe(true);
  });

  it('rejects order of $2,000.01 (exceeds 2.0% cap by $0.01)', () => {
    const request: LiveOrderHandoffRequest = {
      strategyId: 'strat-pos-boundary',
      lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
      signal: createSignal(20),
      order: createOrder(1.00, 2000.01),
    };

    const verdict = coordinator.evaluateLiveOrder(request);

    expect(verdict.approved).toBe(false);
    expect(verdict.checks.positionSizeOk).toBe(false);
    expect(verdict.reason).toMatch(/Order size \$2000\.01 exceeds max position \$2000\.00 \(2% of capital\)/i);
  });

  it('evaluates position size boundary under fractional probability pricing (e.g. price $0.40)', () => {
    const passReq: LiveOrderHandoffRequest = {
      strategyId: 'strat-poly-pos',
      lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
      signal: createSignal(20),
      order: createOrder(0.40, 5000),
    };
    expect(coordinator.evaluateLiveOrder(passReq).approved).toBe(true);

    const failReq: LiveOrderHandoffRequest = {
      strategyId: 'strat-poly-pos',
      lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
      signal: createSignal(20),
      order: createOrder(0.40, 5000.25),
    };
    const verdict = coordinator.evaluateLiveOrder(failReq);
    expect(verdict.approved).toBe(false);
    expect(verdict.checks.positionSizeOk).toBe(false);
  });
});
