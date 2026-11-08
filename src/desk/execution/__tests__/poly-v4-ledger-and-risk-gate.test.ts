/**
 * POLY-ALPHA-HUNTER-V4 §13.2/§13.3 core port tests:
 * the integer micro-unit 5-tier FIFO ledger and the 10-rule CLOB V2 pre-trade risk gate.
 */

import { describe, it, expect } from 'vitest';
import {
  MICRO_PER_PUSD,
  IntegerMicroUnitFifoLedger,
  type LedgerEvent,
} from '../integer-micro-unit-fifo-ledger';
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

describe('integer micro-unit FIFO ledger', () => {
  it('keeps every value in integer micro-units with no rounding drift', () => {
    expect(MICRO_PER_PUSD).toBe(1_000_000);
    const ledger = new IntegerMicroUnitFifoLedger();
    ledger.apply({ kind: 'buy', tokenId: 't1', sharesMicro: 1_000_001, priceMicro: 333_333 });
    expect(ledger.openSharesMicro('t1')).toBe(1_000_001);
    expect(ledger.realizableCashMicro).toBe(-333_333);
  });

  it('separates realized trading PnL, rebate income, liquidity rewards, and settlement', () => {
    const ledger = new IntegerMicroUnitFifoLedger();
    ledger.apply({
      kind: 'buy', tokenId: 't1', sharesMicro: 1_000_000, priceMicro: 400_000,
      rebateMicro: 2_000, liquidityRewardMicro: 5_000, feeMicro: 0,
    });
    ledger.apply({ kind: 'sell', tokenId: 't1', sharesMicro: 1_000_000, priceMicro: 600_000 });
    expect(ledger.realizedTradingPnlMicro).toBe(200_000);
    expect(ledger.accruedRebateIncomeMicro).toBe(2_000);
    expect(ledger.accruedLiquidityRewardMicro).toBe(5_000);
    expect(ledger.settledRedemptionPnlMicro).toBe(0);
    expect(ledger.totalRealizedNetPnlMicro()).toBe(207_000);
    expect(ledger.openSharesMicro('t1')).toBe(0);
  });

  it('disposes FIFO lots oldest-first and amortizes entry fees pro-rata', () => {
    const ledger = new IntegerMicroUnitFifoLedger();
    const events: LedgerEvent[] = [
      { kind: 'buy', tokenId: 't1', sharesMicro: 100, priceMicro: 300_000, feeMicro: 60 },
      { kind: 'buy', tokenId: 't1', sharesMicro: 100, priceMicro: 500_000, feeMicro: 60 },
    ];
    for (const e of events) ledger.apply(e);
    ledger.apply({ kind: 'sell', tokenId: 't1', sharesMicro: 150, priceMicro: 500_000 });
    expect(ledger.openSharesMicro('t1')).toBe(50);
    expect(ledger.openCostBasisMicro('t1')).toBe(25 + 30);
  });

  it('throws on selling more shares than the open FIFO inventory holds', () => {
    const ledger = new IntegerMicroUnitFifoLedger();
    ledger.apply({ kind: 'buy', tokenId: 't1', sharesMicro: 10, priceMicro: 500_000 });
    expect(() => ledger.apply({ kind: 'sell', tokenId: 't1', sharesMicro: 11, priceMicro: 500_000 }))
      .toThrow(/Insufficient FIFO inventory/);
  });

  it('marks open positions to market against VWAP bid minus exit taker fee', () => {
    const ledger = new IntegerMicroUnitFifoLedger();
    ledger.apply({ kind: 'buy', tokenId: 't1', sharesMicro: 1_000_000, priceMicro: 400_000 });
    const mtm = ledger.computeUnrealizedMtmMicro(
      't1',
      [
        { priceMicro: 600_000, sharesMicro: 500_000 },
        { priceMicro: 500_000, sharesMicro: 500_000 },
      ],
      100,
    );
    expect(mtm.vwapBidMicro).toBe(550_000);
    expect(mtm.exitFeeMicro).toBe(5_500);
    expect(mtm.unrealizedMtmMicro).toBe(144_500);
  });

  it('settles redemption PnL in its own bucket and rejects negative inputs', () => {
    const ledger = new IntegerMicroUnitFifoLedger();
    ledger.apply({ kind: 'buy', tokenId: 't1', sharesMicro: 1_000_000, priceMicro: 400_000 });
    ledger.apply({ kind: 'settle', tokenId: 't1', sharesMicro: 1_000_000, priceMicro: 1_000_000 });
    expect(ledger.settledRedemptionPnlMicro).toBe(600_000);
    expect(ledger.realizedTradingPnlMicro).toBe(0);
    expect(ledger.totalRealizedNetPnlMicro()).toBe(600_000);
    expect(() => ledger.apply({ kind: 'buy', tokenId: 't1', sharesMicro: -1, priceMicro: 500_000 }))
      .toThrow(/non-negative/);
  });
});

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
