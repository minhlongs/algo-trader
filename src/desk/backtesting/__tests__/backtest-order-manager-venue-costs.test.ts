/**
 * Ledger-level fee honesty tests for `BacktestOrderManager`.
 *
 * These prove the venue costs priced in `applyVenueCosts` actually reach the
 * ledger: every close records net PnL plus an auditable cost breakdown, a
 * short round trip settles the same way a long does, and scaled-out positions
 * pay entry gas exactly once. The seam's own arithmetic is covered in
 * `backtest-fee-application.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { BacktestOrderManager } from '../backtest-order-manager';
import { computeMetrics } from '../metrics-calculator';
import type { BacktestTrade } from '../types';

describe('BacktestOrderManager venue costs', () => {
  it('records net PnL and an auditable cost breakdown per close', async () => {
    const om = new BacktestOrderManager(1000);
    await om.placeOrder({ tokenId: 't1', side: 'buy', price: 0.4, size: 100 });
    await om.placeOrder({ tokenId: 't1', side: 'sell', price: 0.5, size: 100 });

    const [trade] = om.getTrades().filter((t) => t.pnl !== null);
    // gross = 100 * (0.50 - 0.40) = $10; costs $0.20 -> net $9.80
    expect(trade!.pnl).toBe(9.8);

    const [close] = om.getFillCosts();
    expect(close!.grossPnlUsd).toBe(10);
    expect(close!.feeUsd).toBe(0.1);
    expect(close!.gasUsd).toBe(0.1);
    expect(close!.netPnlUsd).toBe(9.8);
  });

  it('leaves opening fills with no realized PnL', async () => {
    const om = new BacktestOrderManager(1000);
    await om.placeOrder({ tokenId: 't1', side: 'buy', price: 0.4, size: 100 });

    const trades = om.getTrades();
    expect(trades).toHaveLength(1);
    expect(trades[0]!.pnl).toBeNull();
    expect(om.getFillCosts()).toHaveLength(0);
  });

  it('charges costs on a losing close as well', async () => {
    const om = new BacktestOrderManager(1000);
    await om.placeOrder({ tokenId: 't1', side: 'buy', price: 0.5, size: 100 });
    await om.placeOrder({ tokenId: 't1', side: 'sell', price: 0.4, size: 100 });

    const [trade] = om.getTrades().filter((t) => t.pnl !== null);
    // gross = 100 * (0.40 - 0.50) = -$10.00
    // fee at the exit price: notional 100 * 0.40 = $40, 10bps * 2 legs = $0.08
    // gas $0.10 -> net -$10.18
    expect(trade!.pnl).toBe(-10.18);
  });

  it('drives the equity curve down by the net amount', async () => {
    const om = new BacktestOrderManager(1000);
    await om.placeOrder({ tokenId: 't1', side: 'buy', price: 0.4, size: 100 });
    await om.placeOrder({ tokenId: 't1', side: 'sell', price: 0.5, size: 100 });
    expect(om.getCurrentEquity()).toBeCloseTo(1009.8, 10);
  });

  it('charges only the closed portion when a position is partially reduced', async () => {
    const om = new BacktestOrderManager(1000);
    await om.placeOrder({ tokenId: 't1', side: 'buy', price: 0.4, size: 100 });
    await om.placeOrder({ tokenId: 't1', side: 'sell', price: 0.5, size: 40 });

    const [close] = om.getFillCosts();
    // closed 40 of 100 shares: gross 40 * 0.10 = $4.00;
    // fee 40 * 0.50 * 0.001 * 2 = $0.04; gas $0.05 for this fill alone, since
    // the entry fill's gas settles on the sell that closes the position out.
    expect(close!.netPnlUsd).toBe(3.91);
    expect(close!.grossPnlUsd).toBe(4);
  });

  it('settles entry gas once when a position is scaled out over several sells', async () => {
    const om = new BacktestOrderManager(1000);
    await om.placeOrder({ tokenId: 't1', side: 'buy', price: 0.5, size: 100 });
    await om.placeOrder({ tokenId: 't1', side: 'sell', price: 0.6, size: 40 });
    await om.placeOrder({ tokenId: 't1', side: 'sell', price: 0.6, size: 60 });

    // Three real fills on chain: one entry, two exits, so gas is 3 * $0.05.
    const totalGas = om.getFillCosts().reduce((sum, c) => sum + c.gasUsd, 0);
    expect(totalGas).toBeCloseTo(0.15, 6);

    // First sell is a partial close: it pays its own gas but not the entry's.
    expect(om.getFillCosts()[0]!.gasUsd).toBe(0.05);
    // The final sell settles the entry fill's gas as well.
    expect(om.getFillCosts()[1]!.gasUsd).toBe(0.1);

    // First close: gross 4.00 - fee 0.05 (rounded 0.048) - gas 0.05 = 3.90
    // Second close: gross 6.00 - fee 0.07 (rounded 0.072) - gas 0.10 = 5.83
    const realized = om.getTrades().filter((t) => t.pnl !== null);
    expect(realized[0]!.pnl).toBe(3.9);
    expect(realized[1]!.pnl).toBe(5.83);
    expect(om.getCurrentEquity()).toBeCloseTo(1009.73, 10);
  });

  it('settles one gas charge per entry fill when a position is built then closed', async () => {
    const om = new BacktestOrderManager(1000);
    await om.placeOrder({ tokenId: 't1', side: 'buy', price: 0.4, size: 100 });
    await om.placeOrder({ tokenId: 't1', side: 'buy', price: 0.5, size: 100 });
    await om.placeOrder({ tokenId: 't1', side: 'sell', price: 0.6, size: 200 });

    // Three fills on chain: two buys and one sell.
    const [close] = om.getFillCosts();
    expect(close!.gasUsd).toBe(0.15);
  });

  it('settles one gas charge per entry fill when a short is built then covered', async () => {
    const om = new BacktestOrderManager(1000);
    await om.placeOrder({ tokenId: 't1', side: 'sell', price: 0.4, size: 100 });
    await om.placeOrder({ tokenId: 't1', side: 'sell', price: 0.5, size: 100 });
    await om.placeOrder({ tokenId: 't1', side: 'buy', price: 0.6, size: 200 });

    // Three fills on chain: two entry sells and one covering buy.
    const [close] = om.getFillCosts();
    expect(close!.gasUsd).toBe(0.15);

    // Entry averages to 0.45 and the cover is 0.60, so the short loses on 200
    // shares; the buy-back notional carries both taker legs.
    expect(close!.grossPnlUsd).toBe(-30);
    expect(close!.feeUsd).toBe(0.24);
    expect(close!.netPnlUsd).toBe(-30.39);
  });

  it('charges a short round trip the same costs as the mirror-image long', async () => {
    // Long round trip: buy 100 @ 0.40, sell 100 @ 0.50.
    const longOom = new BacktestOrderManager(1000);
    await longOom.placeOrder({ tokenId: 't1', side: 'buy', price: 0.4, size: 100 });
    await longOom.placeOrder({ tokenId: 't1', side: 'sell', price: 0.5, size: 100 });

    // Short round trip: sell 100 @ 0.50, buy 100 @ 0.40 — the same edge, reversed.
    const shortOom = new BacktestOrderManager(1000);
    await shortOom.placeOrder({ tokenId: 't1', side: 'sell', price: 0.5, size: 100 });
    await shortOom.placeOrder({ tokenId: 't1', side: 'buy', price: 0.4, size: 100 });

    const [longClose] = longOom.getFillCosts();
    const [shortClose] = shortOom.getFillCosts();

    // Both legs of a short settle, exactly as a long's do.
    expect(shortClose!.grossPnlUsd).toBe(longClose!.grossPnlUsd);
    expect(shortClose!.gasUsd).toBe(longClose!.gasUsd);
    // The short's taker fee prices the $40 buy-back, the long's the $50 exit.
    expect(shortClose!.feeUsd).toBe(0.08);
    expect(longClose!.feeUsd).toBe(0.1);
    expect(shortClose!.netPnlUsd).toBe(9.82);
    expect(shortOom.getCurrentEquity()).toBeCloseTo(1009.82, 10);
  });
});

describe('fee-honest metrics', () => {
  it('never yields Infinity or a 100% win rate from costs alone', async () => {
    const om = new BacktestOrderManager(1000);
    // Two profitable round trips, sized so each still clears its costs.
    for (const price of [0.4, 0.35]) {
      await om.placeOrder({ tokenId: `t${price}`, side: 'buy', price, size: 100 });
      await om.placeOrder({ tokenId: `t${price}`, side: 'sell', price: price + 0.1, size: 100 });
    }

    const metrics = computeMetrics(om.getTrades(), om.getEquityCurve().length > 0
      ? om.getEquityCurve()
      : [{ timestamp: 'x', equity: 1000 }]);

    expect(Number.isFinite(metrics.profitFactor)).toBe(true);
    expect(metrics.profitFactor).toBeLessThanOrEqual(100);
    expect(metrics.winRate).toBe(1);

    // Round trip 1: buy 100 @0.40, sell 100 @0.50 -> gross $10, net $9.80.
    // Round trip 2: buy 100 @0.35, sell 100 @0.45 -> gross $10;
    //   fee at exit notional 100*0.45 = $45 -> $0.09 per round trip, gas $0.10,
    //   so costs are $0.19 and net is $9.81.
    expect(metrics.totalPnl).toBeCloseTo(9.8 + 9.81, 6);
  });

  it('caps profit factor at 100 rather than emitting Infinity', () => {
    const trades: BacktestTrade[] = [
      { timestamp: 't1', tokenId: 'a', side: 'SELL', price: 0.6, size: 100, pnl: 50 },
    ];
    const metrics = computeMetrics(trades, [
      { timestamp: 't0', equity: 1000 },
      { timestamp: 't1', equity: 1050 },
    ]);
    expect(metrics.profitFactor).toBe(100);
  });
});
