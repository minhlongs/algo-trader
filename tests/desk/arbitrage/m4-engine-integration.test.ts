import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('Milestone 4: Telemetry, Audit Logging & ArbitrageEngine Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ArbitrageMetrics', () => {
    it('records orders, latency, slippage, pnl, and unwinds accurately', async () => {
      const metrics = new ArbitrageMetrics({ prefix: 'test_arb_' });

      metrics.recordOrder('binance', 'filled', 'concurrent_arbitrage');
      metrics.recordExecutionLatency('binance', 'concurrent_arbitrage', 45);
      metrics.recordSlippage('binance', 'BTC/USDT', 3);
      metrics.recordPnl('concurrent_arbitrage', 150);
      metrics.recordUnwind('polymarket', true);
      metrics.incActiveExecutions();
      metrics.decActiveExecutions();

      const output = await metrics.getMetrics();
      expect(output).toContain('test_arb_orders_total{venue="binance",status="filled",strategy="concurrent_arbitrage"} 1');
      expect(output).toContain('test_arb_pnl_usd{strategy="concurrent_arbitrage",result="profit"} 150');
      expect(output).toContain('test_arb_unwinds_total{venue="polymarket",success="true"} 1');
    });

    it('resets metrics when clear is invoked', async () => {
      const metrics = new ArbitrageMetrics();
      metrics.recordOrder('bybit', 'failed', 'staged');
      metrics.reset();
      const output = await metrics.getMetrics();
      expect(output.trim()).toBe('');
    });
  });

  describe('ArbitrageAuditLogger', () => {
    it('creates and writes structured audit entries for executions', async () => {
      const auditLogger = new ArbitrageAuditLogger();
      await auditLogger.logExecution({
        executionId: 'exec-test-1',
        opportunityId: 'opp-1',
        state: 'FILLED',
        legs: [],
        netRealizedPnlUsd: 250,
        latencyMs: 35,
        timestamp: Date.now(),
      });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'arbitrage:trade_execution',
          result: 'success',
          ipHash: 'mocked-ip-hash-sha256',
          metadata: expect.objectContaining({
            executionId: 'exec-test-1',
            state: 'FILLED',
            realizedPnlUsd: 250,
          }),
        }),
      );
    });

    it('logs compensatory unwind events', async () => {
      const auditLogger = new ArbitrageAuditLogger();
      await auditLogger.logUnwind('exec-unwind-2', {
        unwindId: 'unwind-123',
        success: true,
        unwoundLegs: [],
        unwindCostUsd: 15.5,
        timestamp: Date.now(),
      });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'arbitrage:compensatory_unwind',
          result: 'success',
          resource: 'arbitrage/unwind/unwind-123',
          metadata: expect.objectContaining({
            executionId: 'exec-unwind-2',
            unwindCostUsd: 15.5,
          }),
        }),
      );
    });

    it('logs risk rejection events', async () => {
      const auditLogger = new ArbitrageAuditLogger();
      await auditLogger.logRiskRejection({
        opportunityId: 'opp-rej-1',
        reason: 'Circuit breaker tripped',
        rule: 'DRAWDOWN_LIMIT',
      });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'arbitrage:risk_rejection',
          result: 'denied',
          metadata: expect.objectContaining({
            rule: 'DRAWDOWN_LIMIT',
          }),
        }),
      );
    });
  });

  describe('ArbitrageEngine Master Orchestrator', () => {
    const createMockConnector = (venue: string): IExchangeConnector => ({
      venue,
      fetchOrderBook: vi.fn().mockResolvedValue({
        symbol: 'BTC/USDT',
        bids: [{ price: 50100, amount: 2 }],
        asks: [{ price: 50000, amount: 2 }],
        timestamp: Date.now(),
      }),
      placeOrder: vi.fn().mockResolvedValue({
        orderId: `order-${venue}`,
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        price: 50000,
        amount: 0.1,
        filled: 0.1,
        status: 'closed',
        timestamp: Date.now(),
      }),
      cancelOrder: vi.fn(),
      fetchBalance: vi.fn().mockResolvedValue({
        venue,
        balances: { USDT: { free: 10000, total: 10000 }, BTC: { free: 1, total: 1 } },
        timestamp: Date.now(),
      }),
      fetchTicker: vi.fn(),
      getLatencyStats: vi.fn().mockReturnValue({ p50: 15, p90: 25, p99: 50 }),
    });

    it('starts and stops gracefully', () => {
      const engine = new ArbitrageEngine(() => undefined, { mode: 'dry-run' });
      expect(engine.isRunning()).toBe(false);
      engine.start();
      expect(engine.isRunning()).toBe(true);
      engine.stop();
      expect(engine.isRunning()).toBe(false);
    });

    it('executes admitted opportunity end-to-end in dry-run mode and updates metrics', async () => {
      const binance = createMockConnector('binance');
      const polymarket = createMockConnector('polymarket');

      const resolver = (venue: string) => (venue === 'binance' ? binance : polymarket);
      const engine = new ArbitrageEngine(resolver, { mode: 'dry-run' });

      const opp: ArbitrageOpportunity = {
        id: 'opp-full-e2e',
        symbol: 'BTC/USDT',
        type: 'cross-exchange',
        buyVenue: 'binance',
        sellVenue: 'polymarket',
        buyPrice: 50000,
        sellPrice: 50500,
        tradeSize: 0.05,
        spreadBps: 100,
        netProfitBps: 80,
        netProfitUsd: 25,
        estimatedGasUsd: 0.5,
        confidence: 0.95,
        timestamp: Date.now(),
      };

      const report = await engine.executeOpportunity(opp);
      expect(report).not.toBeNull();
      expect(report?.state).toBe('FILLED');
      expect(binance.placeOrder).toHaveBeenCalled();
      expect(polymarket.placeOrder).toHaveBeenCalled();

      // Check telemetry
      const metricsOut = await engine.metrics.getMetrics();
      expect(metricsOut).toContain('arb_orders_total');
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'arbitrage:trade_execution',
          result: 'success',
        }),
      );
    });

    it('blocks opportunity when risk guard rejects it', async () => {
      const binance = createMockConnector('binance');
      const engine = new ArbitrageEngine(() => binance, {
        mode: 'dry-run',
        riskConfig: { minHurdleBps: 20 },
      });

      const opp: ArbitrageOpportunity = {
        id: 'opp-overlimit',
        symbol: 'BTC/USDT',
        type: 'cross-exchange',
        buyVenue: 'binance',
        sellVenue: 'binance',
        buyPrice: 50000,
        sellPrice: 50010,
        tradeSize: 0.1,
        spreadBps: 2,
        netProfitBps: 2, // 2 bps < minHurdleBps 20
        confidence: 0.9,
        timestamp: Date.now(),
      };

      const report = await engine.executeOpportunity(opp);
      expect(report).toBeNull();
      expect(binance.placeOrder).not.toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'arbitrage:risk_rejection',
          result: 'denied',
        }),
      );
    });
  });
});
