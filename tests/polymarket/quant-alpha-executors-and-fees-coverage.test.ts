import { describe, expect, it, vi } from 'vitest';
import { calculateLegFee, calculatePolymarketFee } from '../../src/desk/arbitrage/profitability/fee-calculator';
import { BacktestOrderManager } from '../../src/desk/backtesting/backtest-order-manager';
import { loadBacktestSnapshots } from '../../src/desk/backtesting/backtest-runner-simulation';
import type { GammaHistoricalProvider } from '../../src/desk/backtesting/gamma-historical-provider';
import { LiveOrderManagerProxy } from '../../src/desk/polymarket/live-order-manager-proxy';
import { DEFAULT_PAPER_FEE_SCHEDULE, sweepOrderBookLevels } from '../../src/desk/polymarket/paper-orderbook-simulator';
import type { StrategyLiveBridge } from '../../src/desk/polymarket/strategy-live-bridge';
import { NewsLadderExecutor } from '../../src/desk/strategies/polymarket/quant-alpha/primary-source-news-latency-executor';
import {
  capitalSplit,
  clusterCapitalWithinEnvelope,
  holdWindowOpen,
  ladderAllInCost,
  recycleSplit,
  sharesForLeg,
} from '../../src/desk/strategies/polymarket/quant-alpha/primary-source-news-latency-math';
import { recycleInBand } from '../../src/desk/strategies/polymarket/quant-alpha/primary-source-news-latency-recycler';
import { NewsLatencyBook } from '../../src/desk/strategies/polymarket/quant-alpha/primary-source-news-latency-state';
import { DEFAULT_CONFIG as NEWS_DEFAULT } from '../../src/desk/strategies/polymarket/quant-alpha/primary-source-news-latency-types';
import { PairLegExecutor } from '../../src/desk/strategies/polymarket/quant-alpha/toxicity-aware-market-maker-leg-executor';
import { DEFAULT_CONFIG as MM_DEFAULT } from '../../src/desk/strategies/polymarket/quant-alpha/toxicity-aware-market-maker-types';

