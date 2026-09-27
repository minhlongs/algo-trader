/**
 * Unit tests for Arbitrage Engine submodules: normalizer, pretrade, and telemetry.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  extractOpportunityParams,
  normalizeSpreadOpportunity,
} from '../../../src/desk/arbitrage/engine/arbitrage-engine-normalizer';
import {
  resolveVenueLatencies,
  validatePreTradeRiskAndHurdle,
  buildTwoLegExecutionPlan,
} from '../../../src/desk/arbitrage/engine/arbitrage-engine-pretrade';
import {
  recordExecutionMetrics,
  logExecutionAuditOutcome,
} from '../../../src/desk/arbitrage/engine/arbitrage-engine-telemetry';
import { ArbitrageMetrics } from '../../../src/desk/arbitrage/arbitrage-metrics';
import { ArbitrageAuditLogger } from '../../../src/desk/arbitrage/telemetry/arbitrage-audit-logger';
import { ArbitrageRiskGuard } from '../../../src/desk/arbitrage/arbitrage-risk-guard';
import type { MultiLegExecutionReport } from '../../../src/desk/arbitrage/execution-types';

describe('ArbitrageEngine Submodules', () => {
  describe('arbitrage-engine-normalizer', () => {
    it('extracts params from direct venue/exchange properties', () => {
      const opp = {
        id: 'opp-1',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        symbol: 'ETH/USDT',
        buyPrice: 2000,
        sellPrice: 2020,
        amount: 5,
      };
      const res = extractOpportunityParams(opp);
      expect(res.buyVenue).toBe('binance');
      expect(res.sellVenue).toBe('bybit');
      expect(res.symbol).toBe('ETH/USDT');
      expect(res.buyPrice).toBe(2000);
      expect(res.sellPrice).toBe(2020);
      expect(res.amount).toBe(5);
    });

    it('extracts params from buyExchange/sellExchange and tradeSize', () => {
      const opp = {
        id: 'opp-2',
        buyExchange: 'kucoin',
        sellExchange: 'binance',
        tradeSize: 3.5,
        buyPrice: 100,
        sellPrice: 105,
      };
      const res = extractOpportunityParams(opp);
      expect(res.buyVenue).toBe('kucoin');
      expect(res.sellVenue).toBe('binance');
      expect(res.amount).toBe(3.5);
    });

    it('extracts params from venues array and maxTradeSize', () => {
      const opp = {
        id: 'opp-3',
        venues: ['kraken', 'coinbase'],
        maxTradeSize: 10,
      };
      const res = extractOpportunityParams(opp);
      expect(res.buyVenue).toBe('kraken');
      expect(res.sellVenue).toBe('coinbase');
      expect(res.amount).toBe(10);
      expect(res.symbol).toBe('BTC/USDT');
    });

    it('extracts params from legs array fallback', () => {
      const opp = {
        id: 'opp-4',
        legs: [
          { exchange: 'okx', symbol: 'SOL/USDT', side: 'buy' as const, price: 50, amount: 20 },
          { venue: 'gate', symbol: 'SOL/USDT', side: 'sell' as const, price: 52, amount: 20 },
        ],
      };
      const res = extractOpportunityParams(opp);
      expect(res.buyVenue).toBe('okx');
      expect(res.sellVenue).toBe('gate');
      expect(res.symbol).toBe('SOL/USDT');
      expect(res.buyPrice).toBe(50);
      expect(res.sellPrice).toBe(52);
      expect(res.amount).toBe(20);
    });

    it('handles empty/unknown opportunity fallbacks', () => {
      const opp = { id: 'opp-empty' };
      const res = extractOpportunityParams(opp);
      expect(res.buyVenue).toBe('unknown');
      expect(res.sellVenue).toBe('unknown');
      expect(res.symbol).toBe('BTC/USDT');
      expect(res.buyPrice).toBe(0);
      expect(res.sellPrice).toBe(0);
      expect(res.amount).toBe(1);
    });

    it('normalizes spread opportunity with spread and spreadPercent', () => {
      const opp = {
        id: 'opp-norm-1',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        symbol: 'BTC/USDT',
        buyPrice: 50000,
        sellPrice: 50500,
        spread: 500,
        spreadPercent: 1.0,
        timestamp: 123456789,
      };
      const norm = normalizeSpreadOpportunity(opp);
      expect(norm.id).toBe('opp-norm-1');
      expect(norm.buyExchange).toBe('binance');
      expect(norm.sellExchange).toBe('bybit');
      expect(norm.spread).toBe(500);
      expect(norm.spreadPercent).toBe(1.0);
      expect(norm.timestamp).toBe(123456789);
    });

    it('computes spread and spreadPercent if omitted in normalization', () => {
      const opp = {
        id: 'opp-norm-2',
        buyExchange: 'kucoin',
        sellExchange: 'binance',
        buyPrice: 100,
        sellPrice: 110,
      };
      const norm = normalizeSpreadOpportunity(opp);
      expect(norm.spread).toBe(10);
      expect(norm.spreadPercent).toBe(10);
    });
  });

  describe('arbitrage-engine-pretrade', () => {
    it('resolves latencies with getLatencyStats method on connectors', () => {
      const buyConn = { getLatencyStats: () => ({ p90: 15 }) };
      const sellConn = { getLatencyStats: () => ({ p90: 25 }) };
      const resolver = (v: string) => (v === 'binance' ? buyConn as any : sellConn as any);

      const latencies = resolveVenueLatencies(resolver, 'binance', 'bybit');
      expect(latencies.buyLatency).toBe(15);
      expect(latencies.sellLatency).toBe(25);
    });

    it('falls back to default 10ms when connector is missing or has no stats', () => {
      const resolver = () => undefined;
      const latencies = resolveVenueLatencies(resolver, 'a', 'b');
      expect(latencies.buyLatency).toBe(10);
      expect(latencies.sellLatency).toBe(10);
    });

    it('builds two-leg execution plan correctly', () => {
      const plan = buildTwoLegExecutionPlan({
        opportunityId: 'opp-100',
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        sizedAmount: 0.5,
        buyPrice: 50000,
        sellPrice: 50200,
      });

      expect(plan.executionMode).toBe('concurrent');
      expect(plan.legs).toHaveLength(2);
      expect(plan.legs[0].venue).toBe('binance');
      expect(plan.legs[0].side).toBe('buy');
      expect(plan.legs[1].venue).toBe('bybit');
      expect(plan.legs[1].side).toBe('sell');
    });

    it('rejects pre-trade validation if profit is below hurdle', async () => {
      const riskGuard = new ArbitrageRiskGuard({ mode: 'paper' });
      const auditLogger = new ArbitrageAuditLogger();
      const opp = { id: 'opp-low-hurdle', netProfitBps: 2 };
      const extracted = {
        buyVenue: 'binance',
        sellVenue: 'bybit',
        symbol: 'BTC/USDT',
        buyPrice: 50000,
        sellPrice: 50010,
        amount: 1,
      };

      const result = await validatePreTradeRiskAndHurdle({
        opp,
        extracted,
        minHurdleBps: 10,
        mode: 'dry-run',
        riskGuard,
        auditLogger,
        connectorResolver: () => undefined,
      });

      expect(result.allowed).toBe(false);
      expect(result.sizedAmount).toBe(0);
    });
  });

  describe('arbitrage-engine-telemetry', () => {
    it('records execution metrics for all legs and realized PnL', () => {
      const metrics = new ArbitrageMetrics();
      const report: MultiLegExecutionReport = {
        executionId: 'exec-1',
        orderId: 'order-1',
        opportunityId: 'opp-1',
        state: 'FILLED',
        legs: [
          { legId: 'leg-1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', requestedAmount: 1, filledAmount: 1, remainingAmount: 0, price: 50000, status: 'filled', latencyMs: 12 },
          { legId: 'leg-2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', requestedAmount: 1, filledAmount: 1, remainingAmount: 0, price: 50200, status: 'filled', latencyMs: 14 },
        ],
        totalNotionalUsd: 50000,
        netRealizedPnlUsd: 180,
        grossPnlUsd: 200,
        totalFeesUsd: 20,
        effectiveSpreadBps: 36,
        executionMode: 'concurrent',
        timing: { startTimestamp: 100, endTimestamp: 120, totalLatencyMs: 20 },
      };

      expect(() => recordExecutionMetrics(report, metrics, 'dry-run', 'binance', 'bybit')).not.toThrow();
    });

    it('logs execution audit outcomes for FILLED, UNWOUND, and FAILED states', async () => {
      const metrics = new ArbitrageMetrics();
      const auditLogger = new ArbitrageAuditLogger();

      const filledReport: MultiLegExecutionReport = {
        executionId: 'exec-f',
        orderId: 'ord-f',
        opportunityId: 'opp-f',
        state: 'FILLED',
        legs: [],
        totalNotionalUsd: 1000,
        executionMode: 'concurrent',
        timing: { startTimestamp: 100, endTimestamp: 110, totalLatencyMs: 10 },
      };
      await logExecutionAuditOutcome(filledReport, auditLogger, metrics, 'binance');

      const failedReport: MultiLegExecutionReport = {
        ...filledReport,
        executionId: 'exec-fail',
        state: 'FAILED',
        error: 'Timeout',
      };
      await logExecutionAuditOutcome(failedReport, auditLogger, metrics, 'binance');

      const unwoundReport: MultiLegExecutionReport = {
        ...filledReport,
        executionId: 'exec-u',
        state: 'UNWOUND',
        unwindResult: {
          unwindId: 'unwind-1',
          success: true,
          action: 'hedged',
          residualDelta: 0,
          totalCostUsd: 5,
          latencyMs: 30,
          unwoundLegs: [],
        },
      };
      await logExecutionAuditOutcome(unwoundReport, auditLogger, metrics, 'binance');
    });
  });
});
