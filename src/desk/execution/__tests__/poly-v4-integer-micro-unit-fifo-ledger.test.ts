/**
 * POLY-ALPHA-HUNTER-V4 §13.3 core port tests:
 * the integer micro-unit 5-tier FIFO ledger and executable-depth MTM valuation.
 */

import { describe, it, expect } from 'vitest';
import {
  MICRO_PER_PUSD,
  IntegerMicroUnitFifoLedger,
  type LedgerEvent,
} from '../integer-micro-unit-fifo-ledger';

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

  it('mutates no cash or PnL state when an over-sell throws', () => {
    const ledger = new IntegerMicroUnitFifoLedger();
    ledger.apply({ kind: 'buy', tokenId: 't1', sharesMicro: 10, priceMicro: 500_000 });
    const snap = () => ({
      cash: ledger.realizableCashMicro,
      settled: ledger.settledRedemptionPnlMicro,
    });
    const before = snap();
    expect(() => ledger.apply({ kind: 'settle', tokenId: 't1', sharesMicro: 11, priceMicro: 1_000_000 }))
      .toThrow(/Insufficient FIFO inventory/);
    expect(snap()).toEqual(before);
  });

  it('accrues no income for a sell that throws for insufficient inventory', () => {
    const ledger = new IntegerMicroUnitFifoLedger();
    ledger.apply({
      kind: 'buy', tokenId: 't1', sharesMicro: 100, priceMicro: 300_000,
      feeMicro: 60, rebateMicro: 10, liquidityRewardMicro: 20,
    });
    expect(ledger.totalRealizedNetPnlMicro()).toBe(30);
    const before = {
      pnl: ledger.totalRealizedNetPnlMicro(),
      rebate: ledger.accruedRebateIncomeMicro,
      reward: ledger.accruedLiquidityRewardMicro,
      fees: ledger.totalTakerFeesPaidMicro,
    };
    expect(() => ledger.apply({
      kind: 'sell', tokenId: 't1', sharesMicro: 150, priceMicro: 500_000,
      feeMicro: 5, rebateMicro: 7, liquidityRewardMicro: 9,
    })).toThrow(/Insufficient FIFO inventory/);
    expect(before).toEqual({
      pnl: ledger.totalRealizedNetPnlMicro(),
      rebate: ledger.accruedRebateIncomeMicro,
      reward: ledger.accruedLiquidityRewardMicro,
      fees: ledger.totalTakerFeesPaidMicro,
    });
  });

  it('accrues no income for a settle that throws for insufficient inventory', () => {
    const ledger = new IntegerMicroUnitFifoLedger();
    ledger.apply({ kind: 'buy', tokenId: 't1', sharesMicro: 100, priceMicro: 300_000, feeMicro: 0 });
    expect(() => ledger.apply({
      kind: 'settle', tokenId: 't1', sharesMicro: 150, priceMicro: 1_000_000,
      feeMicro: 3, rebateMicro: 50, liquidityRewardMicro: 4,
    })).toThrow(/Insufficient FIFO inventory/);
    expect(ledger.accruedRebateIncomeMicro).toBe(0);
    expect(ledger.accruedLiquidityRewardMicro).toBe(0);
    expect(ledger.totalTakerFeesPaidMicro).toBe(0);
    expect(ledger.settledRedemptionPnlMicro).toBe(0);
  });

  it('prices MTM only over the depth the bid book can absorb', () => {
    const ledger = new IntegerMicroUnitFifoLedger();
    ledger.apply({ kind: 'buy', tokenId: 't1', sharesMicro: 1_000_000, priceMicro: 400_000 });
    const mtm = ledger.computeUnrealizedMtmMicro(
      't1',
      [{ priceMicro: 600_000, sharesMicro: 100_000 }],
      100,
    );
    // The executable price is 600,000 on the 100,000 shares the book absorbs — not a
    // blended 60,000 that silently marks the uncovered 900,000 shares as worthless.
    expect(mtm.vwapBidMicro).toBe(600_000);
    expect(mtm.filledSharesMicro).toBe(100_000);
    expect(mtm.unfilledSharesMicro).toBe(900_000);
    expect(mtm.fullyFillable).toBe(false);
    // 100_000 shares @ 600_000 micro = 60_000 micro gross, minus 1% exit fee (600),
    // minus the 400_000 micro cost basis of the full position.
    expect(mtm.unrealizedMtmMicro).toBe(60_000 - 600 - 400_000);
  });

  it('reports an empty book as unfilled rather than a priced position', () => {
    const ledger = new IntegerMicroUnitFifoLedger();
    ledger.apply({ kind: 'buy', tokenId: 't1', sharesMicro: 1_000_000, priceMicro: 400_000 });
    const mtm = ledger.computeUnrealizedMtmMicro('t1', [], 100);
    expect(mtm.exitFeeMicro).toBe(0);
    expect(mtm.vwapBidMicro).toBe(0);
    expect(mtm.unfilledSharesMicro).toBe(1_000_000);
    expect(mtm.fullyFillable).toBe(false);
  });

  it('reports full fill at a single depth when the book covers the whole position', () => {
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
    expect(mtm.filledSharesMicro).toBe(1_000_000);
    expect(mtm.unfilledSharesMicro).toBe(0);
    expect(mtm.fullyFillable).toBe(true);
    expect(mtm.vwapBidMicro).toBe(550_000);
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
