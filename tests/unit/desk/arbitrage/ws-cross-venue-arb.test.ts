import { describe, it, expect, beforeEach } from 'vitest';
import {
  BinanceWsConnector,
  type BinanceDepthSnapshot,
  type BinanceDepthUpdate,
  type BinanceTradeMsg,
} from '../../../../src/desk/arbitrage/connectors/binance-ws-connector';
import {
  HyperliquidWsConnector,
  type HyperliquidL2BookMsg,
  type HyperliquidTradesMsg,
} from '../../../../src/desk/arbitrage/connectors/hyperliquid-ws-connector';
import {
  CrossVenueArbDetector,
  type VenueQuote,
} from '../../../../src/desk/arbitrage/connectors/cross-venue-arb-detector';

describe('Real-Time WS Orderbook & Cross-Venue Arbitrage', () => {
  describe('BinanceWsConnector - Sequence Sync & Depth Parser', () => {
    let binance: BinanceWsConnector;

    beforeEach(() => {
      binance = new BinanceWsConnector('BTCUSDT');
    });

    it('initializes with un-synced state and correct symbol', () => {
      expect(binance.getSymbol()).toBe('BTCUSDT');
      expect(binance.isSynced()).toBe(false);
      expect(binance.getLastUpdateId()).toBe(-1);
    });

    it('buffers depth updates before snapshot and applies snapshot correctly', () => {
      const earlyUpdate: BinanceDepthUpdate = {
        e: 'depthUpdate',
        E: 1600000000100,
        s: 'BTCUSDT',
        U: 101,
        u: 105,
        pu: 100,
        b: [['50000.00', '1.5']],
        a: [['50005.00', '2.0']],
      };

      // Process update prior to snapshot
      const appliedEarly = binance.processDepthUpdate(earlyUpdate);
      expect(appliedEarly).toBe(false);
      expect(binance.isSynced()).toBe(false);

      // Apply snapshot
      const snapshot: BinanceDepthSnapshot = {
        lastUpdateId: 100,
        bids: [
          ['49999.00', '1.0'],
          ['49998.00', '3.0'],
        ],
        asks: [
          ['50006.00', '1.2'],
          ['50007.00', '4.0'],
        ],
      };

      binance.applySnapshot(snapshot);
      expect(binance.isSynced()).toBe(true);
      expect(binance.getLastUpdateId()).toBe(105); // Buffered update was replayed

      const top = binance.getBestBidAsk();
      expect(top?.bestBid).toBe(50000.0);
      expect(top?.bestBidQty).toBe(1.5);
      expect(top?.bestAsk).toBe(50005.0);
      expect(top?.bestAskQty).toBe(2.0);
    });

    it('applies sequential depth updates and removes zero-quantity levels', () => {
      binance.applySnapshot({
        lastUpdateId: 200,
        bids: [['100.00', '5.0']],
        asks: [['101.00', '4.0']],
      });

      const nextUpdate: BinanceDepthUpdate = {
        e: 'depthUpdate',
        E: 1600000000200,
        s: 'BTCUSDT',
        U: 201,
        u: 202,
        pu: 200,
        b: [
          ['100.00', '0.00'], // remove level
          ['99.50', '8.00'],  // add level
        ],
        a: [['100.50', '2.50']],
      };

      const applied = binance.processDepthUpdate(nextUpdate);
      expect(applied).toBe(true);
      expect(binance.getLastUpdateId()).toBe(202);

      const top = binance.getBestBidAsk();
      expect(top?.bestBid).toBe(99.5);
      expect(top?.bestBidQty).toBe(8.0);
      expect(top?.bestAsk).toBe(100.5);
    });

    it('detects sequence gaps and invalidates synchronization', () => {
      binance.applySnapshot({
        lastUpdateId: 300,
        bids: [['100.00', '1.0']],
        asks: [['101.00', '1.0']],
      });

      const gapUpdate: BinanceDepthUpdate = {
        e: 'depthUpdate',
        E: 1600000000300,
        s: 'BTCUSDT',
        U: 305,
        u: 306,
        pu: 304, // Expected 300
        b: [['100.00', '2.0']],
        a: [['101.00', '2.0']],
      };

      const applied = binance.processDepthUpdate(gapUpdate);
      expect(applied).toBe(false);
      expect(binance.isSynced()).toBe(false);
    });

    it('parses trade messages into normalized format', () => {
      const tradeMsg: BinanceTradeMsg = {
        e: 'trade',
        E: 1600000000500,
        s: 'BTCUSDT',
        t: 1234567,
        p: '50010.50',
        q: '0.45',
        b: 888,
        a: 999,
        T: 1600000000495,
        m: false, // Buyer is taker => buy side
      };

      const trade = binance.parseTrade(tradeMsg);
      expect(trade.venue).toBe('binance');
      expect(trade.symbol).toBe('BTCUSDT');
      expect(trade.side).toBe('buy');
      expect(trade.price).toBe(50010.5);
      expect(trade.amount).toBe(0.45);
      expect(trade.tradeId).toBe('1234567');
    });
  });

  describe('HyperliquidWsConnector - L2 Book & Trades Stream', () => {
    let hl: HyperliquidWsConnector;

    beforeEach(() => {
      hl = new HyperliquidWsConnector('ETH');
    });

    it('builds subscription messages correctly', () => {
      const sub = HyperliquidWsConnector.buildSubscription('l2Book', 'eth');
      expect(sub).toEqual({
        method: 'subscribe',
        subscription: { type: 'l2Book', coin: 'ETH' },
      });
    });

    it('processes L2 book updates and maintains sorted depth', () => {
      const msg: HyperliquidL2BookMsg = {
        channel: 'l2Book',
        data: {
          coin: 'ETH',
          time: 1600000001000,
          levels: [
            [
              { px: '3000.0', sz: '10.5', n: 3 },
              { px: '2995.0', sz: '20.0', n: 5 },
            ],
            [
              { px: '3002.0', sz: '8.0', n: 2 },
              { px: '3005.0', sz: '15.0', n: 4 },
            ],
          ],
        },
      };

      const book = hl.processL2Book(msg);
      expect(book).not.toBeNull();
      expect(hl.isSynced()).toBe(true);
      expect(hl.getLastTime()).toBe(1600000001000);

      const top = hl.getBestBidAsk();
      expect(top?.bestBid).toBe(3000.0);
      expect(top?.bestBidQty).toBe(10.5);
      expect(top?.bestAsk).toBe(3002.0);
      expect(top?.bestAskQty).toBe(8.0);
    });

    it('rejects out-of-order timestamps and mismatched coins', () => {
      hl.processL2Book({
        coin: 'ETH',
        time: 1600000002000,
        levels: [[{ px: '3000', sz: '1', n: 1 }], [{ px: '3001', sz: '1', n: 1 }]],
      });

      // Stale timestamp
      const staleRes = hl.processL2Book({
        coin: 'ETH',
        time: 1600000001999,
        levels: [[{ px: '3000', sz: '1', n: 1 }], [{ px: '3001', sz: '1', n: 1 }]],
      });
      expect(staleRes).toBeNull();

      // Mismatched coin
      const mismatchRes = hl.processL2Book({
        coin: 'SOL',
        time: 1600000003000,
        levels: [[{ px: '150', sz: '1', n: 1 }], [{ px: '151', sz: '1', n: 1 }]],
      });
      expect(mismatchRes).toBeNull();
    });

    it('parses trades stream accurately', () => {
      const tradesMsg: HyperliquidTradesMsg = {
        channel: 'trades',
        data: [
          { coin: 'ETH', side: 'B', px: '3001.50', sz: '2.5', time: 1600000001500, tid: 9876 },
          { coin: 'ETH', side: 'A', px: '3000.00', sz: '1.2', time: 1600000001501, hash: '0xabc' },
        ],
      };

      const trades = hl.parseTrades(tradesMsg);
      expect(trades).toHaveLength(2);
      expect(trades[0]).toEqual({
        venue: 'hyperliquid',
        symbol: 'ETH',
        side: 'buy',
        price: 3001.5,
        amount: 2.5,
        timestamp: 1600000001500,
        tradeId: '9876',
      });
      expect(trades[1].side).toBe('sell');
      expect(trades[1].tradeId).toBe('0xabc');
    });
  });

  describe('CrossVenueArbDetector - Spread Calculation & Guardrails', () => {
    let detector: CrossVenueArbDetector;

    beforeEach(() => {
      detector = new CrossVenueArbDetector({
        minNetProfitBps: 10,
        minNetProfitUsd: 0.5,
        fees: {
          binance: { takerFeeRate: 0.00075, gasCostUsd: 0, slippageBps: 2 },
          hyperliquid: { takerFeeRate: 0.00035, gasCostUsd: 0, slippageBps: 2 },
          polymarket: { takerFeeRate: 0.02, gasCostUsd: 0.02, slippageBps: 5 },
        },
      });
    });

    it('detects profitable cross-venue arbitrage between Binance and Hyperliquid', () => {
      // Binance ask is 3000.00, Hyperliquid bid is 3010.00 (gross spread +33.3 bps)
      const binanceQuote: VenueQuote = {
        venue: 'binance',
        symbol: 'ETH',
        bestBid: 2999.0,
        bestBidQty: 10,
        bestAsk: 3000.0,
        bestAskQty: 5,
      };
      const hlQuote: VenueQuote = {
        venue: 'hyperliquid',
        symbol: 'ETH',
        bestBid: 3010.0,
        bestBidQty: 4,
        bestAsk: 3011.0,
        bestAskQty: 10,
      };

      const opps = detector.evaluatePair(binanceQuote, hlQuote, 3000); // 1 ETH max
      expect(opps).toHaveLength(2);

      const buyBinanceSellHL = opps.find(o => o.buyVenue === 'binance' && o.sellVenue === 'hyperliquid');
      expect(buyBinanceSellHL).toBeDefined();
      expect(buyBinanceSellHL?.buyPrice).toBe(3000.0);
      expect(buyBinanceSellHL?.sellPrice).toBe(3010.0);
      expect(buyBinanceSellHL?.grossSpreadBps).toBeCloseTo(33.33, 1);
      expect(buyBinanceSellHL?.netProfitUsd).toBeGreaterThan(5.0);
      expect(buyBinanceSellHL?.isViable).toBe(true);

      const buyHLSellBinance = opps.find(o => o.buyVenue === 'hyperliquid' && o.sellVenue === 'binance');
      expect(buyHLSellBinance?.isViable).toBe(false);
    });

    it('correctly deducts high Polymarket friction fees and filters out sub-hurdle spread', () => {
      // Polymarket ask 0.50, Binance synthetic bid 0.505 (+100 bps gross spread, but Polymarket fee is 200 bps)
      const polyQuote: VenueQuote = {
        venue: 'polymarket',
        symbol: 'YES-NO',
        bestBid: 0.49,
        bestBidQty: 1000,
        bestAsk: 0.50,
        bestAskQty: 1000,
      };
      const binanceQuote: VenueQuote = {
        venue: 'binance',
        symbol: 'YES-NO',
        bestBid: 0.505,
        bestBidQty: 1000,
        bestAsk: 0.51,
        bestAskQty: 1000,
      };

      const opps = detector.evaluatePair(polyQuote, binanceQuote, 500);
      const buyPolySellBinance = opps.find(o => o.buyVenue === 'polymarket' && o.sellVenue === 'binance');
      expect(buyPolySellBinance).toBeDefined();
      // Gross spread is positive (+100 bps) but friction from 2% taker fee causes net spread to be negative
      expect(buyPolySellBinance?.grossSpreadBps).toBeCloseTo(100.0, 1);
      expect(buyPolySellBinance?.netSpreadBps).toBeLessThan(0);
      expect(buyPolySellBinance?.isViable).toBe(false);
    });

    it('enforces unhedged timeout <= 250ms guardrail config constraint', () => {
      const customDetector = new CrossVenueArbDetector({
        unhedgedTimeoutMs: 500, // Should be clamped to 250ms
      });

      const normalExecution = customDetector.evaluateUnhedgedRisk(1000, 1150);
      expect(normalExecution.triggered).toBe(false);
      expect(normalExecution.action).toBe('NONE');
      expect(normalExecution.timeoutLimitMs).toBe(250);

      const delayedExecution = customDetector.evaluateUnhedgedRisk(1000, 1260);
      expect(delayedExecution.triggered).toBe(true);
      expect(delayedExecution.action).toBe('EMERGENCY_UNWIND');
      expect(delayedExecution.elapsedMs).toBe(260);
    });

    it('triggers auto-unwind when second leg has not filled within timeout threshold', () => {
      const t0 = 100000;
      const tCurrentStale = t0 + 251; // 251ms elapsed with no leg 2 fill

      const risk = detector.evaluateUnhedgedRisk(t0, undefined, tCurrentStale);
      expect(risk.triggered).toBe(true);
      expect(risk.action).toBe('EMERGENCY_UNWIND');
      expect(risk.elapsedMs).toBe(251);
    });
  });
});
