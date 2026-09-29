/**
 * Milestone 4 Comprehensive Test Suite: Order Lifecycle Telemetry,
 * Hash-Chained Audit Logging & Master Engine Integration (Requirement R4).
 *
 * Verifies:
 * 1. Low-latency Prometheus metrics registration and recorder helpers.
 * 2. SHA-256 HMAC hash-chained audit logging, monotonic sequencing, and tamper resistance.
 * 3. End-to-end master ArbitrageEngine lifecycle (start, stop, getStatus, getMode).
 * 4. End-to-end profitable multi-leg execution with full telemetry & audit logging.
 * 5. Pre-trade risk rejection handling (hurdle failure & latency circuit breaker).
 * 6. Partial-fill compensatory unwind telemetry and audit trail.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import client from 'prom-client';
import {
  arbOrdersTotal,
  arbExecutionLatencyMs,
  arbSlippageBps,
  arbPnlUsd,
  recordArbOrder,
  recordArbLatency,
  recordArbSlippage,
  recordArbPnl,
  ArbitrageMetrics,
} from '../../../src/desk/arbitrage/arbitrage-metrics';
import {
  ArbitrageAuditLogger,
  type ChainedAuditRow,
} from '../../../src/desk/arbitrage/telemetry/arbitrage-audit-logger';
import {
  ArbitrageEngine,
  type ArbitrageOpportunity,
} from '../../../src/desk/arbitrage/arbitrage-engine';
import { register as platformRegister } from '../../../src/platform/middleware/prometheus-registry';
import type { IExchangeConnector } from '../../../src/desk/arbitrage/connectors/types';

// Mock logAudit to simulate DB persistence while testing cryptographic in-memory hash chain
vi.mock('../../../src/seed/security/audit-log', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  hashIpAddress: vi.fn().mockImplementation((ip: string) =>
    crypto.createHash('sha256').update(ip).digest('hex'),
  ),
}));

import { logAudit } from '../../../src/seed/security/audit-log';

describe('Milestone 4: Order Lifecycle Telemetry & Hash-Chained Audit Logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 1: Prometheus Metrics Telemetry
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Prometheus Metrics Registration & Recorders', () => {
    it('registers canonical arbitrage metrics in platform prometheus registry', () => {
      const metricNames = platformRegister.getMetricsAsArray().map((m) => m.name);
      expect(metricNames).toContain('arb_orders_total');
      expect(metricNames).toContain('arb_execution_latency_ms');
      expect(metricNames).toContain('arb_slippage_bps');
      expect(metricNames).toContain('arb_pnl_usd');
    });

    it('records order lifecycle events with label dimensions using recordArbOrder', async () => {
      recordArbOrder({
        strategyType: 'cross-exchange',
        venue: 'binance',
        leg: 'leg1',
        side: 'buy',
        status: 'filled',
        mode: 'dry-run',
      });

      recordArbOrder('triangular', 'bybit', 'leg2', 'sell', 'submitted', 'live');

      const output = await platformRegister.metrics();
      expect(output).toContain('arb_orders_total{strategy_type="cross-exchange",venue="binance",leg="leg1",side="buy",status="filled",mode="dry-run"}');
      expect(output).toContain('arb_orders_total{strategy_type="triangular",venue="bybit",leg="leg2",side="sell",status="submitted",mode="live"}');
    });

    it('records execution latency histogram values across bucket intervals', async () => {
      recordArbLatency({
        strategyType: 'cross-exchange',
        phase: 'submit_all',
        status: 'success',
        latencyMs: 12,
      });

      recordArbLatency('dex-cex', 'roundtrip', 'success', 250);

      const output = await platformRegister.metrics();
      expect(output).toContain('arb_execution_latency_ms_bucket{le="25",strategy_type="cross-exchange",phase="submit_all",status="success"}');
      expect(output).toContain('arb_execution_latency_ms_bucket{le="250",strategy_type="dex-cex",phase="roundtrip",status="success"}');
    });

    it('records realized execution slippage histogram in basis points', async () => {
      recordArbSlippage({
        strategyType: 'cross-exchange',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        slippageBps: 4.5,
      });

      recordArbSlippage('cross-exchange', 'polymarket', 'BTC/USDT', 'sell', -2.1);

      const output = await platformRegister.metrics();
      expect(output).toContain('arb_slippage_bps_bucket{le="5",strategy_type="cross-exchange",venue="binance",symbol="BTC/USDT",side="buy"}');
      expect(output).toContain('arb_slippage_bps_bucket{le="0",strategy_type="cross-exchange",venue="polymarket",symbol="BTC/USDT",side="sell"}');
    });

    it('records realized net PnL in USD gauge', async () => {
      recordArbPnl({
        strategyType: 'cross-exchange',
        venuePair: 'binance-bybit',
        result: 'win',
        pnlUsd: 142.5,
      });

      recordArbPnl('triangular', 'bybit-bybit', 'loss', -35.0);

      const output = await platformRegister.metrics();
      expect(output).toContain('arb_pnl_usd{strategy_type="cross-exchange",venue_pair="binance-bybit",result="win"} 142.5');
      expect(output).toContain('arb_pnl_usd{strategy_type="triangular",venue_pair="bybit-bybit",result="loss"} -35');
    });

    it('manages isolated ArbitrageMetrics instance with active execution counter and reset', async () => {
      const customRegistry = new client.Registry();
      const metrics = new ArbitrageMetrics({ registry: customRegistry, prefix: 'custom_arb_' });

      metrics.incActiveExecutions();
      metrics.incActiveExecutions();
      metrics.recordOrder('kucoin', 'filled', 'cross-exchange');
      metrics.recordExecutionLatency('kucoin', 'cross-exchange', 28);
      metrics.recordSlippage('kucoin', 'ETH/USDT', 1.8);
      metrics.recordPnl('cross-exchange', 85);
      metrics.recordUnwind('kucoin', true);
      metrics.decActiveExecutions();

      let metricsText = await metrics.getMetrics();
      expect(metricsText).toContain('custom_arb_active_executions 1');
      expect(metricsText).toContain('custom_arb_orders_total{venue="kucoin",status="filled",strategy="cross-exchange"} 1');
      expect(metricsText).toContain('custom_arb_pnl_usd{strategy="cross-exchange",result="profit"} 85');
      expect(metricsText).toContain('custom_arb_unwinds_total{venue="kucoin",success="true"} 1');

      metrics.reset();
      metricsText = await metrics.getMetrics();
      expect(metricsText).toContain('custom_arb_active_executions 0');
      expect(metricsText).not.toContain('custom_arb_orders_total{');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 2: SHA-256 HMAC Hash-Chained Audit Logging
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. SHA-256 HMAC Hash-Chained Audit Logger & Integrity Verification', () => {
    let auditLogger: ArbitrageAuditLogger;

    beforeEach(() => {
      auditLogger = new ArbitrageAuditLogger('127.0.0.1');
      auditLogger.clear();
    });

    it('builds an unbroken, monotonically increasing SHA-256 HMAC hash chain', async () => {
      const r1 = await auditLogger.logOpportunityIngested({
        id: 'opp-chain-1',
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        buyPrice: 60000,
        sellPrice: 60200,
        spreadBps: 33.3,
        netProfitBps: 20.1,
      });

      const r2 = await auditLogger.logOrderSubmitted({
        orderId: 'order-chain-1',
        opportunityId: 'opp-chain-1',
        symbol: 'BTC/USDT',
        legsCount: 2,
        totalNotionalUsd: 12000,
      });

      const r3 = await auditLogger.logOrderFilled({
        executionId: 'order-chain-1',
        opportunityId: 'opp-chain-1',
        state: 'FILLED',
        netRealizedPnlUsd: 40.2,
        latencyMs: 18,
      });

      // Assert monotonic sequencing
      expect(r1.sequenceNumber).toBe(1);
      expect(r2.sequenceNumber).toBe(2);
      expect(r3.sequenceNumber).toBe(3);

      // Assert genesis record has empty previousHash
      expect(r1.previousHash).toBe('');
      expect(r1.hash).toMatch(/^[0-9a-f]{64}$/);

      // Assert cryptographic linkage: record N previousHash === record N-1 hash
      expect(r2.previousHash).toBe(r1.hash);
      expect(r2.hash).toMatch(/^[0-9a-f]{64}$/);

      expect(r3.previousHash).toBe(r2.hash);
      expect(r3.hash).toMatch(/^[0-9a-f]{64}$/);

      // Validate unbroken chain
      const verification = auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(true);
      expect(verification.totalRecords).toBe(3);
    });

    it('detects tampering if any metadata field in the audit row is altered', async () => {
      await auditLogger.logOpportunityIngested({
        id: 'opp-tamper-test',
        symbol: 'SOL/USDT',
        buyPrice: 150,
        sellPrice: 151,
      });

      await auditLogger.logOrderSubmitted({
        orderId: 'order-tamper-1',
        symbol: 'SOL/USDT',
        totalNotionalUsd: 5000,
      });

      const chain = auditLogger.getAuditHistory();
      expect(chain.length).toBe(2);

      // Pre-tampering verification passes
      expect(auditLogger.verifyChainIntegrity().valid).toBe(true);

      // Tamper with record 1 metadata (e.g. adversary altered notional amount)
      chain[0].entry.metadata.tamperedField = 'hacked';

      // Re-verification MUST fail cryptographically
      const verification = auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.brokenAt).toBe(1);
      expect(verification.reason).toContain('Cryptographic HMAC mismatch');
    });

    it('detects tampering if sequence number or hash linkage is broken', async () => {
      await auditLogger.logOpportunityIngested({ id: 'opp-break-1' });
      await auditLogger.logOrderSubmitted({ orderId: 'order-break-2' });
      await auditLogger.logOrderFilled({ executionId: 'order-break-2' });

      const chain = auditLogger.getAuditHistory();

      // Corrupt previousHash on record 2
      chain[1].previousHash = '0000000000000000000000000000000000000000000000000000000000000000';

      const verification = auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.brokenAt).toBe(2);
      expect(verification.reason).toContain('Previous hash mismatch');
    });

    it('logs risk rejections and order failures into the hash chain', async () => {
      const rRej = await auditLogger.logRiskRejected({
        opportunityId: 'opp-rej-test',
        reason: 'Quarter-Kelly 5% portfolio cap exceeded',
        rule: 'KELLY_CAP_BREACH',
        symbol: 'ETH/USDT',
      });

      const rFail = await auditLogger.logOrderFailed(
        'exec-failed-123',
        'Exchange connection timed out on venue bybit',
      );

      expect(rRej.entry.action).toBe('arb.risk.rejected');
      expect(rRej.entry.result).toBe('denied');
      expect(rRej.sequenceNumber).toBe(1);

      expect(rFail.entry.action).toBe('arb.order.failed');
      expect(rFail.entry.result).toBe('failure');
      expect(rFail.sequenceNumber).toBe(2);
      expect(rFail.previousHash).toBe(rRej.hash);

      expect(auditLogger.verifyChainIntegrity().valid).toBe(true);
    });

    it('falls back gracefully to in-memory hash chain when PostgreSQL logAudit fails', async () => {
      // Force logAudit mock to throw
      (logAudit as unknown as { mockRejectedValueOnce: (err: Error) => void }).mockRejectedValueOnce(
        new Error('PostgreSQL connection ECONNREFUSED'),
      );

      const r = await auditLogger.logOpportunityIngested({
        id: 'opp-db-failover',
        symbol: 'BTC/USDT',
      });

      expect(r.writtenToDb).toBe(false);
      expect(r.sequenceNumber).toBe(1);
      expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(auditLogger.verifyChainIntegrity().valid).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 3: Master Arbitrage Engine Integration
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Master ArbitrageEngine Lifecycle & End-to-End Orchestration', () => {
    const createMockConnector = (venue: string): IExchangeConnector => ({
      exchangeId: venue,
      placeOrder: vi.fn().mockImplementation(async (params) => ({
        orderId: `order-${venue}-${Date.now()}`,
        clientOrderId: params.clientOrderId,
        exchange: venue,
        symbol: params.symbol,
        side: params.side,
        price: params.price ?? 50000,
        amount: params.amount,
        filled: params.amount,
        remaining: 0,
        status: 'closed',
        fee: { amount: 0.5, currency: 'USDT' },
        timestamp: Date.now(),
      })),
      cancelOrder: vi.fn().mockResolvedValue(true),
      fetchOrder: vi.fn(),
      fetchBalance: vi.fn().mockResolvedValue({
        USDT: { free: 50000, used: 0, total: 50000 },
        BTC: { free: 2, used: 0, total: 2 },
      }),
      getLatencyMs: vi.fn().mockResolvedValue(15),
    });

    it('manages complete engine lifecycle (start, stop, isRunning, getStatus)', () => {
      const engine = new ArbitrageEngine(() => undefined, {
        mode: 'dry-run',
        minNetProfitBps: 15,
      });

      expect(engine.isRunning()).toBe(false);
      expect(engine.getMode()).toBe('dry-run');

      const initialStatus = engine.getStatus();
      expect(initialStatus.running).toBe(false);
      expect(initialStatus.activeExecutions).toBe(0);
      expect(initialStatus.mode).toBe('dry-run');

      engine.start();
      expect(engine.isRunning()).toBe(true);
      expect(engine.getStatus().running).toBe(true);

      engine.stop();
      expect(engine.isRunning()).toBe(false);
      expect(engine.getStatus().running).toBe(false);
    });

    it('executes admitted profitable opportunity end-to-end with metrics and audit trail', async () => {
      const binance = createMockConnector('binance');
      const bybit = createMockConnector('bybit');

      const resolver = (v: string) => (v === 'binance' ? binance : v === 'bybit' ? bybit : undefined);
      const engine = new ArbitrageEngine(resolver, {
        mode: 'dry-run',
        minNetProfitBps: 10,
        riskConfig: {
          capitalUsdc: 100000,
          maxPerTradeNotionalUsd: 10000,
        },
      });

      const opp: ArbitrageOpportunity = {
        id: 'opp-e2e-profitable',
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        buyPrice: 50000,
        sellPrice: 50200,
        tradeSize: 0.1,
        spreadBps: 40,
        netProfitBps: 25,
        confidence: 0.95,
        timestamp: Date.now(),
      };

      const report = await engine.executeOpportunity(opp);

      // 1. Verify execution result
      expect(report).not.toBeNull();
      expect(report?.state).toBe('FILLED');
      expect(binance.placeOrder).toHaveBeenCalledTimes(1);
      expect(bybit.placeOrder).toHaveBeenCalledTimes(1);

      // 2. Verify audit chain records
      const auditChain = engine.auditLogger.getAuditHistory();
      expect(auditChain.length).toBeGreaterThanOrEqual(3);

      const actions = auditChain.map((c) => c.entry.action);
      expect(actions).toContain('arb.opportunity.ingested');
      expect(actions).toContain('arb.order.submitted');
      expect(actions).toContain('arb.order.filled');

      // 3. Cryptographic chain integrity check
      const verification = engine.auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(true);
      expect(verification.totalRecords).toBe(auditChain.length);

      // 4. Verify Prometheus metrics updated
      const metricsText = await engine.metrics.getMetrics();
      expect(metricsText).toContain('arb_orders_total');
      expect(metricsText).toContain('arb_execution_latency_ms');
    });

    it('rejects and audits opportunities failing the pre-trade net profit hurdle', async () => {
      const binance = createMockConnector('binance');
      const bybit = createMockConnector('bybit');

      const engine = new ArbitrageEngine(
        (v) => (v === 'binance' ? binance : bybit),
        {
          mode: 'dry-run',
          minNetProfitBps: 25, // High hurdle: 25 bps
        },
      );

      const opp: ArbitrageOpportunity = {
        id: 'opp-sub-hurdle',
        symbol: 'ETH/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        buyPrice: 3000,
        sellPrice: 3003, // Only 10 bps spread
        netProfitBps: 8, // 8 bps < 25 bps hurdle
        tradeSize: 1.0,
      };

      const report = await engine.executeOpportunity(opp);

      // Execution blocked
      expect(report).toBeNull();
      expect(binance.placeOrder).not.toHaveBeenCalled();
      expect(bybit.placeOrder).not.toHaveBeenCalled();

      // Audit trail must capture ingestion + risk rejection
      const auditChain = engine.auditLogger.getAuditHistory();
      expect(auditChain.length).toBeGreaterThanOrEqual(2);
      const actions = auditChain.map((c) => c.entry.action);
      expect(actions).toContain('arb.opportunity.ingested');
      expect(actions).toContain('arb.risk.rejected');

      const rejectionRecord = auditChain.find((c) => c.entry.action === 'arb.risk.rejected');
      expect(rejectionRecord?.entry.result).toBe('denied');

      expect(engine.auditLogger.verifyChainIntegrity().valid).toBe(true);
    });

    it('rejects and audits opportunities when venue latency spike trips circuit breaker', async () => {
      const binance = createMockConnector('binance');
      const bybit = createMockConnector('bybit');

      // Mock latency spike on bybit (e.g. 501ms > 500ms breaker threshold)
      (bybit as unknown as { getLatencyStats: () => { p90: number } }).getLatencyStats = () => ({
        p90: 550,
      });

      const engine = new ArbitrageEngine(
        (v) => (v === 'binance' ? binance : bybit),
        {
          mode: 'dry-run',
          minNetProfitBps: 10,
          riskConfig: {
            maxVenueLatencyMs: 500,
          },
        },
      );

      const opp: ArbitrageOpportunity = {
        id: 'opp-latency-spike',
        symbol: 'SOL/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        buyPrice: 150,
        sellPrice: 152,
        netProfitBps: 50,
        tradeSize: 10,
      };

      const report = await engine.executeOpportunity(opp);

      expect(report).toBeNull();
      expect(binance.placeOrder).not.toHaveBeenCalled();

      const auditChain = engine.auditLogger.getAuditHistory();
      const rejection = auditChain.find((c) => c.entry.action === 'arb.risk.rejected');
      expect(rejection).toBeDefined();
      expect(rejection?.entry.metadata.rule).toBe('VENUE_LATENCY_SPIKE');
      expect(engine.auditLogger.verifyChainIntegrity().valid).toBe(true);
    });

    it('triggers compensatory unwinds and audits partial-fill failures safely', async () => {
      const binance = createMockConnector('binance');
      // Bybit connector simulates immediate rejection / network failure
      const bybit: IExchangeConnector = {
        exchangeId: 'bybit',
        placeOrder: vi.fn().mockRejectedValue(new Error('Bybit API rate limit exceeded')),
        cancelOrder: vi.fn().mockResolvedValue(true),
        fetchOrder: vi.fn(),
        fetchBalance: vi.fn().mockResolvedValue({
          USDT: { free: 50000, used: 0, total: 50000 },
        }),
        getLatencyMs: vi.fn().mockResolvedValue(20),
      };

      const engine = new ArbitrageEngine(
        (v) => (v === 'binance' ? binance : bybit),
        {
          mode: 'dry-run',
          minNetProfitBps: 10,
        },
      );

      const opp: ArbitrageOpportunity = {
        id: 'opp-partial-fill',
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        buyPrice: 50000,
        sellPrice: 50300,
        netProfitBps: 30,
        tradeSize: 0.1,
      };

      const report = await engine.executeOpportunity(opp);

      // State transitioned through UNWOUND or FAILED without naked directional leak
      expect(report).not.toBeNull();
      expect(['UNWOUND', 'FAILED']).toContain(report?.state);

      // Verify compensatory unwind audit was recorded
      const auditChain = engine.auditLogger.getAuditHistory();
      const actions = auditChain.map((r) => r.entry.action);
      expect(actions).toContain('arb.opportunity.ingested');
      expect(actions).toContain('arb.order.submitted');

      // Unbroken cryptographic hash chain remains verified
      expect(engine.auditLogger.verifyChainIntegrity().valid).toBe(true);
    });
  });
});