describe('Quant Alpha executors, fee calculator, and paper simulator edge branches', () => {
  it('covers fee-calculator Polymarket schedule/category maker/taker/exempt branches', () => {
    const exemptSched = { exponent: 1 as const, rate: 0, takerOnly: true, rebateRate: 0 };
    const activeSched = { exponent: 1 as const, rate: 0.04, takerOnly: true, rebateRate: 0.25 };

    expect(
      calculateLegFee(
        { venue: 'polymarket', symbol: 't1', side: 'buy', price: 0.5, size: 10, polymarketFeeSchedule: exemptSched },
        5,
      ),
    ).toEqual({ available: true, rate: 0, feeUsd: 0 });

    const makerSchedFee = calculateLegFee(
      { venue: 'polymarket', symbol: 't1', side: 'buy', price: 0.5, size: 10, orderType: 'maker', polymarketFeeSchedule: activeSched },
      100,
    );
    expect(makerSchedFee.available && makerSchedFee.feeUsd).toBeLessThan(0);

    const catExempt = calculateLegFee(
      { venue: 'polymarket', symbol: 't2', side: 'buy', price: 0.5, size: 10, polymarketCategory: 'geopolitics' },
      100,
    );
    expect(catExempt).toEqual({ available: true, rate: 0, feeUsd: 0 });

    const catMaker = calculateLegFee(
      { venue: 'polymarket', symbol: 't3', side: 'buy', price: 0.5, size: 10, orderType: 'maker', marketDescription: 'Will BTC hit 120k?' },
      100,
    );
    expect(catMaker.available && catMaker.feeUsd).toBeLessThan(0);

    const catTaker = calculateLegFee(
      { venue: 'polymarket', symbol: 't3', side: 'buy', price: 0.5, size: 10, orderType: 'taker', polymarketCategory: 'crypto' },
      100,
    );
    expect(catTaker.available && catTaker.feeUsd).toBeGreaterThan(0);

    const polySchedFee = calculatePolymarketFee(activeSched, 0.5, 100);
    expect(polySchedFee.feeUsd).toBeGreaterThan(0);
    expect(polySchedFee.rebateUsd).toBeGreaterThan(0);
  });

  it('covers NewsLadderExecutor, recycleInBand full-close & zero-qty, and news-latency math helpers', async () => {
    expect(capitalSplit(100, 0)).toBe(0);
    expect(sharesForLeg(100, 0, 0)).toBe(0);
    expect(recycleSplit(0, 0.7)).toEqual({ recycleShares: 0, holdShares: 0 });
    expect(holdWindowOpen(2_000, 1_000, 1_500)).toBe(true);
    expect(holdWindowOpen(500, 1_000, 1_500)).toBe(false);
    expect(
      ladderAllInCost([
        { tokenId: 't1', conditionId: 'c1', outcome: 'Yes', threshold: 10, askPrice: 0.4, displayedShares: 50, takerFeePerShare: 0.01 },
      ]),
    ).toBeCloseTo(0.41, 6);
    expect(clusterCapitalWithinEnvelope(5_000, 2_000, 10_000)).toBe(true);

    const placeOrder = vi
      .fn()
      .mockRejectedValueOnce(new Error('venue 503'))
      .mockResolvedValueOnce({ id: 'o-unfilled', filled: false })
      .mockResolvedValueOnce({ id: 'o-filled', filled: true, fillPrice: '0.95', filledSize: '100', fees: '0.1' });

    const executor = new NewsLadderExecutor({
      orderManager: {
        placeOrder,
        cancelOrder: async () => undefined,
        cancelAllOrders: async () => undefined,
        getOpenOrders: async () => [],
      },
      strategyName: 'primary-source-news-latency',
      config: NEWS_DEFAULT,
    });

    const legs = [
      { tokenId: 't-err', conditionId: 'c1', outcome: 'Yes', threshold: 1, askPrice: 0.5, displayedShares: 100, takerFeePerShare: 0.01 },
      { tokenId: 't-unf', conditionId: 'c2', outcome: 'Yes', threshold: 2, askPrice: 0.5, displayedShares: 100, takerFeePerShare: 0.01 },
    ];
    expect(await executor.sweep(legs, 100, 1_000)).toEqual([]);
    expect(await executor.recycle('t-zero', 0)).toBeNull();

    const book = new NewsLatencyBook();
    book.recordFill({
      eventId: 'ev-full',
      conditionId: 'c-full',
      tokenId: 'tok-full',
      orderId: 'o1',
      price: 0.6,
      quantity: 100,
      endMs: 9_000,
      atMs: 1_000,
    });
    book.recordFill({
      eventId: 'ev-zero',
      conditionId: 'c-zero',
      tokenId: 'tok-zero',
      orderId: 'o2',
      price: 0.6,
      quantity: 10,
      endMs: 9_000,
      atMs: 1_000,
    });

    const positions = [
      { marketId: 'c-full', tokenId: 'tok-full', side: 'yes' as const, entryPrice: 0.6, sizeUsdc: 60, tokenQuantity: 100, openedAt: 1_000 },
      { marketId: 'c-zero', tokenId: 'tok-zero', side: 'yes' as const, entryPrice: 0.6, sizeUsdc: 0, tokenQuantity: 0, openedAt: 1_000 },
    ];

    placeOrder.mockResolvedValue({ id: 'o-sale', filled: true, fillPrice: '0.95', filledSize: '100', fees: '0' });
    await recycleInBand(
      {
        book,
        positions,
        executor,
        config: { ...NEWS_DEFAULT, recycleFraction: 1 },
        strategyName: 'primary-source-news-latency',
        getBid: async () => 0.95,
        emit: () => {},
      },
      2_000,
    );
    expect(positions).toEqual([]);
  });

  it('covers PairLegExecutor error/resting branches, PaperOrderbookSimulator, and LiveOrderManagerProxy methods', async () => {
    const onFill = vi.fn();
    const pairExec = new PairLegExecutor({
      clob: {
        getOrderBook: vi
          .fn()
          .mockRejectedValueOnce(new Error('book down'))
          .mockResolvedValue({ bids: [{ price: '0.48', size: '100' }], asks: [{ price: '0.52', size: '100' }], timestamp: 1_000 }),
        getPrice: async () => 0.5,
        getMidPrice: async () => 0.5,
      },
      orderManager: {
        placeOrder: vi
          .fn()
          .mockRejectedValueOnce(new Error('rejected'))
          .mockResolvedValueOnce({ id: 'o-rest', filled: false }),
        cancelOrder: async () => undefined,
        cancelAllOrders: async () => undefined,
        getOpenOrders: async () => [],
      },
      strategyName: 'toxicity-aware-market-maker',
      config: MM_DEFAULT,
      onFill,
    });

    const quote = {
      conditionId: 'c1',
      tokenId: 'yes-1',
      noTokenId: 'no-1',
      yesBidPrice: 0.48,
      noBidPrice: 0.48,
      yesNotionalPusd: 48,
      noNotionalPusd: 48,
      pairCostPusd: 0.96,
      expectedRebatePusd: 0.01,
    };
    await pairExec.postPair(quote, 1_000); // first call hits book error -> 0 shares
    await pairExec.postPair(quote, 1_000); // second call hits placeOrder error
    await pairExec.postPair(quote, 1_000); // third call hits filled === false
    expect(onFill).not.toHaveBeenCalled();

    const nullBookSim = sweepOrderBookLevels(null, 'BUY', 20, 0.5, 'crypto');
    expect(nullBookSim.filledSize).toBe(20);
    const unmatchedSim = sweepOrderBookLevels(
      { bids: [{ price: '0.48', size: '100' }], asks: [{ price: '0.60', size: '30' }] },
      'BUY',
      20,
      0.55,
      'crypto',
    );
    expect(unmatchedSim.status).toBe('unmatched');
    const delegatedSim = sweepOrderBookLevels({
      book: { bids: [{ price: '0.48', size: '100' }], asks: [{ price: '0.52', size: '30' }] },
      side: 'BUY',
      requestedSize: 10,
      limitPrice: 0.55,
      schedule: DEFAULT_PAPER_FEE_SCHEDULE,
    });
    expect(delegatedSim.filledSize).toBe(10);

    const bridge = {
      onSignal: vi.fn().mockResolvedValue({
        signal: { tokenId: 't1', side: 'BUY', size: 10, price: 0.5 },
        response: { orderID: 'p-1', status: 'matched', avgPrice: 0.5, filledSize: 10 },
        error: null,
        rejected: false,
      }),
      cancelOrder: vi.fn().mockResolvedValue(undefined),
      cancelAllOrders: vi.fn().mockResolvedValue(undefined),
      getOpenOrders: vi.fn().mockResolvedValue([{ id: 'p-1', side: 'buy', price: 0.5, size: 10 }]),
      getStats: vi.fn().mockReturnValue({ scansCompleted: 0, signalsProcessed: 1, signalsRejected: 0, isScanning: false, scannerActive: false }),
    } as unknown as StrategyLiveBridge;

    const proxy = new LiveOrderManagerProxy(bridge, 'toxicity-aware-market-maker', 'crypto');
    const placed = await proxy.placeOrder({ tokenId: 't1', side: 'buy', price: 0.5, size: 10, orderType: 'IOC' });
    expect(placed.id).toBe('p-1');
    await proxy.cancelOrder('p-1');
    await proxy.cancelAllOrders('t1');
    expect(await proxy.getOpenOrders('t1')).toHaveLength(1);
    expect(proxy.getStats().ordersPlaced).toBe(1);

    // Partial bundle conversion + aggressive V2 & fallback taker fee branches
    const bundleOm = new BacktestOrderManager(1_000, { clobV2Category: 'crypto', postOnly: false });
    await bundleOm.placeOrder({ tokenId: 'b1', side: 'buy', price: 0.45, size: 100, orderType: 'IOC' });
    await bundleOm.placeOrder({ tokenId: 'b2', side: 'buy', price: 0.45, size: 100, orderType: 'IOC' });
    const partialNet = await bundleOm.settleBundleConversion({
      legs: [
        { tokenId: 'b1', aggressive: true },
        { tokenId: 'b2', aggressive: true },
      ],
      quantity: 40,
      payoutPerBundlePusd: 1.0,
    });
    expect(partialNet).toBeGreaterThan(0);

    const plainOm = new BacktestOrderManager(1_000);
    await plainOm.placeOrder({ tokenId: 'p1', side: 'buy', price: 0.45, size: 50, orderType: 'IOC' });
    await plainOm.placeOrder({ tokenId: 'p2', side: 'buy', price: 0.45, size: 50, orderType: 'GTC' });
    expect(
      await plainOm.settleBundleConversion({
        legs: [
          { tokenId: 'p1', aggressive: true },
          { tokenId: 'p2', aggressive: false },
        ],
        quantity: 50,
        payoutPerBundlePusd: 1.0,
      }),
    ).toBeGreaterThan(0);

    // loadBacktestSnapshots direct provider branch + empty data error
    const okProvider = {
      fetchHistoricalSnapshots: vi.fn().mockResolvedValue([
        { timestamp: '2026-11-01T00:00:00Z', source: 'prices-history', markets: [] },
      ]),
    } as unknown as GammaHistoricalProvider;
    const loaded = await loadBacktestSnapshots(okProvider, { strategy: 'market-maker', days: 1, capitalUsdc: 1000 }, []);
    expect(loaded.snapshots).toHaveLength(1);

    const emptyProvider = {
      fetchHistoricalSnapshots: vi.fn().mockResolvedValue([]),
    } as unknown as GammaHistoricalProvider;
    await expect(
      loadBacktestSnapshots(emptyProvider, { strategy: 'market-maker', days: 1, capitalUsdc: 1000 }, []),
    ).rejects.toThrow(/No historical data available/);
  });
});
