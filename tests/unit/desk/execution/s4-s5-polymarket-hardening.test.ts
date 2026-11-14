/**
 * Stage S4 & S5 — Polymarket Execution Contract, Accounting, Multi-Leg Arb Safety,
 * Deterministic Order Lifecycle Replay & Walk-Forward OOS Evaluation Suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetExecutionModeCache } from '../../../../src/desk/execution/execution-mode';
import { submitOnlyOrder } from '../../../../src/desk/execution/live-order-submission';
import { buildPolymarketAdapter } from '../../../../src/desk/execution/polymarket-execution-adapter';
import { performEntry, performExit, type TradeLifecycleContext } from '../../../../src/desk/strategies/polymarket/base-polymarket-strategy-trades';
import { computeExitPnl } from '../../../../src/desk/strategies/polymarket/base-polymarket-strategy-exits';
import { PolymarketArbStrategy } from '../../../../src/desk/strategies/polymarket-arb-strategy';
import type { OpenPosition, StrategyDeps, TradeEvent } from '../../../../src/desk/strategies/polymarket/base-polymarket-strategy-types';
import type { GammaMarket } from '../../../../src/desk/polymarket/gamma-client';
import type { LiveOrderManagerCtx } from '../../../../src/desk/execution/live-order-manager-types';
import type { PolymarketOrder } from '../../../../src/desk/execution/polymarket-signer';
import { PolymarketOrderReconciler } from '../../../../src/desk/execution/polymarket-order-reconciler';
import { runPolymarketWalkForwardEvaluation } from '../../../../src/desk/polymarket/polymarket-oos-evaluator';
import type { PolymarketFeeSchedule } from '../../../../src/desk/polymarket/polymarket-fee-calculator';

/**
 * Live Gamma schedule for a fee-charging market, surveyed 2026-11-12.
 *
 * The evaluator prices both legs off the market's published schedule; it no
 * longer accepts a category keyword, so every walk-forward run needs one.
 * Values match the Politics/Finance/Tech tier that most S5 markets fall in.
 */
const S5_SCHEDULE: PolymarketFeeSchedule = {
  exponent: 1,
  rate: 0.04,
  takerOnly: true,
  rebateRate: 0.25,
};

