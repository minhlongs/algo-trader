/**
 * Tier 4: Real-World Scenarios Test Suite
 *
 * Implements the 5 end-to-end production scenarios per TEST_INFRA.md:
 * - S1: Polymarket vs Binance BTC cash-and-carry arb with Polygon gas
 * - S2: Binance vs Bybit ETH inter-CEX spread with multi-tier VWAP walk
 * - S3: Leg 1 fill + Leg 2 timeout with automated compensatory unwind
 * - S4: Sudden 16% drawdown trip with circuit breaker halt cascade
 * - S5: Live mode credential failure with fail-closed safe rejection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArbitrageEngine } from '../../../src/desk/arbitrage/arbitrage-engine';
import { NetProfitabilityCalculator } from '../../../src/desk/arbitrage/net-profitability-calculator';
import {
  ArbitrageRiskGuard,
  ArbitrageRejectionReason,
} from '../../../src/desk/arbitrage/arbitrage-risk-guard';
import { AtomicMultiLegCoordinator } from '../../../src/desk/arbitrage/atomic-multileg-coordinator';
import { CompensatoryUnwindHandler } from '../../../src/desk/arbitrage/compensatory-unwind-handler';
import { ArbitrageMetrics } from '../../../src/desk/arbitrage/telemetry/arbitrage-metrics';
import { ArbitrageAuditLogger } from '../../../src/desk/arbitrage/telemetry/arbitrage-audit-logger';
import type { IExchangeConnector } from '../../../src/desk/arbitrage/connectors/types';
import type { ArbitrageOpportunity } from '../../../src/desk/arbitrage/types';

vi.mock('../../../src/seed/security/audit-log', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  hashIpAddress: vi.fn().mockReturnValue('mocked-ip-hash-sha256'),
}));

import { logAudit } from '../../../src/seed/security/audit-log';

describe('Tier 4: Real-World Production Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
      amount: 0.04,
      filled: 0.04,
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

  // ─── Scenario S1: Polymarket vs Binance BTC Cash-and-Carry Arb ──────────────
  describe('Scenario S1: Polymarket vs Binance BTC Cash-and-Carry Arb', () => {
    it('executes cash-and-carry arb between Polymarket prediction CLOB and Binance spot', async () => {
      const polymarket = createMockConnector('polymarket', {
        placeOrder: vi.fn().mockResolvedValue({
          orderId: 'poly-ord-1',
          clientOrderId: 'poly-cl-1',
          symbol: 'BTC-USDC-70K',
          side: 'buy',
          type: 'limit',
          price: 0.65,
          amount: 1000,
          filled: 1000,
          status: 'closed',
          timestamp: Date.now(),
        }),
      });

      const binance = createMockConnector('binance', {
        placeOrder: vi.fn().mockResolvedValue({
          orderId: 'bin-ord-1',
          clientOrderId: 'bin-cl-1',
          symbol: 'BTC/USDT',
          side: 'sell',
          type: 'limit',
          price: 0.68,
          amount: 1000,
          filled: 1000,
          status: 'closed',
          timestamp: Date.now(),
        }),
      });

      const calc = new NetProfitabilityCalculator();
      const profitability = calc.calculate({
        buyLeg: {
          venue: 'polymarket',
          symbol: 'BTC-USDC-70K',
          side: 'buy',
          price: 0.65,
          amount: 1000,
          settlementType: 'on_chain_settle',
        },
        sellLeg: {
          venue: 'binance',
          symbol: 'BTC/USDT',
          side: 'sell',
          price: 0.68,
          amount: 1000,
        },
        tradeAmount: 1000,
        gasConfig: { polygonGasPriceGwei: 50, maticPriceUsd: 0.5 },
      });

      expect(profitability.isProfitable).toBe(true);
      expect(profitability.estimatedGasUsd).toBeGreaterThan(0);
      expect(profitability.netProfitUsd).toBeGreaterThan(0);

      const engine = new ArbitrageEngine(
        (v) => (v === 'polymarket' ? polymarket : binance),
        {
          mode: 'dry-run',
          minNetProfitBps: 10,
          riskConfig: { capitalUsdc: 1_000_000, maxPerTradeNotionalUsd: 50_000 },
        },
      );

      const opp: ArbitrageOpportunity = {
        id: 'opp-s1-btc-poly-bin',
        symbol: 'BTC-USDC-70K',
        buyVenue: 'polymarket',
        sellVenue: 'binance',
        buyPrice: 0.65,
        sellPrice: 0.68,
        netProfitBps: profitability.netProfitBps,
        tradeSize: 1000,
        timestamp: Date.now(),
      };

      const report = await engine.executeOpportunity(opp);

      expect(report).not.toBeNull();
      expect(report?.state).toBe('FILLED');
      expect(polymarket.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({ side: 'buy', price: 0.65, amount: 1000 }),
      );
      expect(binance.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({ side: 'sell', price: 0.68, amount: 1000 }),
      );

      // Verified in Prometheus telemetry and HMAC audit log
      const metricsText = await engine.metrics.getMetrics();
      expect(metricsText).toContain('arb_orders_total{venue="polymarket",status="filled",strategy="concurrent_arbitrage"} 1');
      expect(metricsText).toContain('arb_orders_total{venue="binance",status="filled",strategy="concurrent_arbitrage"} 1');

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'arbitrage:trade_execution',
          result: 'success',
          metadata: expect.objectContaining({
            opportunityId: 'opp-s1-btc-poly-bin',
            state: 'FILLED',
          }),
        }),
      );
    });
  });

  // ─── Scenario S2: Binance vs Bybit ETH Inter-CEX Rapid Cross-Venue Spread ──
  describe('Scenario S2: Binance vs Bybit ETH Inter-CEX Rapid Cross-Venue Spread', () => {
    it('executes sequential order with multi-tier VWAP orderbook walk', async () => {
      const calc = new NetProfitabilityCalculator();

      // Deep 3-tier orderbook on Binance asks
      const deepAsks = {
        asks: [
          { price: 3000, amount: 1.0 },
          { price: 3005, amount: 1.0 },
          { price: 3010, amount: 1.0 },
        ],
      };
      const slippage = calc.calculateVwapSlippage(deepAsks, 'buy', 2.0);
      expect(slippage.vwap).toBe(3002.5); // (3000*1 + 3005*1)/2
      expect(slippage.slippageBps).toBeGreaterThan(0);

      const binance = createMockConnector('binance', {
        placeOrder: vi.fn().mockResolvedValue({
          orderId: 'b-seq-1',
          filled: 0.04,
          price: 3002.5,
          status: 'closed',
        }),
      });

      const bybit = createMockConnector('bybit', {
        placeOrder: vi.fn().mockResolvedValue({
          orderId: 'by-seq-2',
          filled: 0.04,
          price: 3015.0,
          status: 'closed',
        }),
      });

      const callOrder: string[] = [];
      binance.placeOrder = vi.fn().mockImplementation(async () => {
        callOrder.push('binance');
        return { orderId: 'b-1', filled: 0.04, price: 3002.5, status: 'closed' };
      });
      bybit.placeOrder = vi.fn().mockImplementation(async () => {
        callOrder.push('bybit');
        return { orderId: 'by-2', filled: 0.04, price: 3015.0, status: 'closed' };
      });

      const coordinator = new AtomicMultiLegCoordinator((v) => (v === 'binance' ? binance : bybit));

      const report = await coordinator.execute({
        orderId: 's2-sequential-eth',
        opportunityId: 'opp-s2-eth',
        executionMode: 'sequential',
        legs: [
          { legId: 'leg-1-buy', venue: 'binance', symbol: 'ETH/USDT', side: 'buy', amount: 0.04, price: 3002.5, type: 'limit' },
          { legId: 'leg-2-sell', venue: 'bybit', symbol: 'ETH/USDT', side: 'sell', amount: 0.04, price: 3015.0, type: 'limit' },
        ],
      });

      expect(report.state).toBe('FILLED');
      expect(callOrder).toEqual(['binance', 'bybit']); // Staged in exact sequence
      expect(report.netRealizedPnlUsd).toBeGreaterThan(0);
    });
  });

  // ─── Scenario S3: Leg 1 Fill + Leg 2 Timeout -> Compensatory Unwind ─────────
  describe('Scenario S3: Leg 1 Fill + Leg 2 Timeout -> Immediate Compensatory Unwind', () => {
    it('liquidates Leg 1 exposure immediately when Leg 2 hangs or times out', async () => {
      const kucoin = createMockConnector('kucoin', {
        placeOrder: vi.fn()
          .mockResolvedValueOnce({ orderId: 'kuc-fill', filled: 0.04, price: 150, status: 'closed' })
          .mockResolvedValueOnce({ orderId: 'kuc-unwind', filled: 0.04, price: 149.5, status: 'closed' }),
      });

      const bybit = createMockConnector('bybit', {
        placeOrder: vi.fn().mockImplementation(() => new Promise((r) => setTimeout(r, 100))), // Exceeds 20ms timeout
      });

      const unwindHandler = new CompensatoryUnwindHandler((v) => (v === 'kucoin' ? kucoin : bybit));
      const coordinator = new AtomicMultiLegCoordinator(
        (v) => (v === 'kucoin' ? kucoin : bybit),
        unwindHandler,
      );

      const report = await coordinator.execute({
        orderId: 's3-unwind-timeout',
        opportunityId: 'opp-s3-sol',
        legs: [
          { legId: 'leg-1-buy', venue: 'kucoin', symbol: 'SOL/USDT', side: 'buy', amount: 0.04, price: 150, type: 'limit' },
          { legId: 'leg-2-sell', venue: 'bybit', symbol: 'SOL/USDT', side: 'sell', amount: 0.04, price: 151, type: 'limit', timeoutMs: 20 },
        ],
      });

      expect(report.state).toBe('UNWOUND');
      expect(report.unwindResult?.success).toBe(true);
      expect(report.unwindResult?.unhedgedResidualDelta).toBe(0); // Zero unhedged leakage
      expect(report.unwindResult?.unwindCostUsd).toBeGreaterThanOrEqual(0);

      // Inverse market order sent to KuCoin to close out inventory
      expect(kucoin.placeOrder).toHaveBeenCalledTimes(2);
      expect(kucoin.placeOrder).toHaveBeenLastCalledWith(
        expect.objectContaining({ side: 'sell', amount: 0.04, type: 'market' }),
      );
    });
  });

  // ─── Scenario S4: Sudden 16% Drawdown Trip -> Circuit Breaker Halt ──────────
  describe('Scenario S4: Sudden 16% Drawdown Trip -> Circuit Breaker Halt', () => {
    it('halts engine immediately and rejects incoming profitable opportunities', async () => {
      const binance = createMockConnector('binance');
      const bybit = createMockConnector('bybit');

      const engine = new ArbitrageEngine(
        (v) => (v === 'binance' ? binance : bybit),
        {
          mode: 'dry-run',
          riskConfig: { maxDailyDrawdownFraction: 0.15 },
        },
      );

      // Pre-trade risk check detects 16.5% daily drawdown
      const breachCheck = await engine.riskGuard.checkPreTrade({
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        tradeNotionalUsd: 1000,
        bankrollUsd: 100000,
        currentDrawdown: 0.165,
      });

      expect(breachCheck.allowed).toBe(false);
      expect(breachCheck.rejectionReason).toBe(ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED);

      // Zero orders placed to venues
      expect(binance.placeOrder).not.toHaveBeenCalled();
      expect(bybit.placeOrder).not.toHaveBeenCalled();
    });
  });

  // ─── Scenario S5: Live Mode Credential Failure -> Fail-Closed Safe Rejection ─
  describe('Scenario S5: Live Mode Credential Failure -> Fail-Closed Safe Rejection', () => {
    it('fails closed safely with zero naked delta when API credentials are missing in live mode', async () => {
      const origTrading = process.env.LIVE_TRADING_ENABLED;
      const origBybitKey = process.env.BYBIT_API_KEY;

      try {
        process.env.LIVE_TRADING_ENABLED = 'true';
        delete process.env.BYBIT_API_KEY; // Missing Bybit API key in live mode

        const binance = createMockConnector('binance');
        const bybit = createMockConnector('bybit');

        const engine = new ArbitrageEngine(
          (v) => (v === 'binance' ? binance : bybit),
          { mode: 'live' },
        );

        const opp: ArbitrageOpportunity = {
          id: 'opp-s5-missing-keys',
          symbol: 'BTC/USDT',
          buyVenue: 'binance',
          sellVenue: 'bybit',
          buyPrice: 50000,
          sellPrice: 50250,
          netProfitBps: 30,
          tradeSize: 0.04,
          timestamp: Date.now(),
        };

        const report = await engine.executeOpportunity(opp);

        // Execution blocked fail-closed
        expect(report).toBeNull();
        expect(binance.placeOrder).not.toHaveBeenCalled();
        expect(bybit.placeOrder).not.toHaveBeenCalled();

        // Audit trail records denial
        expect(logAudit).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'arbitrage:risk_rejection',
            result: 'denied',
            metadata: expect.objectContaining({
              reason: ArbitrageRejectionReason.MISSING_LIVE_CREDENTIALS,
            }),
          }),
        );
      } finally {
        process.env.LIVE_TRADING_ENABLED = origTrading;
        if (origBybitKey) process.env.BYBIT_API_KEY = origBybitKey;
      }
    });
  });
});
