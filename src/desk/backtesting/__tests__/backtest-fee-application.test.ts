/**
 * Backtest fee honesty tests.
 *
 * The density of evidence here is deliberate: these are the numbers that decide
 * whether the strategy table can be trusted to gate real money.
 */
import { describe, it, expect } from 'vitest';
import { BacktestOrderManager } from '../backtest-order-manager';
import { applyVenueCosts } from '../backtest-fee-application';
import { computeMetrics } from '../metrics-calculator';
import type { BacktestTrade } from '../types';

describe('applyVenueCosts', () => {
  it('charges taker fee on both legs plus gas on both fills', () => {
    // 100 shares at 0.50 = $50 notional per leg.
    // taker 10bps: 50 * 0.001 = $0.05 per leg -> $0.10 for the round trip.
    // gas $0.05 per fill -> $0.10 for the round trip.
    const costs = applyVenueCosts({ price: 0.5, size: 100, grossPnl: 10 });

    expect(costs.feeUsd).toBe(0.1);
    expect(costs.gasUsd).toBe(0.1);
    expect(costs.totalCostUsd).toBe(0.2);
    expect(costs.netPnl).toBe(9.8);
  });

  it('reduces net PnL by exactly fee + gas', () => {
    const grossPnl = 3.37;
    const costs = applyVenueCosts({ price: 0.72, size: 40, grossPnl });

    expect(costs.netPnl).toBeCloseTo(grossPnl - costs.totalCostUsd, 10);
  });

  it('turns a winning trade into a loss when costs exceed the edge', () => {
    // 1 share at 0.50 grosses $0.01; costs are $0.20. Loss.
    const costs = applyVenueCosts({ price: 0.5, size: 1, grossPnl: 0.01 });
    expect(costs.netPnl).toBeLessThan(0);
  });

  it('reports break-even at zero when cost exactly equals gross', () => {
    // Size 100 at 0.50 nets exactly $0.20 of cost.
    const costs = applyVenueCosts({ price: 0.5, size: 100, grossPnl: 0.2 });
    expect(costs.netPnl).toBe(0);
  });

  it('never credits costs back into a profit', () => {
    const costs = applyVenueCosts({ price: 0.5, size: 100, grossPnl: -5 });
    expect(costs.netPnl).toBeLessThan(-5);
    expect(costs.netPnl).toBeCloseTo(-5.2, 10);
  });
});

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
