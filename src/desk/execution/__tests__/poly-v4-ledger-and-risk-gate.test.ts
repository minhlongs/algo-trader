/**
 * POLY-ALPHA-HUNTER-V4 §13.2 core port tests:
 * the 10-rule CLOB V2 pre-trade risk gate and the two-sided reward depth rule.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PRETRADE_RISK_GATE_CONFIG_V2,
  PolymarketV2PreTradeRiskGate,
  computeEffectiveRewardDepthMicro,
  floorMarketBuyNotionalMicro,
  type PreTradeOrderCandidateV2,
} from '../polymarket-v2-pretrade-risk-gate';

const baseCandidate: PreTradeOrderCandidateV2 = {
  priceMicro: 520_000,
  sharesMicro: 10_000_000,
  tickSizeMicro: 1_000,
  isLimitOrder: true,
  rawFreeBalanceMicro: 100_000_000,
  currentVpin: 0.2,
  clusterCvar99Pct: 0.01,
  consecutiveBookErrors: 0,
};

describe('CLOB V2 pre-trade risk gate', () => {
  const gate = new PolymarketV2PreTradeRiskGate();

  it('lets a compliant two-sided limit order through', () => {
    const res = gate.validateOrder(baseCandidate);
    expect(res.allowed).toBe(true);
    expect(res.effectiveFreeBalanceMicro).toBe(80_000_000);
    expect(res.requiredNotionalMicro).toBe(5_200_000);
  });

  it('trips the orderbook consecutive error circuit breaker first', () => {
    const res = gate.validateOrder({
      ...baseCandidate,
      consecutiveBookErrors: DEFAULT_PRETRADE_RISK_GATE_CONFIG_V2.maxConsecutiveBookErrors,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('BOOK_ERROR_CIRCUIT_BREAKER');
  });

  it('blocks VPIN toxicity above 0.70 and cluster CVaR above 3.5%', () => {
    expect(gate.validateOrder({ ...baseCandidate, currentVpin: 0.71 }).reason).toBe('VPIN_TOXICITY_EXCEEDED');
    expect(gate.validateOrder({ ...baseCandidate, clusterCvar99Pct: 0.04 }).reason).toBe('CLUSTER_CVAR_EXCEEDED');
  });

  it('blocks prices outside [$0.02, $0.98], off-grid ticks, and unaligned prices', () => {
    expect(gate.validateOrder({ ...baseCandidate, priceMicro: 10_000 }).reason).toBe('PRICE_OUTSIDE_EXTREME_CUTOFFS');
    expect(gate.validateOrder({ ...baseCandidate, priceMicro: 990_000 }).reason).toBe('PRICE_OUTSIDE_EXTREME_CUTOFFS');
    expect(gate.validateOrder({ ...baseCandidate, tickSizeMicro: 3_333 }).reason).toBe('INVALID_TICK_SIZE_GRID');
    expect(gate.validateOrder({ ...baseCandidate, priceMicro: 525_000, tickSizeMicro: 10_000 }).reason)
      .toBe('PRICE_NOT_ALIGNED_TO_TICK');
  });

  it('enforces 5-share min limit size and floors market BUY collateral to 2 decimals', () => {
    expect(gate.validateOrder({ ...baseCandidate, sharesMicro: 4_999_999 }).reason).toBe('BELOW_MIN_LIMIT_SHARES');
    const res = gate.validateOrder({
      ...baseCandidate, isLimitOrder: false, isMarketBuyFakOrFok: true, sharesMicro: 1, priceMicro: 20_000,
    });
    expect(res.sanitizedNotionalMicro).toBe(0);
    expect(res.reason).toBe('MARKET_BUY_NOTIONAL_ZERO_AFTER_FLOOR');
    expect(floorMarketBuyNotionalMicro(1_000)).toBe(0);
    expect(floorMarketBuyNotionalMicro(10_999)).toBe(10_000);
    expect(floorMarketBuyNotionalMicro(5_250_000)).toBe(5_250_000);
  });

  it('enforces the 20% stale balance reserve and per-market exposure cap', () => {
    const res = gate.validateOrder({ ...baseCandidate, rawFreeBalanceMicro: 1_000_000 });
    expect(res.effectiveFreeBalanceMicro).toBe(800_000);
    expect(res.reason).toBe('INSUFFICIENT_RESERVED_BALANCE');
    const cap = DEFAULT_PRETRADE_RISK_GATE_CONFIG_V2.maxMarketExposureMicro;
    expect(gate.validateOrder({ ...baseCandidate, currentMarketExposureMicro: cap }).reason)
      .toBe('MARKET_EXPOSURE_CAP_EXCEEDED');
    expect(gate.validateOrder({ ...baseCandidate, currentMarketExposureMicro: cap - 10_000_000 }).allowed).toBe(true);
  });

  it('applies the 2-decimal notional floor to market SELLs too', () => {
    const marketSell = {
      ...baseCandidate, isLimitOrder: false, isMarketBuyFakOrFok: false, sharesMicro: 1,
    };
    const res = gate.validateOrder(marketSell);
    expect(res.reason).toBe('MARKET_BUY_NOTIONAL_ZERO_AFTER_FLOOR');
    expect(res.sanitizedNotionalMicro).toBe(0);
    // 1 share @ 0.52 = 0.52 pUSD = 520_000 micro, which survives the 2-decimal floor.
    expect(gate.validateOrder({ ...marketSell, sharesMicro: 1_000_000 }).sanitizedNotionalMicro)
      .toBe(520_000);
    expect(gate.validateOrder({ ...marketSell, sharesMicro: 1_000_000 }).allowed).toBe(true);
  });

  it('rejects non-finite order terms instead of passing them as a spend-free order', () => {
    const nanShares = gate.validateOrder({ ...baseCandidate, sharesMicro: Number.NaN });
    expect(nanShares.allowed).toBe(false);
    expect(nanShares.reason).toBe('NON_FINITE_ORDER_TERMS');
    expect(gate.validateOrder({ ...baseCandidate, priceMicro: Number.NaN }).reason)
      .toBe('NON_FINITE_ORDER_TERMS');
    expect(gate.validateOrder({ ...baseCandidate, tickSizeMicro: Number.POSITIVE_INFINITY }).reason)
      .toBe('NON_FINITE_ORDER_TERMS');
    expect(gate.validateOrder({ ...baseCandidate, rawFreeBalanceMicro: Number.NaN }).reason)
      .toBe('NON_FINITE_ORDER_TERMS');
  });
});

describe('two-sided liquidity reward depth rule', () => {
  it('credits max(Qbid, Qask) / 3 inside [0.10, 0.90] and strict min outside', () => {
    expect(computeEffectiveRewardDepthMicro(900, 300, 500_000)).toBe(300);
    expect(computeEffectiveRewardDepthMicro(900, 900, 500_000)).toBe(900);
    expect(computeEffectiveRewardDepthMicro(900, 300, 950_000)).toBe(300);
    expect(computeEffectiveRewardDepthMicro(900, 300, 50_000)).toBe(300);
    expect(computeEffectiveRewardDepthMicro(-10, -20, 500_000)).toBe(0);
  });
});