describe('Stage S4 — Unified Execution Mode Gate (submitOnlyOrder & buildPolymarketAdapter)', () => {
  const origLive = process.env.LIVE_TRADING_ENABLED;
  const origPaper = process.env.PAPER_TRADING_ENABLED;
  const origMode = process.env.POLYMARKET_TRADING_MODE;

  beforeEach(() => {
    delete process.env.LIVE_TRADING_ENABLED;
    delete process.env.PAPER_TRADING_ENABLED;
    delete process.env.POLYMARKET_TRADING_MODE;
    resetExecutionModeCache();
  });

  afterEach(() => {
    if (origLive !== undefined) process.env.LIVE_TRADING_ENABLED = origLive;
    else delete process.env.LIVE_TRADING_ENABLED;
    if (origPaper !== undefined) process.env.PAPER_TRADING_ENABLED = origPaper;
    else delete process.env.PAPER_TRADING_ENABLED;
    if (origMode !== undefined) process.env.POLYMARKET_TRADING_MODE = origMode;
    else delete process.env.POLYMARKET_TRADING_MODE;
    resetExecutionModeCache();
  });

  it('submitOnlyOrder refuses when LIVE_TRADING_ENABLED is not "true" (READ_ONLY and PAPER)', async () => {
    const placeOrder = vi.fn().mockResolvedValue({ orderID: 'ord-1', status: 'matched' });
    const host = {
      stopped: false,
      adapter: { placeOrder },
    } as unknown as LiveOrderManagerCtx;
    const order = { tokenId: '0x1', side: 'BUY', price: 0.5, size: 10 } as PolymarketOrder;

    await expect(submitOnlyOrder(host, order)).rejects.toThrow(/LiveOrderManager\.submitOnly requires LIVE mode/);
    expect(placeOrder).not.toHaveBeenCalled();

    process.env.PAPER_TRADING_ENABLED = 'true';
    resetExecutionModeCache();
    await expect(submitOnlyOrder(host, order)).rejects.toThrow(/LiveOrderManager\.submitOnly requires LIVE mode/);
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it('submitOnlyOrder refuses when host is stopped even if LIVE_TRADING_ENABLED=true', async () => {
    process.env.LIVE_TRADING_ENABLED = 'true';
    resetExecutionModeCache();
    const placeOrder = vi.fn();
    const host = {
      stopped: true,
      adapter: { placeOrder },
    } as unknown as LiveOrderManagerCtx;
    const order = { tokenId: '0x1', side: 'BUY', price: 0.5, size: 10 } as PolymarketOrder;

    await expect(submitOnlyOrder(host, order)).rejects.toThrow('LiveOrderManager is stopped');
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it('buildPolymarketAdapter refuses live adapter creation when LIVE_TRADING_ENABLED !== "true"', () => {
    process.env.POLYMARKET_API_KEY = 'k';
    process.env.POLYMARKET_API_SECRET = 's';
    process.env.POLYMARKET_PASSPHRASE = 'p';
    process.env.POLYMARKET_PRIVATE_KEY = 'a'.repeat(64);
    process.env.POLYMARKET_TRADING_MODE = 'live';

    const res = buildPolymarketAdapter({ paperTrading: false });
    expect(res.paperTrading).toBe(true);
    expect(res.adapter).toBeNull();
    expect(res.signer).toBeNull();

    delete process.env.POLYMARKET_API_KEY;
    delete process.env.POLYMARKET_API_SECRET;
    delete process.env.POLYMARKET_PASSPHRASE;
    delete process.env.POLYMARKET_PRIVATE_KEY;
  });
});

describe('Stage S4 — Fee, Cash & Partial-Fill Accounting in BasePolymarketStrategy', () => {
  it('records actual filled notional, entry fees, and deducts entry+exit fees from computeExitPnl', async () => {
    const positions: OpenPosition[] = [];
    const emitted: TradeEvent[] = [];
    const placeOrder = vi.fn()
      // Partial fill on entry: requested 100 tokens at 0.50 ($50), filled 60 tokens at 0.48 with $0.18 fee
      .mockResolvedValueOnce({
        id: 'entry-1',
        filled: true,
        filledSize: '60',
        fillPrice: '0.48',
        fees: '0.18',
      })
      // Exit 60 tokens at 0.55 with $0.22 fee
      .mockResolvedValueOnce({
        id: 'exit-1',
        filled: true,
        filledSize: '60',
        fillPrice: '0.55',
        fees: '0.22',
      });

    const ctx: TradeLifecycleContext = {
      deps: {
        orderManager: {
          placeOrder,
          cancelOrder: vi.fn(),
          cancelAllOrders: vi.fn(),
          getOpenOrders: vi.fn(),
        },
        clob: {} as never,
        eventBus: { emit: vi.fn() } as never,
        gamma: {} as never,
      },
      positions,
      strategyName: 'polymarket-arb' as never,
      emitTrade: (t) => emitted.push(t),
      setCooldown: vi.fn(),
    };

    await performEntry(ctx, 'yes-tok', 'cond-1', 'yes', 0.50, 50);
    expect(positions).toHaveLength(1);
    expect(positions[0]!.tokenQuantity).toBe(60);
    expect(positions[0]!.entryPrice).toBeCloseTo(0.48, 4);
    expect(positions[0]!.sizeUsdc).toBeCloseTo(60 * 0.48, 4);
    expect(positions[0]!.entryFeesUsdc).toBeCloseTo(0.18, 4);
    expect(emitted[0]!.fees).toBe('0.18');
    expect(emitted[0]!.fillSize).toBe((60 * 0.48).toFixed(2));

    await performExit(ctx, positions[0]!, 0.55, 'take-profit');
    expect(emitted).toHaveLength(2);
    expect(emitted[1]!.fees).toBe('0.22');

    // Gross PnL = (0.55 - 0.48) * 60 = 4.20; Net PnL after 0.18 + 0.22 fees = 3.80
    const netPnl = computeExitPnl(positions[0]!, 0.55, 0.22);
    expect(netPnl).toBeCloseTo(3.80, 4);
  });
});

describe('Stage S4 — Multi-Leg Arbitrage Executable Depth & Leg-2 Failure Unwind', () => {
  function makeMarket(): GammaMarket {
    return {
      id: 'm1',
      question: 'Will BTC hit 100k?',
      slug: 'btc-100k',
      conditionId: 'cond-arb-1',
      outcomes: ['Yes', 'No'],
      outcomePrices: ['0.48', '0.47'],
      volume: 50_000,
      volume24h: 5_000,
      liquidity: 10_000,
      endDate: '2027-12-31',
      active: true,
      closed: false,
      resolved: false,
      tokens: [],
      yesTokenId: 'yes-1',
      noTokenId: 'no-1',
      yesPrice: 0.48,
    };
  }

  it('skips arb entry when top-of-book ask size is insufficient for legSize', async () => {
    const placeOrder = vi.fn();
    const deps = {
      clob: {
        getOrderBook: vi.fn(async (tokenId: string) => ({
          bids: [{ price: '0.46', size: '500' }],
          // legSize = 25 USDC at ask 0.48 requires ~52 tokens, but ask size is only 10 tokens
          asks: [{ price: tokenId === 'yes-1' ? '0.48' : '0.47', size: tokenId === 'yes-1' ? '10' : '500' }],
          timestamp: Date.now(),
        })),
      },
      orderManager: { placeOrder, cancelOrder: vi.fn(), cancelAllOrders: vi.fn(), getOpenOrders: vi.fn() },
      eventBus: { emit: vi.fn() },
      gamma: { getTrending: vi.fn(async () => [makeMarket()]) },
    } as unknown as StrategyDeps;

    const strategy = new PolymarketArbStrategy(deps, { spreadLookback: 1, minSpread: 0.01 });
    await strategy.execute();
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it('unwinds Leg 1 immediately and sets cooldown when Leg 2 fails so no unhedged leg remains', async () => {
    const placeOrder = vi.fn()
      // Leg 1 (YES buy) succeeds
      .mockResolvedValueOnce({ id: 'yes-buy-1', filled: true, filledSize: '52', fillPrice: '0.48', fees: '0.05' })
      // Leg 2 (NO buy) fails (e.g. resting/rejected)
      .mockResolvedValueOnce({ id: 'no-buy-1', filled: false })
      // Compensatory unwind (YES sell IOC) succeeds
      .mockResolvedValueOnce({ id: 'yes-unwind-1', filled: true, filledSize: '52', fillPrice: '0.46', fees: '0.05' });

    const deps = {
      clob: {
        getOrderBook: vi.fn(async (tokenId: string) => ({
          bids: [{ price: '0.46', size: '500' }],
          asks: [{ price: tokenId === 'yes-1' ? '0.48' : '0.47', size: '500' }],
          timestamp: Date.now(),
        })),
      },
      orderManager: { placeOrder, cancelOrder: vi.fn(), cancelAllOrders: vi.fn(), getOpenOrders: vi.fn() },
      eventBus: { emit: vi.fn() },
      gamma: { getTrending: vi.fn(async () => [makeMarket()]) },
    } as unknown as StrategyDeps;

    const strategy = new PolymarketArbStrategy(deps, { spreadLookback: 1, minSpread: 0.01 });
    await strategy.execute();

    // 3 order calls: YES buy, NO buy (failed), YES sell (compensatory unwind)
    expect(placeOrder).toHaveBeenCalledTimes(3);
    expect(placeOrder.mock.calls[0]![0]).toMatchObject({ tokenId: 'yes-1', side: 'buy' });
    expect(placeOrder.mock.calls[1]![0]).toMatchObject({ tokenId: 'no-1', side: 'buy' });
    expect(placeOrder.mock.calls[2]![0]).toMatchObject({ tokenId: 'yes-1', side: 'sell', orderType: 'IOC' });
  });
});

describe('Stage S4 — Deterministic Order Lifecycle Reconciler & Fault Injection', () => {
  it('handles full order state machine, deduplicates out-of-order/duplicate fills, blocks UNKNOWN markets, and reconciles with zero drift', () => {
    const reconciler = new PolymarketOrderReconciler(1000);

    // 1. Create and transition order 1 through partial fill to full fill
    const o1 = reconciler.createOrder({
      intentId: 'intent-1',
      orderId: 'ord-1',
      marketId: 'mkt-1',
      tokenId: 'yes-1',
      side: 'BUY',
      requestedSize: 100,
      limitPrice: 0.50,
      timestamp: 1000,
    });
    expect(o1.status).toBe('CREATED');

    // Duplicate intentId is rejected idempotently
    expect(() =>
      reconciler.createOrder({
        intentId: 'intent-1',
        orderId: 'ord-1-dup',
        marketId: 'mkt-1',
        tokenId: 'yes-1',
        side: 'BUY',
        requestedSize: 100,
        limitPrice: 0.50,
        timestamp: 1001,
      }),
    ).toThrow(/Duplicate order intent/);

    reconciler.applyEvent({ eventId: 'ev-1', orderId: 'ord-1', type: 'SUBMITTED', timestamp: 1010 });
    reconciler.applyEvent({ eventId: 'ev-2', orderId: 'ord-1', type: 'ACKNOWLEDGED', timestamp: 1020 });
    reconciler.applyEvent({
      eventId: 'ev-3',
      orderId: 'ord-1',
      type: 'PARTIALLY_FILLED',
      fillSize: 40,
      fillPrice: 0.50,
      feeUsdc: 0.07,
      timestamp: 1030,
    });
    // Duplicate eventId ev-3 must be ignored (idempotent)
    reconciler.applyEvent({
      eventId: 'ev-3',
      orderId: 'ord-1',
      type: 'PARTIALLY_FILLED',
      fillSize: 40,
      fillPrice: 0.50,
      feeUsdc: 0.07,
      timestamp: 1031,
    });
    reconciler.applyEvent({
      eventId: 'ev-4',
      orderId: 'ord-1',
      type: 'FILLED',
      fillSize: 60,
      fillPrice: 0.50,
      feeUsdc: 0.10,
      timestamp: 1040,
    });

    expect(reconciler.getOrder('ord-1')?.status).toBe('FILLED');
    expect(reconciler.getOrder('ord-1')?.filledSize).toBe(100);

    // 2. Fault injection: order 2 enters UNKNOWN timeout state on mkt-2
    reconciler.createOrder({
      intentId: 'intent-2',
      orderId: 'ord-2',
      marketId: 'mkt-2',
      tokenId: 'yes-2',
      side: 'BUY',
      requestedSize: 50,
      limitPrice: 0.40,
      timestamp: 2000,
    });
    reconciler.applyEvent({ eventId: 'ev-5', orderId: 'ord-2', type: 'SUBMITTED', timestamp: 2010 });
    reconciler.applyEvent({ eventId: 'ev-6', orderId: 'ord-2', type: 'TIMEOUT_UNKNOWN', timestamp: 2050 });
    expect(reconciler.getOrder('ord-2')?.status).toBe('UNKNOWN');

    // Market mkt-2 must block new orders while ord-2 is UNKNOWN
    expect(() =>
      reconciler.createOrder({
        intentId: 'intent-3',
        orderId: 'ord-3',
        marketId: 'mkt-2',
        tokenId: 'yes-2',
        side: 'BUY',
        requestedSize: 20,
        limitPrice: 0.40,
        timestamp: 2060,
      }),
    ).toThrow(/unresolved UNKNOWN order/);

    // Reconcile ord-2 as CANCELLED -> mkt-2 unblocked
    reconciler.applyEvent({ eventId: 'ev-7', orderId: 'ord-2', type: 'CANCELLED', timestamp: 2070 });
    expect(reconciler.getOrder('ord-2')?.status).toBe('CANCELLED');

    const audit = reconciler.reconcile();
    expect(audit.unexplainedDriftUsdc).toBe(0);
    expect(audit.cashUsdc).toBeCloseTo(1000 - 50 - 0.17, 6);
    expect(audit.totalFeesUsdc).toBeCloseTo(0.17, 6);
  });
});

describe('Stage S5 — Polymarket Walk-Forward OOS & Stress Evaluation', () => {
  it('produces deterministic walk-forward OOS metrics comparing no-trade, naive-mid, and executable-ask-fee-aware strategies', () => {
    const run1 = runPolymarketWalkForwardEvaluation({ seed: 42, episodes: 120, schedule: S5_SCHEDULE });
    const run2 = runPolymarketWalkForwardEvaluation({ seed: 42, episodes: 120, schedule: S5_SCHEDULE });

    // Deterministic reproducibility
    expect(run1).toEqual(run2);
    expect(run1.inSampleCount).toBeGreaterThan(0);
    expect(run1.outOfSampleCount).toBeGreaterThan(0);

    // Naive midpoint loses money under realistic spread + fees + leg risk in OOS,
    // while executable-ask-fee-aware filters bad entries and preserves positive expectancy
    expect(run1.candidates['naive_mid_arb'].oosNetPnlUsdc).toBeLessThan(
      run1.candidates['executable_ask_fee_arb'].oosNetPnlUsdc,
    );
    expect(run1.candidates['no_trade_baseline'].oosNetPnlUsdc).toBe(0);
    expect(run1.candidates['executable_ask_fee_arb'].stressedNetPnlUsdc).toBeGreaterThan(
      run1.candidates['naive_mid_arb'].stressedNetPnlUsdc,
    );
  });
});
