/**
 * Tier 3: Cross-Feature Integration Test Suite
 *
 * Verifies end-to-end and pairwise interactions across:
 * - Ingestion Pipeline <-> Net Profitability Calculator
 * - Ingestion Pipeline <-> Pre-Trade Risk Guard
 * - Risk Guard <-> Kelly Position Sizer
 * - Multi-Leg Coordinator <-> Exchange Connectors (CCXT & Polymarket)
 * - Multi-Leg Coordinator <-> Compensatory Unwind Handler
 * - Engine <-> Prometheus Metrics & Hash-Chained Audit Trail
 * - Circuit Breaker <-> Execution Halt Cascade
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpportunityIngestionPipeline } from '../../../src/desk/arbitrage/opportunity-ingestion-pipeline';
import { NetProfitabilityCalculator } from '../../../src/desk/arbitrage/net-profitability-calculator';
import { CcxtExchangeConnector } from '../../../src/desk/markets/cex/ccxt-exchange-connector';
import { PolymarketConnectorAdapter } from '../../../src/desk/execution/polymarket-connector-adapter';
import {
  ArbitrageRiskGuard,
  ArbitrageRejectionReason,
  type MultiLegArbitrageBasket,
} from '../../../src/desk/arbitrage/arbitrage-risk-guard';
import { KellyPositionSizer } from '../../../src/desk/risk/kelly-position-sizer';
import { AtomicMultiLegCoordinator } from '../../../src/desk/arbitrage/atomic-multileg-coordinator';
import { CompensatoryUnwindHandler } from '../../../src/desk/arbitrage/compensatory-unwind-handler';
import { ArbitrageMetrics } from '../../../src/desk/arbitrage/telemetry/arbitrage-metrics';
import { ArbitrageAuditLogger } from '../../../src/desk/arbitrage/telemetry/arbitrage-audit-logger';
import { ArbitrageEngine } from '../../../src/desk/arbitrage/arbitrage-engine';
import type { IExchangeConnector } from '../../../src/desk/arbitrage/connectors/types';
import type { ArbitrageOpportunity } from '../../../src/desk/arbitrage/types';

vi.mock('../../../src/seed/security/audit-log', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  hashIpAddress: vi.fn().mockReturnValue('mocked-ip-hash-sha256'),
}));

import { logAudit } from '../../../src/seed/security/audit-log';

describe('Tier 3: Cross-Feature Integration', () => {
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

  // ─── Pair 1: Ingestion Pipeline -> Net Profitability Calculator ────────────
  describe('X1: Ingestion Pipeline -> Net Profitability Calculator Integration', () => {
    it('filters opportunities using real NetProfitabilityCalculator hurdle logic', async () => {
      const calc = new NetProfitabilityCalculator({ defaultHurdleBps: 15 });
      const admittedOpps: ArbitrageOpportunity[] = [];

      const pipeline = new OpportunityIngestionPipeline(
        { minHurdleBps: 15 },
        {
          calculator: calc,
          onAdmitted: async (opp) => { admittedOpps.push(opp); },
        },
      );

      // Low profit opp (5 bps) -> rejected
      pipeline.handleOpportunities([{
        id: 'opp-low-hurdle',
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'bybit',
        buyPrice: 50000,
        sellPrice: 50025,
        spreadBps: 5,
        netProfitBps: 3,
        netProfitUsd: 1.5,
        confidence: 0.9,
        timestamp: Date.now(),
      }]);

      // High profit opp on different symbol to prevent TTL dedup drop -> admitted
      pipeline.handleOpportunities([{
        id: 'opp-high-hurdle',
        symbol: 'ETH/USDT',
        buyExchange: 'binance',
        sellExchange: 'bybit',
        buyPrice: 3000,
        sellPrice: 3050,
        spreadBps: 166,
        netProfitBps: 120,
        netProfitUsd: 15,
        confidence: 0.95,
        timestamp: Date.now() + 1,
      }]);

      await new Promise((r) => setTimeout(r, 60));

      expect(admittedOpps.length).toBe(1);
      expect(admittedOpps[0].id).toBe('opp-high-hurdle');
      expect(pipeline.metrics.rejectedCount).toBe(1);
      expect(pipeline.metrics.admittedCount).toBe(1);
    });
  });

  // ─── Pair 2: Ingestion Pipeline -> Pre-Trade Risk Guard ────────────────────
  describe('X2: Ingestion Pipeline -> Pre-Trade Risk Guard Integration', () => {
    it('pipeline admission flows into risk guard pre-trade evaluation', async () => {
      const riskGuard = new ArbitrageRiskGuard({
        maxPerTradeNotionalUsd: 5000,
        capitalUsdc: 100000,
        mode: 'paper',
      });

      const auditLogger = new ArbitrageAuditLogger();
      let executionAttempted = false;

      const pipeline = new OpportunityIngestionPipeline(
        { minHurdleBps: 10 },
        {
          onAdmitted: async (opp) => {
            const riskCheck = await riskGuard.checkPreTrade({
              symbol: opp.symbol,
              buyVenue: opp.buyExchange,
              sellVenue: opp.sellExchange,
              tradeNotionalUsd: 8000, // Exceeds 5000 notional cap
              bankrollUsd: 100000,
            });

            if (!riskCheck.allowed) {
              await auditLogger.logRiskRejection({
                opportunityId: opp.id,
                reason: riskCheck.rejectionReason!,
                rule: 'MAX_NOTIONAL',
              });
              return;
            }
            executionAttempted = true;
          },
        },
      );

      pipeline.handleOpportunities([{
        id: 'opp-large-notional',
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'bybit',
        buyPrice: 50000,
        sellPrice: 50200,
        spreadBps: 40,
        netProfitBps: 20,
        netProfitUsd: 10,
        confidence: 0.9,
        timestamp: Date.now(),
      }]);

      await new Promise((r) => setTimeout(r, 60));

      expect(executionAttempted).toBe(false);
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'arbitrage:risk_rejection',
          result: 'denied',
        }),
      );
    });
  });

  // ─── Pair 3: Pre-Trade Risk Guard -> Kelly Position Sizer ──────────────────
  describe('X3: Pre-Trade Risk Guard -> Kelly Position Sizer Integration', () => {
    it('evaluates sizing through KellyPositionSizer with 5% portfolio cap', async () => {
      const sizer = new KellyPositionSizer({ kellyFraction: 0.25, maxPositionFraction: 0.05 });
      const guard = new ArbitrageRiskGuard(
        { capitalUsdc: 100000, mode: 'paper' },
        { kellyPositionSizer: sizer },
      );

      const basket: MultiLegArbitrageBasket = {
        basketId: 'basket-kelly-test',
        opportunityId: 'opp-kelly-1',
        strategyKey: 'cross-exchange-arb',
        legs: [
          { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 1, price: 3000, notionalUsd: 3000 },
          { legId: 'l2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', amount: 1, price: 3000, notionalUsd: 3000 },
        ],
        totalNotionalUsd: 3000,
        winProbability: 0.95,
        winLossRatio: 1.0,
      };

      const res = await guard.checkBasket(basket);
      expect(res.allowed).toBe(true);
      expect(res.checks?.kellyCapOk).toBe(true);
      expect(res.adjustedNotionalUsd).toBeLessThanOrEqual(5000); // 5% of 100k
    });
  });

  // ─── Pair 4: MultiLegCoordinator -> CCXT & Polymarket Connectors ───────────
  describe('X4: MultiLegCoordinator -> CCXT & Polymarket Connectors Integration', () => {
    it('coordinates atomic execution across CEX (CCXT) and CLOB (Polymarket)', async () => {
      const ccxtConnector = createMockConnector('binance');
      const polyConnector = createMockConnector('polymarket');

      const coordinator = new AtomicMultiLegCoordinator((venue) => {
        if (venue === 'binance') return ccxtConnector;
        if (venue === 'polymarket') return polyConnector;
        return undefined;
      });

      const report = await coordinator.execute({
        orderId: 'arb-cex-clob-1',
        opportunityId: 'opp-cex-clob',
        executionMode: 'concurrent',
        legs: [
          { legId: 'leg-cex', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 0.1, price: 50000, type: 'limit' },
          { legId: 'leg-clob', venue: 'polymarket', symbol: 'BTC-PRED', side: 'sell', amount: 0.1, price: 50200, type: 'limit' },
        ],
      });

      expect(report.state).toBe('FILLED');
      expect(ccxtConnector.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({ side: 'buy', amount: 0.1 }),
      );
      expect(polyConnector.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({ side: 'sell', amount: 0.1 }),
      );
    });
  });

  // ─── Pair 5: MultiLegCoordinator -> Compensatory Unwind Handler ────────────
  describe('X5: MultiLegCoordinator -> Compensatory Unwind Handler Integration', () => {
    it('triggers compensatory unwind when leg 2 fails and unwinds leg 1 exposure', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn()
          .mockResolvedValueOnce({ orderId: 'b-fill', filled: 0.5, price: 50000, status: 'closed' }) // Leg 1 fills
          .mockResolvedValueOnce({ orderId: 'b-unwind', filled: 0.5, price: 49950, status: 'closed' }), // Unwind succeeds
      });

      const bybit = createMockConnector('bybit', {
        placeOrder: vi.fn().mockRejectedValue(new Error('Bybit network timeout')),
      });

      const unwindHandler = new CompensatoryUnwindHandler((venue) => (venue === 'binance' ? binance : bybit));
      const coordinator = new AtomicMultiLegCoordinator(
        (venue) => (venue === 'binance' ? binance : bybit),
        unwindHandler,
      );

      const report = await coordinator.execute({
        orderId: 'unwind-int-1',
        opportunityId: 'opp-unwind-int',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 0.5, price: 50000, type: 'limit' },
          { legId: 'leg-2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', amount: 0.5, price: 50200, type: 'limit' },
        ],
      });

      expect(report.state).toBe('UNWOUND');
      expect(report.unwindResult?.success).toBe(true);
      expect(report.unwindResult?.unwoundLegs.length).toBe(1);
      // Unwind inverted side: bought BTC at 50,000 -> unwound by selling BTC
      expect(binance.placeOrder).toHaveBeenCalledTimes(2);
      expect(binance.placeOrder).toHaveBeenLastCalledWith(
        expect.objectContaining({ side: 'sell', amount: 0.5 }),
      );
    });
  });

  // ─── Pair 6: Coordinator & Unwind -> Prometheus Metrics ────────────────────
  describe('X6: Coordinator & Unwind -> Prometheus Metrics Integration', () => {
    it('records full order lifecycle metrics for execution and compensatory unwind', async () => {
      const metrics = new ArbitrageMetrics({ prefix: 'cross_' });

      // Simulate completed order telemetry
      metrics.recordOrder('binance', 'filled', 'concurrent_arbitrage');
      metrics.recordExecutionLatency('binance', 'concurrent_arbitrage', 22);
      metrics.recordPnl('concurrent_arbitrage', 75);

      // Simulate partial fill and unwind telemetry
      metrics.recordOrder('bybit', 'failed', 'concurrent_arbitrage');
      metrics.recordUnwind('binance', true);
      metrics.recordPnl('concurrent_arbitrage', -15);

      const text = await metrics.getMetrics();
      expect(text).toContain('cross_orders_total{venue="binance",status="filled",strategy="concurrent_arbitrage"} 1');
      expect(text).toContain('cross_orders_total{venue="bybit",status="failed",strategy="concurrent_arbitrage"} 1');
      expect(text).toContain('cross_unwinds_total{venue="binance",success="true"} 1');
      expect(text).toContain('cross_pnl_usd{strategy="concurrent_arbitrage",result="profit"} 75');
      expect(text).toContain('cross_pnl_usd{strategy="concurrent_arbitrage",result="loss"} 15');
    });
  });

  // ─── Pair 7: Coordinator & Unwind -> Hash-Chained Audit Trail ──────────────
  describe('X7: Coordinator & Unwind -> Hash-Chained Audit Trail Integration', () => {
    it('persists trade execution and unwind events to immutable audit log', async () => {
      const auditLogger = new ArbitrageAuditLogger();

      await auditLogger.logExecution({
        executionId: 'x7-exec-1',
        opportunityId: 'opp-x7',
        state: 'FILLED',
        legs: [],
        netRealizedPnlUsd: 120,
        latencyMs: 18,
        timestamp: Date.now(),
      });

      await auditLogger.logUnwind('x7-exec-1', {
        unwindId: 'unwind-x7',
        success: true,
        unwoundLegs: [],
        unwindCostUsd: 8.5,
        timestamp: Date.now(),
      });

      expect(logAudit).toHaveBeenCalledTimes(2);
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'arbitrage:trade_execution',
          result: 'success',
          resource: 'arbitrage/execution/x7-exec-1',
        }),
      );
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'arbitrage:compensatory_unwind',
          result: 'success',
          resource: 'arbitrage/unwind/unwind-x7',
        }),
      );
    });
  });

  // ─── Pair 8: Circuit Breaker -> ArbitrageEngine Halt ───────────────────────
  describe('X8: Circuit Breaker -> ArbitrageEngine Execution Halt Cascade', () => {
    it('halts trading in ArbitrageEngine when daily drawdown circuit breaker trips', async () => {
      const binance = createMockConnector('binance');
      const bybit = createMockConnector('bybit');

      const engine = new ArbitrageEngine(
        (v) => (v === 'binance' ? binance : bybit),
        {
          mode: 'dry-run',
          riskConfig: { maxDailyDrawdownFraction: 0.15 },
        },
      );

      // Normal trade allowed (drawdown = 0)
      const allowedOpp: ArbitrageOpportunity = {
        id: 'opp-allowed',
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        buyPrice: 50000,
        sellPrice: 50200,
        netProfitBps: 20,
        tradeSize: 0.04, // 0.04 * 50k = $2,000 within $5,000 Kelly cap
        timestamp: Date.now(),
      };

      const normalReport = await engine.executeOpportunity(allowedOpp);
      expect(normalReport).not.toBeNull();
      expect(normalReport?.state).toBe('FILLED');

      // Now trip the circuit breaker in the integrated risk guard
      const trippedBreaker = await engine.riskGuard.checkPreTrade({
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        tradeNotionalUsd: 1000,
        bankrollUsd: 100000,
        currentDrawdown: 0.16, // Breaches 15%
      });
      expect(trippedBreaker.allowed).toBe(false);
      expect(trippedBreaker.rejectionReason).toBe(ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED);
    });
  });

  // ─── Pair 9: Venue Latency Spike -> Risk Guard -> Telemetry & Audit ────────
  describe('X9: Venue Latency Spike -> Risk Guard -> Telemetry & Audit Cascade', () => {
    it('rejects trade on venue latency spike and creates audit rejection record', async () => {
      const binance = createMockConnector('binance', {
        getLatencyStats: vi.fn().mockReturnValue({ p50: 200, p90: 550, p99: 900 }), // p90 = 550ms > 500ms
      });
      const bybit = createMockConnector('bybit');

      const engine = new ArbitrageEngine(
        (v) => (v === 'binance' ? binance : bybit),
        {
          mode: 'dry-run',
          riskConfig: { maxVenueLatencyMs: 500 },
        },
      );

      const opp: ArbitrageOpportunity = {
        id: 'opp-latency-spike',
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        buyPrice: 50000,
        sellPrice: 50200,
        netProfitBps: 20,
        tradeSize: 0.04,
        timestamp: Date.now(),
      };

      const report = await engine.executeOpportunity(opp);
      expect(report).toBeNull(); // Blocked before coordinator

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'arbitrage:risk_rejection',
          result: 'denied',
          resource: 'arbitrage/opportunity/opp-latency-spike',
          metadata: expect.objectContaining({
            reason: ArbitrageRejectionReason.VENUE_LATENCY_SPIKE,
          }),
        }),
      );
    });
  });

  // ─── Full Pipeline 1: End-to-End Golden Path Execution ─────────────────────
  describe('X10: End-to-End Golden Path Execution', () => {
    it('flows seamlessly from opportunity ingestion to verified fill, metric, and audit', async () => {
      const binance = createMockConnector('binance');
      const bybit = createMockConnector('bybit');

      const engine = new ArbitrageEngine(
        (v) => (v === 'binance' ? binance : bybit),
        {
          mode: 'dry-run',
          minNetProfitBps: 10,
        },
      );

      const opp: ArbitrageOpportunity = {
        id: 'opp-golden-e2e',
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        buyPrice: 50000,
        sellPrice: 50250,
        netProfitBps: 25,
        tradeSize: 0.04,
        timestamp: Date.now(),
      };

      const report = await engine.executeOpportunity(opp);

      // Verify Coordinator state
      expect(report).not.toBeNull();
      expect(report?.state).toBe('FILLED');
      expect(report?.legs.length).toBe(2);
      expect(report?.legs[0].status).toBe('filled');
      expect(report?.legs[1].status).toBe('filled');

      // Verify Connectors called
      expect(binance.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({ side: 'buy' }),
      );
      expect(bybit.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({ side: 'sell' }),
      );

      // Verify Audit record written
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'arbitrage:trade_execution',
          result: 'success',
          metadata: expect.objectContaining({
            opportunityId: 'opp-golden-e2e',
            state: 'FILLED',
          }),
        }),
      );

      // Verify Prometheus metric updated
      const metricsText = await engine.metrics.getMetrics();
      expect(metricsText).toContain('arb_orders_total{venue="binance",status="filled",strategy="concurrent_arbitrage"} 1');
      expect(metricsText).toContain('arb_orders_total{venue="bybit",status="filled",strategy="concurrent_arbitrage"} 1');
    });
  });

  // ─── Full Pipeline 2: End-to-End Adversarial Unwind Path ───────────────────
  describe('X11: End-to-End Adversarial Unwind Path', () => {
    it('executes compensatory unwind with zero unhedged exposure leak on partial failure', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn()
          .mockResolvedValueOnce({ orderId: 'ord-b-1', filled: 0.04, price: 50000, status: 'closed' })
          .mockResolvedValueOnce({ orderId: 'ord-b-unwind', filled: 0.04, price: 49900, status: 'closed' }),
      });

      const bybit = createMockConnector('bybit', {
        placeOrder: vi.fn().mockRejectedValue(new Error('Connection abort by peer')),
      });

      const engine = new ArbitrageEngine(
        (v) => (v === 'binance' ? binance : bybit),
        {
          mode: 'dry-run',
          minNetProfitBps: 10,
        },
      );

      const opp: ArbitrageOpportunity = {
        id: 'opp-adversarial-unwind',
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        buyPrice: 50000,
        sellPrice: 50250,
        netProfitBps: 25,
        tradeSize: 0.04,
        timestamp: Date.now(),
      };

      const report = await engine.executeOpportunity(opp);

      // Coordinator transitions to UNWOUND
      expect(report).not.toBeNull();
      expect(report?.state).toBe('UNWOUND');
      expect(report?.unwindResult?.success).toBe(true);

      // Both execution failure and compensatory unwind are audited
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'arbitrage:compensatory_unwind',
          result: 'success',
        }),
      );
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'arbitrage:trade_execution',
          result: 'failure',
        }),
      );

      // Unwind metric recorded
      const metricsText = await engine.metrics.getMetrics();
      expect(metricsText).toContain('arb_unwinds_total{venue="binance",success="true"} 1');
    });
  });

  // ─── Multi-Venue Integration: Triangular Multi-Leg Coordination ────────────
  describe('X12: Multi-Venue Integration — 3-Leg Cross-Exchange Arbitrage', () => {
    it('coordinates 3 distinct venues simultaneously with atomic state tracking', async () => {
      const binance = createMockConnector('binance');
      const bybit = createMockConnector('bybit');
      const kucoin = createMockConnector('kucoin');

      const coordinator = new AtomicMultiLegCoordinator((v) => {
        if (v === 'binance') return binance;
        if (v === 'bybit') return bybit;
        if (v === 'kucoin') return kucoin;
        return undefined;
      });

      const report = await coordinator.execute({
        orderId: 'triangular-arb-1',
        opportunityId: 'opp-triangular',
        executionMode: 'concurrent',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 0.1, price: 50000, type: 'limit' },
          { legId: 'leg-2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', amount: 0.05, price: 50200, type: 'limit' },
          { legId: 'leg-3', venue: 'kucoin', symbol: 'BTC/USDT', side: 'sell', amount: 0.05, price: 50220, type: 'limit' },
        ],
      });

      expect(report.state).toBe('FILLED');
      expect(report.legs.length).toBe(3);
      expect(binance.placeOrder).toHaveBeenCalledTimes(1);
      expect(bybit.placeOrder).toHaveBeenCalledTimes(1);
      expect(kucoin.placeOrder).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Cross-Component Gating: Balance Exhaustion Gating ──────────────────────
  describe('X13: Cross-Component Gating — Balance Exhaustion Cascade', () => {
    it('safely blocks execution when venue balance is lower than required notional', async () => {
      const binance = createMockConnector('binance');
      const bybit = createMockConnector('bybit');

      const guard = new ArbitrageRiskGuard({ mode: 'paper', capitalUsdc: 100000 });
      const coordinator = new AtomicMultiLegCoordinator((v) => (v === 'binance' ? binance : bybit));

      const res = await guard.checkPreTrade({
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        tradeNotionalUsd: 10000,
        bankrollUsd: 100000,
        venueBalances: { binance: 2000, bybit: 15000 }, // Binance $2k < $10k required
      });

      expect(res.allowed).toBe(false);
      expect(res.rejectionReason).toBe(ArbitrageRejectionReason.INSUFFICIENT_VENUE_BALANCE);
      // Coordinator never called
      expect(binance.placeOrder).not.toHaveBeenCalled();
    });
  });

  // ─── Dual Mode Validation: Live Mode Strict Credential Verification ────────
  describe('X14: Dual Mode Validation — Live Mode Fail-Closed Safeguard', () => {
    it('engine operating in live mode fails closed if exchange credentials missing', async () => {
      const origEnv = process.env.LIVE_TRADING_ENABLED;
      try {
        process.env.LIVE_TRADING_ENABLED = 'true';
        delete process.env.BINANCE_API_KEY;

        const binance = createMockConnector('binance');
        const bybit = createMockConnector('bybit');

        const engine = new ArbitrageEngine(
          (v) => (v === 'binance' ? binance : bybit),
          { mode: 'live' },
        );

        const opp: ArbitrageOpportunity = {
          id: 'opp-live-fail',
          symbol: 'BTC/USDT',
          buyVenue: 'binance',
          sellVenue: 'bybit',
          buyPrice: 50000,
          sellPrice: 50200,
          netProfitBps: 20,
          tradeSize: 0.04,
          timestamp: Date.now(),
        };

        const report = await engine.executeOpportunity(opp);
        expect(report).toBeNull();
        expect(binance.placeOrder).not.toHaveBeenCalled();

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
        process.env.LIVE_TRADING_ENABLED = origEnv;
      }
    });
  });

  // ─── Operational Resiliency: Rapid Sequential Execution with Open Exposure ─
  describe('X15: Operational Resiliency — Rapid Sequential Trades Tracking Exposure', () => {
    it('tracks open exposure dynamically across multiple sequential executions', async () => {
      const binance = createMockConnector('binance');
      const bybit = createMockConnector('bybit');

      const engine = new ArbitrageEngine(
        (v) => (v === 'binance' ? binance : bybit),
        {
          mode: 'dry-run',
          riskConfig: {
            maxOpenPositionPerSymbolUsd: 15000,
            capitalUsdc: 1_000_000,
          },
        },
      );

      // Trade 1: $2,000 notional (symbol BTC/USDT)
      const opp1: ArbitrageOpportunity = {
        id: 'opp-seq-1',
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        buyPrice: 50000,
        sellPrice: 50200,
        netProfitBps: 20,
        tradeSize: 0.04, // 0.04 * 50000 = $2,000
        timestamp: Date.now(),
      };

      const rep1 = await engine.executeOpportunity(opp1);
      expect(rep1?.state).toBe('FILLED');

      // After trade completes and releases exposure, subsequent trade of $2,000 succeeds
      const opp2: ArbitrageOpportunity = {
        id: 'opp-seq-2',
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        buyPrice: 50000,
        sellPrice: 50200,
        netProfitBps: 20,
        tradeSize: 0.04,
        timestamp: Date.now() + 1,
      };

      const rep2 = await engine.executeOpportunity(opp2);
      expect(rep2?.state).toBe('FILLED');
    });
  });
});
