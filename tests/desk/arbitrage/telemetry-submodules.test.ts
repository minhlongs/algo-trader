/**
 * Unit tests for Arbitrage Telemetry submodules: metrics recorders and audit logger helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  recordArbPnl,
  recordArbSlippage,
} from '../../../src/desk/arbitrage/telemetry/arbitrage-metrics-recorders-pnl';
import {
  recordArbOrder,
  recordArbLatency,
} from '../../../src/desk/arbitrage/telemetry/arbitrage-metrics-recorders-orders';
import {
  resolveIpHash,
  resolveAuditHmacKey,
  buildAuditRow,
  verifyAuditChainIntegrity,
} from '../../../src/desk/arbitrage/telemetry/audit-logger-chain';
import {
  mapOpportunityIngestedMeta,
  mapRiskRejectedMeta,
  mapOrderSubmittedMeta,
  mapOrderFilledMeta,
} from '../../../src/desk/arbitrage/telemetry/audit-logger-mappers';

describe('Arbitrage Telemetry Submodules', () => {
  describe('arbitrage-metrics-recorders-pnl', () => {
    it('records PnL with various result types and venue pairs', () => {
      expect(() => {
        // Object params variations
        recordArbPnl({
          strategyType: 'cross-exchange',
          venuePair: 'binance-bybit',
          result: 'win',
          pnlUsd: 150,
        });
        recordArbPnl({
          strategyType: 'prediction-market',
          venuePair: 'polymarket-kalshi',
          result: 'loss',
          pnlUsd: -50,
        });
        // Default inference when result is omitted
        recordArbPnl({
          pnlUsd: 200,
        });
        recordArbPnl({
          pnlUsd: -100,
        });

        // 2-arg positional overload (strategy, pnlUsd)
        recordArbPnl('triangular', 75);
        recordArbPnl('triangular', -25);

        // 3-arg / 4-arg positional overload (strategy, venuePair, result, pnlUsd)
        recordArbPnl('cross-exchange', 'binance-okx', 'win', 300);
        recordArbPnl('cross-exchange', 'binance-okx', 'loss', -50);
        recordArbPnl('cross-exchange', 'binance-okx', undefined as any, 100);
        recordArbPnl('cross-exchange', 'binance-okx', undefined as any, -100);
        recordArbPnl('cross-exchange', undefined as any, undefined as any, undefined as any);
      }).not.toThrow();
    });

    it('records slippage with positive and negative bps', () => {
      expect(() => {
        // Object params variations
        recordArbSlippage({
          strategyType: 'cross-exchange',
          venue: 'binance',
          symbol: 'BTC/USDT',
          side: 'buy',
          slippageBps: 2.5,
        });
        recordArbSlippage({
          venue: 'bybit',
          symbol: 'ETH/USDT',
          slippageBps: -1.2,
        });

        // 3-arg positional overload (venue, symbol, slippageBps)
        recordArbSlippage('binance', 'BTC/USDT', 3.0);
        recordArbSlippage('binance', undefined as any, 3.0);

        // 5-arg positional overload (strategy, venue, symbol, side, slippageBps)
        recordArbSlippage('triangular', 'okx', 'SOL/USDT', 'sell', 4.5);
        recordArbSlippage('triangular', undefined as any, undefined as any, undefined as any, undefined as any);
      }).not.toThrow();
    });
  });

  describe('arbitrage-metrics-recorders-orders', () => {
    it('records orders with all status variations and overloads', () => {
      expect(() => {
        // Object params with all fields
        recordArbOrder({
          strategyType: 'cross-exchange',
          venue: 'binance',
          leg: 'leg2',
          side: 'sell',
          status: 'filled',
          mode: 'live',
        });
        // Object params with default fallbacks
        recordArbOrder({
          venue: 'bybit',
          status: 'risk_rejected',
        });
        recordArbOrder({
          strategyType: 'triangular',
          venue: 'kucoin',
          status: 'hurdle_rejected',
          mode: 'live',
        });

        // Positional overloads
        recordArbOrder('cross-exchange', 'binance', 'leg1', 'buy', 'submitted', 'live');
        recordArbOrder('triangular');
      }).not.toThrow();
    });

    it('records latency metrics across phases and overloads', () => {
      expect(() => {
        // Object params
        recordArbLatency({
          strategyType: 'cross-exchange',
          phase: 'pre_trade_risk',
          status: 'success',
          latencyMs: 5,
        });
        recordArbLatency({
          latencyMs: 15,
        });
        recordArbLatency({
          latencyMs: -5, // Test Math.max(0, ...)
        });

        // 2-arg positional overload (strategy, latencyMs)
        recordArbLatency('triangular', 25);
        recordArbLatency('triangular', -10);

        // Positional overloads with phase/status
        recordArbLatency('cross-exchange', 'leg_fill', 'success', 35);
        recordArbLatency('cross-exchange', undefined as any, undefined as any, undefined as any);
      }).not.toThrow();
    });
  });

  describe('audit-logger-chain', () => {
    it('resolves IP hash securely', () => {
      const hash1 = resolveIpHash('127.0.0.1');
      const hash2 = resolveIpHash('127.0.0.1');
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBeGreaterThan(0);
    });

    it('resolves HMAC key from custom Buffer, env, or fallback', () => {
      const customKey = Buffer.alloc(32, 1);
      expect(resolveAuditHmacKey(customKey)).toBe(customKey);

      const fallbackKey = resolveAuditHmacKey();
      expect(Buffer.isBuffer(fallbackKey)).toBe(true);
      expect(fallbackKey.length).toBe(32);
    });

    it('builds audit rows and maintains valid hash chain', () => {
      const key = resolveAuditHmacKey();

      const row1 = buildAuditRow({
        actor: 'arbitrage-engine',
        action: 'order_submitted',
        resource: 'order-1',
        result: 'SUCCESS',
        metadata: { symbol: 'BTC/USDT' },
        ipHash: resolveIpHash('127.0.0.1'),
        tenantId: 'platform_system',
        sequenceNumber: 1,
        previousHash: '',
        hmacKey: key,
      });

      const row2 = buildAuditRow({
        actor: 'arbitrage-engine',
        action: 'order_filled',
        resource: 'order-1',
        result: 'SUCCESS',
        metadata: { symbol: 'BTC/USDT', pnl: 50 },
        ipHash: resolveIpHash('127.0.0.1'),
        tenantId: 'platform_system',
        sequenceNumber: 2,
        previousHash: row1.hash,
        hmacKey: key,
      });

      const verification = verifyAuditChainIntegrity([row1, row2], key);
      expect(verification.valid).toBe(true);
      expect(verification.totalRecords).toBe(2);
    });

    it('detects tampered rows in chain verification', () => {
      const key = resolveAuditHmacKey();

      const row1 = buildAuditRow({
        actor: 'arbitrage-engine',
        action: 'order_submitted',
        resource: 'order-1',
        result: 'SUCCESS',
        metadata: { symbol: 'BTC/USDT' },
        ipHash: resolveIpHash('127.0.0.1'),
        tenantId: 'platform_system',
        sequenceNumber: 1,
        previousHash: '',
        hmacKey: key,
      });

      // Tamper with sequence number
      const tamperedRow1 = { ...row1, sequenceNumber: 999 };
      const verification = verifyAuditChainIntegrity([tamperedRow1], key);
      expect(verification.valid).toBe(false);
      expect(verification.brokenAt).toBe(999);
    });
  });

  describe('audit-logger-mappers', () => {
    it('maps opportunity ingested and risk rejected metadata', () => {
      const oppMeta = mapOpportunityIngestedMeta({
        id: 'opp-1',
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        buyPrice: 50000,
        sellPrice: 50200,
      });
      expect(oppMeta.opportunityId).toBe('opp-1');
      expect(oppMeta.symbol).toBe('BTC/USDT');

      const riskMeta = mapRiskRejectedMeta({
        opportunityId: 'opp-rej',
        rule: 'DRAWDOWN_LIMIT',
        reason: 'Max drawdown breached',
      });
      expect(riskMeta.opportunityId).toBe('opp-rej');
      expect(riskMeta.rule).toBe('DRAWDOWN_LIMIT');

      const submitMeta = mapOrderSubmittedMeta({
        orderId: 'ord-1',
        opportunityId: 'opp-1',
        symbol: 'BTC/USDT',
        legsCount: 2,
        totalNotionalUsd: 1000,
      });
      expect(submitMeta.orderId).toBe('ord-1');

      const fillMeta = mapOrderFilledMeta({
        executionId: 'exec-1',
      });
      expect(fillMeta.executionId).toBe('exec-1');
    });
  });
});
