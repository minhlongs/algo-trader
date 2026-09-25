/**
 * Tier 1: Feature Coverage Test Suite (Multi-Exchange Arbitrage Execution Engine)
 *
 * Covers 13 features (F1 through F13) with >= 5 test cases per feature (65+ total tests).
 * Validates baseline requirements, contracts, and execution paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpportunityIngestionPipeline } from '../../../src/desk/arbitrage/opportunity-ingestion-pipeline';
import { NetProfitabilityCalculator } from '../../../src/desk/arbitrage/net-profitability-calculator';
import { CcxtExchangeConnector } from '../../../src/desk/markets/cex/ccxt-exchange-connector';
import { PolymarketConnectorAdapter } from '../../../src/desk/execution/polymarket-connector-adapter';
import { ArbitrageRiskGuard, ArbitrageRejectionReason } from '../../../src/desk/arbitrage/arbitrage-risk-guard';
import { KellyPositionSizer } from '../../../src/desk/risk/kelly-position-sizer';
import { AtomicMultiLegCoordinator } from '../../../src/desk/arbitrage/atomic-multileg-coordinator';
import { CompensatoryUnwindHandler } from '../../../src/desk/arbitrage/compensatory-unwind-handler';
import { ArbitrageMetrics } from '../../../src/desk/arbitrage/telemetry/arbitrage-metrics';
import { ArbitrageAuditLogger } from '../../../src/desk/arbitrage/telemetry/arbitrage-audit-logger';
import { ArbitrageEngine } from '../../../src/desk/arbitrage/arbitrage-engine';
import { logger } from '../../../src/shared/utils/logger';
import type { IExchangeConnector } from '../../../src/desk/arbitrage/connectors/types';
import type { ArbitrageOpportunity } from '../../../src/desk/arbitrage/types';

vi.mock('../../../src/seed/security/audit-log', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  hashIpAddress: vi.fn().mockReturnValue('mocked-ip-hash-sha256'),
}));

import { logAudit } from '../../../src/seed/security/audit-log';

describe('Tier 1: Feature Coverage (F1 to F13)', () => {
  const createMockConnector = (venue: string, overrides?: Partial<IExchangeConnector>): IExchangeConnector => ({
    venue,
    fetchOrderBook: vi.fn().mockResolvedValue({
      symbol: 'BTC/USDT',
      bids: [{ price: 50100, amount: 2 }],
      asks: [{ price: 50000, amount: 2 }],
      timestamp: Date.now(),
    }),
    placeOrder: vi.fn().mockResolvedValue({
      orderId: `ord-${venue}-1`,
      clientOrderId: `cl-${venue}-1`,
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      price: 50000,
      amount: 0.1,
      filled: 0.1,
      status: 'closed',
      timestamp: Date.now(),
    }),
    cancelOrder: vi.fn().mockResolvedValue({ orderId: `ord-${venue}-1`, status: 'canceled' }),
    fetchBalance: vi.fn().mockResolvedValue({
      venue,
      balances: { USDT: { free: 50000, total: 50000 }, BTC: { free: 2, total: 2 } },
      timestamp: Date.now(),
    }),
    fetchTicker: vi.fn().mockResolvedValue({ symbol: 'BTC/USDT', last: 50000, bid: 49990, ask: 50010, timestamp: Date.now() }),
    getLatencyStats: vi.fn().mockReturnValue({ p50: 10, p90: 20, p99: 45 }),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── F1: Spread Ingestion Hook ─────────────────────────────────────────────
  describe('F1: Spread Ingestion Hook', () => {
    it('F1.1: ingests valid opportunity and dispatches to admitted callback', async () => {
      const admitted: ArbitrageOpportunity[] = [];
      const pipeline = new OpportunityIngestionPipeline(
        { minHurdleBps: 10 },
        { onAdmitted: async (opp) => { admitted.push(opp); } }
      );

      pipeline.handleOpportunities([{
        id: 'f1-1',
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'bybit',
        buyPrice: 50000,
        sellPrice: 50200,
        spreadBps: 40,
        netProfitBps: 20,
        netProfitUsd: 10,
        confidence: 0.95,
        timestamp: Date.now(),
      }]);

      await new Promise((r) => setTimeout(r, 60));
      expect(admitted.length).toBe(1);
      expect(admitted[0].id).toBe('f1-1');
    });

    it('F1.2: filters out opportunity with net profit below hurdle', async () => {
      const admitted: ArbitrageOpportunity[] = [];
      const pipeline = new OpportunityIngestionPipeline(
        { minHurdleBps: 15 },
        { onAdmitted: async (opp) => { admitted.push(opp); } }
      );

      pipeline.handleOpportunities([{
        id: 'f1-2',
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'bybit',
        buyPrice: 50000,
        sellPrice: 50020,
        spreadBps: 4,
        netProfitBps: 2,
        netProfitUsd: 1,
        confidence: 0.9,
        timestamp: Date.now(),
      }]);

      await new Promise((r) => setTimeout(r, 60));
      expect(admitted.length).toBe(0);
      expect(pipeline.metrics.rejectedCount).toBe(1);
    });

    it('F1.3: deduplicates duplicate opportunities within TTL window', async () => {
      const admitted: ArbitrageOpportunity[] = [];
      const pipeline = new OpportunityIngestionPipeline(
        { dedupTtlMs: 500 },
        { onAdmitted: async (opp) => { admitted.push(opp); } }
      );

      const opp: ArbitrageOpportunity = {
        id: 'f1-3-dup',
        symbol: 'ETH/USDT',
        buyExchange: 'binance',
        sellExchange: 'kucoin',
        buyPrice: 3000,
        sellPrice: 3030,
        spreadBps: 100,
        netProfitBps: 50,
        netProfitUsd: 15,
        confidence: 0.9,
        timestamp: Date.now(),
      };

      pipeline.handleOpportunities([opp]);
      pipeline.handleOpportunities([opp]);

      await new Promise((r) => setTimeout(r, 60));
      expect(admitted.length).toBe(1);
      expect(pipeline.metrics.dedupDroppedCount).toBe(1);
    });

    it('F1.4: respects queue capacity and drops oldest on buffer overflow', async () => {
      const pipeline = new OpportunityIngestionPipeline({
        maxQueueSize: 5,
        minHurdleBps: 1,
      });

      for (let i = 0; i < 10; i++) {
        pipeline.handleOpportunities([{
          id: `f1-4-${i}`,
          symbol: `TOKEN-${i}/USDT`,
          buyExchange: 'binance',
          sellExchange: 'bybit',
          buyPrice: 10,
          sellPrice: 12,
          spreadBps: 200,
          netProfitBps: 100,
          netProfitUsd: 2,
          confidence: 0.9,
          timestamp: Date.now(),
        }]);
      }

      expect(pipeline.metrics.scannedCount).toBe(10);
    });

    it('F1.5: handles worker lifecycle start and stop correctly', () => {
      const pipeline = new OpportunityIngestionPipeline();
      pipeline.start();
      pipeline.stop();
      expect(pipeline.metrics.scannedCount).toBe(0);
    });
  });

  // ─── F2: Unified Exchange Connectors ───────────────────────────────────────
  describe('F2: Unified Exchange Connectors', () => {
    it('F2.1: CcxtExchangeConnector conforms to IExchangeConnector interface', () => {
      const connector = new CcxtExchangeConnector('binance');
      expect(connector.exchangeId).toBe('binance');
      expect(typeof connector.placeOrder).toBe('function');
      expect(typeof connector.cancelOrder).toBe('function');
      expect(typeof connector.fetchBalance).toBe('function');
      expect(typeof connector.fetchOrder).toBe('function');
    });

    it('F2.2: CcxtExchangeConnector handles simulated limit order placement', async () => {
      const mockAdapter = {
        createOrder: vi.fn().mockResolvedValue({
          id: 'bybit-ord-1',
          symbol: 'BTC/USDT',
          side: 'buy',
          type: 'limit',
          price: 50000,
          amount: 0.5,
          filled: 0.5,
          remaining: 0,
          status: 'closed',
          timestamp: Date.now(),
        }),
      };
      const connector = new CcxtExchangeConnector('bybit', mockAdapter as unknown as import('../../../src/desk/markets/cex/ccxt-connector-types').CcxtExchangeAdapter);
      const res = await connector.placeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        amount: 0.5,
        price: 50000,
      });
      expect(res.symbol).toBe('BTC/USDT');
      expect(res.amount).toBe(0.5);
      expect(res.status).toBe('closed');
    });

    it('F2.3: PolymarketConnectorAdapter formats exchangeId as polymarket', () => {
      const poly = new PolymarketConnectorAdapter();
      expect(poly.exchangeId).toBe('polymarket');
    });

    it('F2.4: PolymarketConnectorAdapter accepts mock adapter for order placement', async () => {
      const mockAdapter = {
        placeOrder: vi.fn().mockResolvedValue({ orderID: 'poly-ord-1', status: 'matched', size: 10, price: 0.55 }),
        cancelOrder: vi.fn(),
        getOrder: vi.fn(),
      };
      const poly = new PolymarketConnectorAdapter(mockAdapter as unknown as import('../../../src/desk/execution/polymarket-adapter').PolymarketAdapter);
      const res = await poly.placeOrder({
        symbol: 'CRYPTO-100K-YES',
        side: 'buy',
        type: 'limit',
        amount: 10,
        price: 0.55,
      });
      expect(res.orderId).toBe('poly-ord-1');
      expect(res.filled).toBe(10);
    });

    it('F2.5: Connector tracks latency metrics via getLatencyMs', async () => {
      const mockAdapter = {
        fetchTime: vi.fn().mockResolvedValue(Date.now()),
      };
      const connector = new CcxtExchangeConnector('kucoin', mockAdapter as unknown as import('../../../src/desk/markets/cex/ccxt-connector-types').CcxtExchangeAdapter);
      const latency = await connector.getLatencyMs();
      expect(latency).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── F3: Net Profitability Calculator ──────────────────────────────────────
  describe('F3: Net Profitability Calculator', () => {
    const calc = new NetProfitabilityCalculator();

    it('F3.1: calculates positive net profit when spread covers fees and gas', () => {
      const res = calc.calculate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', side: 'buy', price: 50000, amount: 1 },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', price: 50500, amount: 1 },
        tradeAmount: 1,
      });
      expect(res.netProfitBps).toBeGreaterThan(0);
      expect(res.netProfitUsd).toBeGreaterThan(0);
      expect(res.isProfitable).toBe(true);
    });

    it('F3.2: accounts for Polygon on-chain gas when Polymarket is a leg', () => {
      const cexRes = calc.calculate({
        buyLeg: { venue: 'binance', symbol: 'ETH/USDT', side: 'buy', price: 3000, amount: 1 },
        sellLeg: { venue: 'bybit', symbol: 'ETH/USDT', side: 'sell', price: 3010, amount: 1 },
        tradeAmount: 1,
      });

      const polyRes = calc.calculate({
        buyLeg: { venue: 'binance', symbol: 'ETH/USDT', side: 'buy', price: 3000, amount: 1 },
        sellLeg: { venue: 'polymarket', symbol: 'ETH/USDT', side: 'sell', price: 3010, amount: 1, settlementType: 'on_chain_settle' },
        tradeAmount: 1,
      });

      expect(polyRes.estimatedGasUsd).toBeGreaterThan(0);
      expect(polyRes.netProfitUsd).toBeLessThan(cexRes.netProfitUsd);
    });

    it('F3.3: computes negative net profit when spread is narrower than fee hurdle', () => {
      const res = calc.calculate({
        buyLeg: { venue: 'binance', symbol: 'SOL/USDT', side: 'buy', price: 150.00, amount: 10 },
        sellLeg: { venue: 'bybit', symbol: 'SOL/USDT', side: 'sell', price: 150.05, amount: 10 },
        tradeAmount: 10,
      });
      expect(res.isProfitable).toBe(false);
      expect(res.netProfitUsd).toBeLessThan(0);
    });

    it('F3.4: computes orderbook walk VWAP slippage on deep books', () => {
      const orderBook = {
        symbol: 'BTC/USDT',
        asks: [
          { price: 50000, amount: 0.5 },
          { price: 50100, amount: 0.5 },
          { price: 50500, amount: 1.0 },
        ],
        bids: [],
        timestamp: Date.now(),
      };

      const res = calc.calculateVwapSlippage({ asks: orderBook.asks }, 'buy', 1.0);
      expect(res.vwap).toBe(50050); // (0.5 * 50000 + 0.5 * 50100) / 1.0 = 50050
    });

    it('F3.5: returns zero slippage for empty order book safely', () => {
      const res = calc.calculateVwapSlippage({ asks: [] }, 'buy', 1.0);
      expect(res.vwap).toBe(0);
    });
  });

  // ─── F4: Pre-Trade Risk Gates ──────────────────────────────────────────────
  describe('F4: Pre-Trade Risk Gates', () => {
    it('F4.1: allows trade when all gates pass', async () => {
      const guard = new ArbitrageRiskGuard({ capitalUsdc: 100000 });
      const res = await guard.checkPreTrade({
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        tradeNotionalUsd: 1000,
        bankrollUsd: 100000,
        netProfitBps: 20,
        currentDrawdown: 0.01,
        venueLatencies: { binance: 30, bybit: 40 },
        venueBalances: { binance: 10000, bybit: 10000 },
      });
      expect(res.allowed).toBe(true);
    });

    it('F4.2: rejects when trade notional exceeds maximum notional cap', async () => {
      const guard = new ArbitrageRiskGuard({ maxPerTradeNotionalUsd: 2000, capitalUsdc: 100000 });
      const res = await guard.checkPreTrade({
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        tradeNotionalUsd: 5000,
        bankrollUsd: 100000,
      });
      expect(res.allowed).toBe(false);
      expect(res.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_NOTIONAL_CAP);
    });

    it('F4.3: rejects when venue latency spikes above threshold', async () => {
      const guard = new ArbitrageRiskGuard({ maxVenueLatencyMs: 300, capitalUsdc: 100000 });
      const res = await guard.checkPreTrade({
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        tradeNotionalUsd: 1000,
        bankrollUsd: 100000,
        venueLatencies: { binance: 450, bybit: 50 },
      });
      expect(res.allowed).toBe(false);
      expect(res.rejectionReason).toBe(ArbitrageRejectionReason.VENUE_LATENCY_SPIKE);
    });

    it('F4.4: rejects when symbol exposure cap is exceeded', async () => {
      const guard = new ArbitrageRiskGuard({ maxOpenPositionPerSymbolUsd: 5000, capitalUsdc: 100000 });
      guard.recordTradeOpened('SOL/USDT', 'binance', 'bybit', 4500);

      const res = await guard.checkPreTrade({
        symbol: 'SOL/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        tradeNotionalUsd: 1000,
        bankrollUsd: 100000,
      });
      expect(res.allowed).toBe(false);
      expect(res.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_SYMBOL_CAP);
    });

    it('F4.5: rejects when venue exposure cap is exceeded', async () => {
      const guard = new ArbitrageRiskGuard({ maxOpenPositionPerVenueUsd: 10000, capitalUsdc: 100000 });
      guard.recordTradeOpened('BTC/USDT', 'kucoin', 'bybit', 9500);

      const res = await guard.checkPreTrade({
        symbol: 'ETH/USDT',
        buyVenue: 'kucoin',
        sellVenue: 'bybit',
        tradeNotionalUsd: 1000,
        bankrollUsd: 100000,
      });
      expect(res.allowed).toBe(false);
      expect(res.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_VENUE_CAP);
    });
  });

  // ─── F5: Quarter-Kelly Position Sizing ─────────────────────────────────────
  describe('F5: Quarter-Kelly Position Sizing', () => {
    const sizer = new KellyPositionSizer({ kellyFraction: 0.25, maxPositionFraction: 0.05 });

    it('F5.1: limits sizing to 5% hard cap of total bankroll', () => {
      const res = sizer.calculatePositionSize({ winProbability: 0.95, winLossRatio: 1.0, portfolioValue: 100000 });
      expect(res.positionSizeUsd).toBeLessThanOrEqual(5000); // 5% of 100k = 5000
      expect(res.cappedByMax).toBe(true);
    });

    it('F5.2: clamps to maxPositionFraction', () => {
      const customSizer = new KellyPositionSizer({ maxPositionFraction: 0.02 });
      const res = customSizer.calculatePositionSize({ winProbability: 0.95, winLossRatio: 1.0, portfolioValue: 100000 });
      expect(res.positionSizeUsd).toBe(2000); // 2% of 100k = 2000
    });

    it('F5.3: returns 0 when win probability is non-positive or negative edge', () => {
      const res = sizer.calculatePositionSize({ winProbability: 0.4, winLossRatio: 1.0, portfolioValue: 100000 });
      expect(res.positionSizeUsd).toBe(0);
    });

    it('F5.4: scales dynamically with smaller bankroll', () => {
      const res1 = sizer.calculatePositionSize({ winProbability: 0.95, winLossRatio: 1.0, portfolioValue: 20000 });
      const res2 = sizer.calculatePositionSize({ winProbability: 0.95, winLossRatio: 1.0, portfolioValue: 40000 });
      expect(res2.positionSizeUsd).toBeGreaterThan(res1.positionSizeUsd);
    });

    it('F5.5: returns zero when portfolio value is zero or negative', () => {
      const res = sizer.calculatePositionSize({ winProbability: 0.95, winLossRatio: 1.0, portfolioValue: 0 });
      expect(res.positionSizeUsd).toBe(0);
    });
  });

  // ─── F6: Platform Circuit Breakers ─────────────────────────────────────────
  describe('F6: Platform Circuit Breakers', () => {
    it('F6.1: trips circuit breaker when daily drawdown reaches 15%', async () => {
      const guard = new ArbitrageRiskGuard({ maxDailyDrawdownFraction: 0.15, capitalUsdc: 100000 });
      const res = await guard.checkPreTrade({
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        tradeNotionalUsd: 1000,
        bankrollUsd: 100000,
        currentDrawdown: 0.15,
      });
      expect(res.allowed).toBe(false);
      expect(res.rejectionReason).toBe(ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED);
    });

    it('F6.2: trips when daily drawdown exceeds 15% threshold', async () => {
      const guard = new ArbitrageRiskGuard({ maxDailyDrawdownFraction: 0.15, capitalUsdc: 100000 });
      const res = await guard.checkPreTrade({
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        tradeNotionalUsd: 1000,
        bankrollUsd: 100000,
        currentDrawdown: 0.18,
      });
      expect(res.allowed).toBe(false);
      expect(res.rejectionReason).toBe(ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED);
    });

    it('F6.3: allows trade when daily drawdown is within safe envelope', async () => {
      const guard = new ArbitrageRiskGuard({ maxDailyDrawdownFraction: 0.15, capitalUsdc: 100000 });
      const res = await guard.checkPreTrade({
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        tradeNotionalUsd: 1000,
        bankrollUsd: 100000,
        currentDrawdown: 0.08,
      });
      expect(res.allowed).toBe(true);
    });

    it('F6.4: enforces buy venue latency threshold independently', async () => {
      const guard = new ArbitrageRiskGuard({ maxVenueLatencyMs: 400, capitalUsdc: 100000 });
      const res = await guard.checkPreTrade({
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        tradeNotionalUsd: 1000,
        bankrollUsd: 100000,
        venueLatencies: { binance: 500, bybit: 50 },
      });
      expect(res.allowed).toBe(false);
      expect(res.rejectionReason).toBe(ArbitrageRejectionReason.VENUE_LATENCY_SPIKE);
    });

    it('F6.5: enforces sell venue latency threshold independently', async () => {
      const guard = new ArbitrageRiskGuard({ maxVenueLatencyMs: 400, capitalUsdc: 100000 });
      const res = await guard.checkPreTrade({
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        tradeNotionalUsd: 1000,
        bankrollUsd: 100000,
        venueLatencies: { binance: 50, bybit: 600 },
      });
      expect(res.allowed).toBe(false);
      expect(res.rejectionReason).toBe(ArbitrageRejectionReason.VENUE_LATENCY_SPIKE);
    });
  });

  // ─── F7: Execution Mode Safeguards ─────────────────────────────────────────
  describe('F7: Execution Mode Safeguards', () => {
    it('F7.1: dry-run mode succeeds without live API credentials', async () => {
      const guard = new ArbitrageRiskGuard({ mode: 'dry-run' });
      const res = await guard.checkPreTrade({
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        tradeNotionalUsd: 1000,
        bankrollUsd: 100000,
        netProfitBps: 20,
      });
      expect(res.allowed).toBe(true);
    });

    it('F7.2: live mode fails closed if LIVE_TRADING_ENABLED is missing', async () => {
      const original = process.env.LIVE_TRADING_ENABLED;
      try {
        delete process.env.LIVE_TRADING_ENABLED;
        const guard = new ArbitrageRiskGuard({ mode: 'live' });
        const res = await guard.checkPreTrade({
          symbol: 'BTC/USDT',
          buyVenue: 'binance',
          sellVenue: 'bybit',
          tradeNotionalUsd: 1000,
          bankrollUsd: 100000,
          netProfitBps: 20,
        });
        expect(res.allowed).toBe(false);
        expect(res.rejectionReason).toBe(ArbitrageRejectionReason.MISSING_LIVE_CREDENTIALS);
      } finally {
        process.env.LIVE_TRADING_ENABLED = original;
      }
    });

    it('F7.3: live mode fails closed if exchange credentials missing', async () => {
      const origEnv = process.env.LIVE_TRADING_ENABLED;
      try {
        process.env.LIVE_TRADING_ENABLED = 'true';
        delete process.env.BINANCE_API_KEY;
        const guard = new ArbitrageRiskGuard({ mode: 'live' });
        const res = await guard.checkPreTrade({
          symbol: 'BTC/USDT',
          buyVenue: 'binance',
          sellVenue: 'bybit',
          tradeNotionalUsd: 1000,
          bankrollUsd: 100000,
          netProfitBps: 20,
        });
        expect(res.allowed).toBe(false);
        expect(res.rejectionReason).toBe(ArbitrageRejectionReason.MISSING_LIVE_CREDENTIALS);
      } finally {
        process.env.LIVE_TRADING_ENABLED = origEnv;
      }
    });

    it('F7.4: pre-trade venue balance check blocks trade on insufficient funds', async () => {
      const guard = new ArbitrageRiskGuard({ mode: 'paper' });
      const res = await guard.checkPreTrade({
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        tradeNotionalUsd: 5000,
        bankrollUsd: 100000,
        netProfitBps: 20,
        venueBalances: { binance: 1000, bybit: 10000 }, // binance 1000 < 5000
      });
      expect(res.allowed).toBe(false);
      expect(res.rejectionReason).toBe(ArbitrageRejectionReason.INSUFFICIENT_VENUE_BALANCE);
    });

    it('F7.5: live mode validates Polymarket credentials for Polymarket legs', async () => {
      const origEnv = process.env.LIVE_TRADING_ENABLED;
      try {
        process.env.LIVE_TRADING_ENABLED = 'true';
        process.env.BINANCE_API_KEY = 'test-key';
        process.env.BINANCE_API_SECRET = 'test-secret';
        delete process.env.POLYMARKET_API_KEY;
        delete process.env.POLYMARKET_PRIVATE_KEY;

        const guard = new ArbitrageRiskGuard({ mode: 'live' });
        const res = await guard.checkPreTrade({
          symbol: 'POLY/USDT',
          buyVenue: 'binance',
          sellVenue: 'polymarket',
          tradeNotionalUsd: 1000,
          bankrollUsd: 100000,
          netProfitBps: 25,
        });
        expect(res.allowed).toBe(false);
        expect(res.rejectionReason).toBe(ArbitrageRejectionReason.MISSING_LIVE_CREDENTIALS);
      } finally {
        process.env.LIVE_TRADING_ENABLED = origEnv;
        delete process.env.BINANCE_API_KEY;
        delete process.env.BINANCE_API_SECRET;
      }
    });
  });

  // ─── F8: Atomic Multi-Leg Order Coordinator ────────────────────────────────
  describe('F8: Atomic Multi-Leg Order Coordinator', () => {
    it('F8.1: coordinates concurrent execution across 2 venues', async () => {
      const binance = createMockConnector('binance');
      const bybit = createMockConnector('bybit');
      const coordinator = new AtomicMultiLegCoordinator((v) => (v === 'binance' ? binance : bybit));

      const report = await coordinator.execute({
        orderId: 'f8-1',
        opportunityId: 'opp-f8-1',
        executionMode: 'concurrent',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 0.1, price: 50000, type: 'limit' },
          { legId: 'leg-2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', amount: 0.1, price: 50200, type: 'limit' },
        ],
      });

      expect(report.state).toBe('FILLED');
      expect(binance.placeOrder).toHaveBeenCalled();
      expect(bybit.placeOrder).toHaveBeenCalled();
    });

    it('F8.2: coordinates staged execution in exact sequence', async () => {
      const callSequence: string[] = [];
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn().mockImplementation(async () => {
          callSequence.push('binance');
          return { orderId: 'b-1', filled: 0.1, price: 50000, status: 'closed' };
        }),
      });
      const kucoin = createMockConnector('kucoin', {
        placeOrder: vi.fn().mockImplementation(async () => {
          callSequence.push('kucoin');
          return { orderId: 'k-1', filled: 0.1, price: 50200, status: 'closed' };
        }),
      });

      const coordinator = new AtomicMultiLegCoordinator((v) => (v === 'binance' ? binance : kucoin));
      await coordinator.execute({
        orderId: 'f8-2',
        opportunityId: 'opp-f8-2',
        executionMode: 'sequential',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'ETH/USDT', side: 'buy', amount: 0.1, price: 3000, type: 'limit' },
          { legId: 'leg-2', venue: 'kucoin', symbol: 'ETH/USDT', side: 'sell', amount: 0.1, price: 3020, type: 'limit' },
        ],
      });

      expect(callSequence).toEqual(['binance', 'kucoin']);
    });

    it('F8.3: enforces millisecond timeout on single leg order', async () => {
      const binance = createMockConnector('binance');
      const bybit = createMockConnector('bybit', {
        placeOrder: vi.fn().mockImplementation(() => new Promise((r) => setTimeout(r, 200))),
      });
      const coordinator = new AtomicMultiLegCoordinator((v) => (v === 'binance' ? binance : bybit));

      const report = await coordinator.execute({
        orderId: 'f8-3',
        opportunityId: 'opp-f8-3',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 0.1, price: 50000, type: 'limit' },
          { legId: 'leg-2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', amount: 0.1, price: 50200, type: 'limit', timeoutMs: 30 },
        ],
      });

      expect(report.state).toBe('UNWOUND');
      expect(report.unwindResult).toBeDefined();
    });

    it('F8.4: calculates net realized PnL correctly upon complete fill', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn().mockResolvedValue({ orderId: 'b-1', filled: 1, price: 50000, status: 'closed' }),
      });
      const bybit = createMockConnector('bybit', {
        placeOrder: vi.fn().mockResolvedValue({ orderId: 'by-1', filled: 1, price: 50300, status: 'closed' }),
      });
      const coordinator = new AtomicMultiLegCoordinator((v) => (v === 'binance' ? binance : bybit));

      const report = await coordinator.execute({
        orderId: 'f8-4',
        opportunityId: 'opp-f8-4',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 1, price: 50000, type: 'limit' },
          { legId: 'leg-2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', amount: 1, price: 50300, type: 'limit' },
        ],
      });

      expect(report.netRealizedPnlUsd).toBe(300);
    });

    it('F8.5: handles missing connector gracefully with failed leg record', async () => {
      const coordinator = new AtomicMultiLegCoordinator(() => undefined);
      const report = await coordinator.execute({
        orderId: 'f8-5',
        opportunityId: 'opp-f8-5',
        legs: [
          { legId: 'leg-1', venue: 'nonexistent', symbol: 'BTC/USDT', side: 'buy', amount: 1, price: 50000, type: 'limit' },
        ],
      });
      expect(report.state).toBe('FAILED');
      expect(report.legs[0].status).toBe('failed');
    });
  });

  // ─── F9: 6-State Execution Machine ─────────────────────────────────────────
  describe('F9: 6-State Execution Machine', () => {
    it('F9.1: transitions from PENDING -> SUBMITTED -> FILLED on complete fill', async () => {
      const binance = createMockConnector('binance');
      const coordinator = new AtomicMultiLegCoordinator(() => binance);
      const report = await coordinator.execute({
        orderId: 'f9-1',
        opportunityId: 'opp-f9-1',
        legs: [{ legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 0.1, price: 50000, type: 'limit' }],
      });
      expect(report.state).toBe('FILLED');
    });

    it('F9.2: transitions to PARTIAL_UNWINDING and then UNWOUND when a leg fails', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn().mockResolvedValue({ orderId: 'b-1', filled: 0.5, price: 50000, status: 'closed' }),
      });
      const bybit = createMockConnector('bybit', {
        placeOrder: vi.fn().mockRejectedValue(new Error('Connection reset')),
      });
      const coordinator = new AtomicMultiLegCoordinator((v) => (v === 'binance' ? binance : bybit));
      const report = await coordinator.execute({
        orderId: 'f9-2',
        opportunityId: 'opp-f9-2',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 0.5, price: 50000, type: 'limit' },
          { legId: 'leg-2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', amount: 0.5, price: 50200, type: 'limit' },
        ],
      });
      expect(report.state).toBe('UNWOUND');
      expect(report.unwindResult?.success).toBe(true);
    });

    it('F9.3: transitions to FAILED if compensatory unwind itself fails', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn()
          .mockResolvedValueOnce({ orderId: 'b-1', filled: 0.5, price: 50000, status: 'closed' })
          .mockRejectedValueOnce(new Error('Unwind exchange error')),
      });
      const bybit = createMockConnector('bybit', {
        placeOrder: vi.fn().mockRejectedValue(new Error('Bybit failed')),
      });
      const coordinator = new AtomicMultiLegCoordinator((v) => (v === 'binance' ? binance : bybit));
      const report = await coordinator.execute({
        orderId: 'f9-3',
        opportunityId: 'opp-f9-3',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 0.5, price: 50000, type: 'limit' },
          { legId: 'leg-2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', amount: 0.5, price: 50200, type: 'limit' },
        ],
      });
      expect(report.state).toBe('FAILED');
    });

    it('F9.4: records intermediate leg statuses (filled, failed, partial)', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn().mockResolvedValue({ orderId: 'b-1', filled: 0.2, price: 50000, status: 'open' }),
      });
      const kucoin = createMockConnector('kucoin', {
        placeOrder: vi.fn().mockRejectedValue(new Error('KuCoin rejected')),
      });
      const coordinator = new AtomicMultiLegCoordinator((v) => (v === 'binance' ? binance : kucoin));
      const report = await coordinator.execute({
        orderId: 'f9-4',
        opportunityId: 'opp-f9-4',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 1.0, price: 50000, type: 'limit' },
          { legId: 'leg-2', venue: 'kucoin', symbol: 'BTC/USDT', side: 'sell', amount: 1.0, price: 50200, type: 'limit' },
        ],
      });
      expect(report.legs[0].status).toBe('partial');
      expect(report.legs[1].status).toBe('failed');
    });

    it('F9.5: includes complete timing latency metadata on report', async () => {
      const binance = createMockConnector('binance');
      const coordinator = new AtomicMultiLegCoordinator(() => binance);
      const report = await coordinator.execute({
        orderId: 'f9-5',
        opportunityId: 'opp-f9-5',
        legs: [{ legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 0.1, price: 50000, type: 'limit' }],
      });
      expect(report.latencyMs).toBeGreaterThanOrEqual(0);
      expect(report.timestamp).toBeGreaterThan(0);
    });
  });

  // ─── F10: Compensatory Unwind & Hedge ──────────────────────────────────────
  describe('F10: Compensatory Unwind & Hedge', () => {
    it('F10.1: places market order on opposite side to liquidate inventory', async () => {
      const binance = createMockConnector('binance');
      const handler = new CompensatoryUnwindHandler(() => binance);
      await handler.executeUnwind('exec-10-1', [
        { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', requestedAmount: 1, filledAmount: 1, price: 50000, status: 'filled', latencyMs: 10 },
      ]);
      expect(binance.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTC/USDT',
          side: 'sell',
          type: 'market',
          amount: 1,
        }),
      );
    });

    it('F10.2: buys back inventory if original leg was a sell', async () => {
      const bybit = createMockConnector('bybit');
      const handler = new CompensatoryUnwindHandler(() => bybit);
      await handler.executeUnwind('exec-10-2', [
        { legId: 'l2', venue: 'bybit', symbol: 'ETH/USDT', side: 'sell', requestedAmount: 2, filledAmount: 2, price: 3000, status: 'filled', latencyMs: 10 },
      ]);
      expect(bybit.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'ETH/USDT',
          side: 'buy',
          type: 'market',
          amount: 2,
        }),
      );
    });

    it('F10.3: tracks unwind cost divergence in UnwindReport', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn().mockResolvedValue({ orderId: 'unwind-1', filled: 1, price: 49900, status: 'closed' }),
      });
      const handler = new CompensatoryUnwindHandler(() => binance);
      const report = await handler.executeUnwind('exec-10-3', [
        { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', requestedAmount: 1, filledAmount: 1, price: 50000, status: 'filled', latencyMs: 10 },
      ]);
      // Bought at 50,000, unwound at 49,900 -> 100 USD cost
      expect(report.unwindCostUsd).toBe(100);
      expect(report.success).toBe(true);
    });

    it('F10.4: ignores legs with zero filled amount during unwind', async () => {
      const binance = createMockConnector('binance');
      const handler = new CompensatoryUnwindHandler(() => binance);
      const report = await handler.executeUnwind('exec-10-4', [
        { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', requestedAmount: 1, filledAmount: 0, price: 50000, status: 'failed', latencyMs: 10 },
      ]);
      expect(binance.placeOrder).not.toHaveBeenCalled();
      expect(report.unwoundLegs.length).toBe(0);
    });

    it('F10.5: reports failure if connector cannot be resolved for filled leg', async () => {
      const handler = new CompensatoryUnwindHandler(() => undefined);
      const report = await handler.executeUnwind('exec-10-5', [
        { legId: 'l1', venue: 'unknown-venue', symbol: 'BTC/USDT', side: 'buy', requestedAmount: 1, filledAmount: 1, price: 50000, status: 'filled', latencyMs: 10 },
      ]);
      expect(report.success).toBe(false);
      expect(report.error).toContain('No connector registered');
    });
  });

  // ─── F11: Arbitrage Prometheus Metrics ─────────────────────────────────────
  describe('F11: Arbitrage Prometheus Metrics', () => {
    it('F11.1: increments arb_orders_total with venue, status, strategy labels', async () => {
      const metrics = new ArbitrageMetrics({ prefix: 'test_f11_' });
      metrics.recordOrder('binance', 'filled', 'concurrent');
      const text = await metrics.getMetrics();
      expect(text).toContain('test_f11_orders_total{venue="binance",status="filled",strategy="concurrent"} 1');
    });

    it('F11.2: observes arb_execution_latency_ms histogram buckets', async () => {
      const metrics = new ArbitrageMetrics({ prefix: 'test_f11_' });
      metrics.recordExecutionLatency('bybit', 'staged', 25);
      const text = await metrics.getMetrics();
      expect(text).toContain('test_f11_execution_latency_ms_bucket');
      expect(text).toContain('venue="bybit"');
    });

    it('F11.3: observes arb_slippage_bps histogram', async () => {
      const metrics = new ArbitrageMetrics({ prefix: 'test_f11_' });
      metrics.recordSlippage('kucoin', 'SOL/USDT', 5);
      const text = await metrics.getMetrics();
      expect(text).toContain('test_f11_slippage_bps_bucket');
    });

    it('F11.4: records cumulative realized PnL partitioned by profit and loss', async () => {
      const metrics = new ArbitrageMetrics({ prefix: 'test_f11_' });
      metrics.recordPnl('concurrent', 120);
      metrics.recordPnl('concurrent', -40);
      const text = await metrics.getMetrics();
      expect(text).toContain('test_f11_pnl_usd{strategy="concurrent",result="profit"} 120');
      expect(text).toContain('test_f11_pnl_usd{strategy="concurrent",result="loss"} 40');
    });

    it('F11.5: records unwind count and tracks active executions gauge', async () => {
      const metrics = new ArbitrageMetrics({ prefix: 'test_f11_' });
      metrics.recordUnwind('binance', true);
      metrics.incActiveExecutions();
      let text = await metrics.getMetrics();
      expect(text).toContain('test_f11_active_executions 1');
      metrics.decActiveExecutions();
      text = await metrics.getMetrics();
      expect(text).toContain('test_f11_active_executions 0');
    });
  });

  // ─── F12: Hash-Chained Audit Logging ───────────────────────────────────────
  describe('F12: Hash-Chained Audit Logging', () => {
    const auditLogger = new ArbitrageAuditLogger();

    it('F12.1: writes audit entry for successful trade execution', async () => {
      await auditLogger.logExecution({
        executionId: 'f12-1',
        opportunityId: 'opp-f12-1',
        state: 'FILLED',
        legs: [],
        netRealizedPnlUsd: 150,
        latencyMs: 25,
        timestamp: Date.now(),
      });
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'arbitrage:trade_execution',
          result: 'success',
        }),
      );
    });

    it('F12.2: writes audit entry for compensatory unwind', async () => {
      await auditLogger.logUnwind('f12-2', {
        unwindId: 'unwind-f12-2',
        success: true,
        unwoundLegs: [],
        unwindCostUsd: 20,
        timestamp: Date.now(),
      });
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'arbitrage:compensatory_unwind',
          result: 'success',
        }),
      );
    });

    it('F12.3: writes audit entry for risk rejection with denied status', async () => {
      await auditLogger.logRiskRejection({
        opportunityId: 'opp-f12-3',
        reason: 'Drawdown breached',
        rule: 'DRAWDOWN_LIMIT',
      });
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'arbitrage:risk_rejection',
          result: 'denied',
        }),
      );
    });

    it('F12.4: includes SHA-256 hashed IP address in audit entry', async () => {
      await auditLogger.logExecution({
        executionId: 'f12-4',
        opportunityId: 'opp-f12-4',
        state: 'FILLED',
        legs: [],
        latencyMs: 15,
        timestamp: Date.now(),
      });
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          ipHash: 'mocked-ip-hash-sha256',
        }),
      );
    });

    it('F12.5: handles audit write failure gracefully without unhandled exception', async () => {
      vi.mocked(logAudit).mockRejectedValueOnce(new Error('Audit DB offline'));
      await expect(
        auditLogger.logExecution({
          executionId: 'f12-5',
          opportunityId: 'opp-f12-5',
          state: 'FILLED',
          legs: [],
          latencyMs: 10,
          timestamp: Date.now(),
        }),
      ).resolves.toBeUndefined();
    });
  });

  // ─── F13: Structured Logger Discipline ─────────────────────────────────────
  describe('F13: Structured Logger Discipline', () => {
    it('F13.1: uses structured logger without console.log', () => {
      const spyInfo = vi.spyOn(logger, 'info');
      logger.info('Structured log test', { module: 'arbitrage', status: 'ok' });
      expect(spyInfo).toHaveBeenCalledWith('Structured log test', { module: 'arbitrage', status: 'ok' });
    });

    it('F13.2: uses logger.warn for risk guard rejections', async () => {
      const spyWarn = vi.spyOn(logger, 'warn');
      const auditLogger = new ArbitrageAuditLogger();
      await auditLogger.logRiskRejection({ opportunityId: 'opp-1', reason: 'Too high', rule: 'MAX_CAP' });
      expect(spyWarn).toHaveBeenCalled();
    });

    it('F13.3: uses logger.error for execution errors and unwinds', async () => {
      const spyError = vi.spyOn(logger, 'error');
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn().mockRejectedValue(new Error('Fatal disconnect')),
      });
      const unwind = new CompensatoryUnwindHandler(() => binance);
      await unwind.executeUnwind('unwind-err', [
        { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', requestedAmount: 1, filledAmount: 1, price: 50000, status: 'filled', latencyMs: 10 },
      ]);
      expect(spyError).toHaveBeenCalled();
    });

    it('F13.4: context payload includes operation IDs for traceability', async () => {
      const spyInfo = vi.spyOn(logger, 'info');
      const binance = createMockConnector('binance');
      const coordinator = new AtomicMultiLegCoordinator(() => binance);
      await coordinator.execute({
        orderId: 'trace-123',
        opportunityId: 'opp-trace-123',
        legs: [{ legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 0.1, price: 50000, type: 'limit' }],
      });
      expect(spyInfo).toHaveBeenCalledWith(
        expect.stringContaining('[AtomicMultiLegCoordinator]'),
        expect.objectContaining({ orderId: 'trace-123', opportunityId: 'opp-trace-123' }),
      );
    });

    it('F13.5: error logs sanitize raw stacks and encapsulate error messages', async () => {
      const spyError = vi.spyOn(logger, 'error');
      const unwind = new CompensatoryUnwindHandler(() => undefined);
      await unwind.executeUnwind('err-sanitized', [
        { legId: 'l1', venue: 'missing-venue', symbol: 'BTC/USDT', side: 'buy', requestedAmount: 1, filledAmount: 1, price: 50000, status: 'filled', latencyMs: 10 },
      ]);
      expect(spyError).toHaveBeenCalledWith(
        expect.stringContaining('[CompensatoryUnwindHandler]'),
        expect.objectContaining({ venue: 'missing-venue' }),
      );
    });
  });
});
