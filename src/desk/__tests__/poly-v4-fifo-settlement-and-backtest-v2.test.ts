/**
 * End-to-End Tests for POLY-ALPHA-HUNTER-V4 Stage S8:
 *   1. `PolymarketOrderReconciler.settleMarketRedemption` (binary $0/$1 redemption, zero cash drift, UNKNOWN order guard)
 *   2. `PolymarketOrderReconciler.computeUnrealizedMtm` (VWAP Bid book mark-to-market net of exit fee)
 *   3. Opt-in CLOB V2 quadratic taker fees (`calcQuadraticTakerFeeV2`) and passive maker rebates (`calcMakerRebateV2`) in `applyVenueCosts` & `BacktestOrderManager`
 */

import { describe, expect, it } from 'vitest';
import { PolymarketOrderReconciler } from '../execution/polymarket-order-reconciler';
import { MICRO_PER_PUSD } from '../execution/integer-micro-unit-fifo-ledger';
import { applyVenueCosts } from '../backtesting/backtest-fee-application';
import { BacktestOrderManager } from '../backtesting/backtest-order-manager';
import { calcMakerRebateV2, calcQuadraticTakerFeeV2 } from '../polymarket/polymarket-fee-calculator';

describe('PolymarketOrderReconciler 5-tier FIFO settlement & unrealized MTM', () => {
  it('settles winning ($1.00) and losing ($0.00) binary market redemptions into settledRedemptionPnlMicro with 0 drift', () => {
    const reconciler = new PolymarketOrderReconciler(1000);

    // Buy 50 YES shares at $0.40 ($20.00 cost + $0.10 taker fee)
    reconciler.createOrder({
      intentId: 'int-yes-1', orderId: 'ord-yes-1', marketId: 'mkt-win',
      tokenId: 'tok-yes-win', side: 'BUY', requestedSize: 50, limitPrice: 0.40, timestamp: 1000,
    });
    reconciler.applyEvent({
      eventId: 'ev-yes-1', orderId: 'ord-yes-1', type: 'FILLED',
      fillSize: 50, fillPrice: 0.40, feeUsdc: 0.10, timestamp: 1005,
    });

    // Buy 30 NO shares at $0.60 ($18.00 cost + $0.06 taker fee) on a losing token
    reconciler.createOrder({
      intentId: 'int-no-1', orderId: 'ord-no-1', marketId: 'mkt-lose',
      tokenId: 'tok-no-lose', side: 'BUY', requestedSize: 30, limitPrice: 0.60, timestamp: 1010,
    });
    reconciler.applyEvent({
      eventId: 'ev-no-1', orderId: 'ord-no-1', type: 'FILLED',
      fillSize: 30, fillPrice: 0.60, feeUsdc: 0.06, timestamp: 1015,
    });

    // Before settlement, mark tok-yes-win to market against a multi-level Bid book (Tier 5)
    const mtm = reconciler.computeUnrealizedMtm(
      'tok-yes-win',
      [{ price: 0.70, size: 30 }, { price: 0.65, size: 20 }],
      100, // 100 bps exit fee
    );
    expect(mtm.filledSharesMicro).toBe(50 * MICRO_PER_PUSD);
    expect(mtm.fullyFillable).toBe(true);
    expect(mtm.unfilledSharesMicro).toBe(0);
    // Gross bid value = 30*0.70 + 20*0.65 = $34.00; 1% exit fee = $0.34 -> net $33.66; basis $20.10 -> MTM +$13.56
    expect(mtm.unrealizedMtmUsdc).toBeCloseTo(13.56, 5);

    // Settle winning token at $1.00 per share (Tier 4)
    const winSettle = reconciler.settleMarketRedemption({
      marketId: 'mkt-win', tokenId: 'tok-yes-win', payoutPerShareUsdc: 1,
    });
    expect(winSettle.settledShares).toBe(50);
    expect(winSettle.payoutUsdc).toBe(50);
    expect(winSettle.settledRedemptionPnlUsdc).toBeCloseTo(29.90, 6);
    expect(winSettle.settledRedemptionPnlMicro).toBe(Math.round(29.90 * MICRO_PER_PUSD));

    // Settle losing token at $0.00 per share (Tier 4)
    const loseSettle = reconciler.settleMarketRedemption({
      marketId: 'mkt-lose', tokenId: 'tok-no-lose', payoutPerShareUsdc: 0,
    });
    expect(loseSettle.settledShares).toBe(30);
    expect(loseSettle.payoutUsdc).toBe(0);
    expect(loseSettle.settledRedemptionPnlUsdc).toBeCloseTo(-18.06, 6);

    const summary = reconciler.reconcile();
    expect(summary.unexplainedDriftUsdc).toBe(0);
    expect(summary.positionsByToken['tok-yes-win']).toBe(0);
    expect(summary.positionsByToken['tok-no-lose']).toBe(0);
    expect(summary.cashUsdc).toBeCloseTo(1000 - 20.10 - 18.06 + 50, 6);
    expect(summary.fifoLedger!.settledRedemptionPnlMicro).toBe(Math.round(11.84 * MICRO_PER_PUSD));
    expect(summary.fifoLedger!.totalRealizedNetPnlMicro).toBe(Math.round(11.84 * MICRO_PER_PUSD));
  });

  it('blocks settleMarketRedemption when the market has an unresolved UNKNOWN order', () => {
    const reconciler = new PolymarketOrderReconciler(1000);
    reconciler.createOrder({
      intentId: 'int-1', orderId: 'ord-1', marketId: 'mkt-blocked',
      tokenId: 'tok-1', side: 'BUY', requestedSize: 10, limitPrice: 0.50, timestamp: 1000,
    });
    reconciler.applyEvent({
      eventId: 'ev-1', orderId: 'ord-1', type: 'FILLED',
      fillSize: 10, fillPrice: 0.50, timestamp: 1005,
    });
    reconciler.createOrder({
      intentId: 'int-2', orderId: 'ord-2', marketId: 'mkt-blocked',
      tokenId: 'tok-1', side: 'SELL', requestedSize: 5, limitPrice: 0.60, timestamp: 1010,
    });
    reconciler.applyEvent({
      eventId: 'ev-timeout', orderId: 'ord-2', type: 'TIMEOUT_UNKNOWN', timestamp: 1020,
    });

    expect(() =>
      reconciler.settleMarketRedemption({
        marketId: 'mkt-blocked', tokenId: 'tok-1', payoutPerShareUsdc: 1,
      }),
    ).toThrow(/unresolved UNKNOWN order/);
  });
});

describe('Opt-in CLOB V2 quadratic fees & maker rebates in Backtest', () => {
  it('charges CLOB V2 quadratic taker fees on entry and exit legs when clobV2Category is configured', async () => {
    const entryPrice = 0.50;
    const exitPrice = 0.60;
    const size = 1000;
    const expectedFee =
      calcQuadraticTakerFeeV2('crypto', entryPrice, size, false) +
      calcQuadraticTakerFeeV2('crypto', exitPrice, size, false);

    const direct = applyVenueCosts(
      { price: exitPrice, entryPrice, size, grossPnl: 100, clobV2Category: 'crypto' },
      2,
    );
    expect(direct.feeUsd).toBeCloseTo(Math.round(expectedFee * 100) / 100, 5);
    expect(direct.rebateUsd).toBe(0);

    const manager = new BacktestOrderManager(10_000, { clobV2Category: 'crypto' });
    await manager.placeOrder({ tokenId: 'btc-yes', side: 'buy', price: entryPrice, size });
    await manager.placeOrder({ tokenId: 'btc-yes', side: 'sell', price: exitPrice, size });

    const [fillCost] = manager.getFillCosts();
    expect(fillCost!.grossPnlUsd).toBe(100);
    expect(fillCost!.feeUsd).toBe(direct.feeUsd);
    expect(fillCost!.rebateUsd).toBe(0);
    expect(fillCost!.netPnlUsd).toBe(direct.netPnl);
  });

  it('credits passive maker rebates and zero taker fee when postOnly is enabled with clobV2Category', async () => {
    const entryPrice = 0.50;
    const exitPrice = 0.55;
    const size = 1000;
    const expectedRebate =
      calcMakerRebateV2('crypto', entryPrice, size) +
      calcMakerRebateV2('crypto', exitPrice, size);

    const manager = new BacktestOrderManager(10_000, { clobV2Category: 'crypto', postOnly: true });
    await manager.placeOrder({ tokenId: 'eth-yes', side: 'buy', price: entryPrice, size });
    await manager.placeOrder({ tokenId: 'eth-yes', side: 'sell', price: exitPrice, size });

    const [fillCost] = manager.getFillCosts();
    expect(fillCost!.grossPnlUsd).toBe(50);
    expect(fillCost!.feeUsd).toBe(0);
    expect(fillCost!.rebateUsd).toBeCloseTo(Math.round(expectedRebate * 100) / 100, 5);
    expect(fillCost!.rebateUsd).toBeGreaterThan(0);
    expect(fillCost!.netPnlUsd).toBeCloseTo(50 - 0.10 + fillCost!.rebateUsd!, 5);
  });
});
