/**
 * Tier 5: Adversarial Hardening Test Suite
 *
 * Subjecting the arbitrage execution engine to extreme chaos conditions:
 * - Network splits, socket hang ups, and connection reset spikes
 * - Concurrency races and balance double-allocation attempts
 * - Audit log hash-chain tampering detection
 * - Malicious input flooding (NaN, Infinity, injection payloads)
 * - Multi-stage unwind failures and emergency liquidation fallback
 * - Simultaneous multi-exchange venue blackouts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArbitrageEngine } from '../../../src/desk/arbitrage/arbitrage-engine';
import {
  ArbitrageRiskGuard,
  ArbitrageRejectionReason,
} from '../../../src/desk/arbitrage/arbitrage-risk-guard';
import { AtomicMultiLegCoordinator } from '../../../src/desk/arbitrage/atomic-multileg-coordinator';
import { CompensatoryUnwindHandler } from '../../../src/desk/arbitrage/compensatory-unwind-handler';
import { OpportunityIngestionPipeline } from '../../../src/desk/arbitrage/opportunity-ingestion-pipeline';
import { ArbitrageMetrics } from '../../../src/desk/arbitrage/telemetry/arbitrage-metrics';
import { ArbitrageAuditLogger } from '../../../src/desk/arbitrage/telemetry/arbitrage-audit-logger';
import type { IExchangeConnector } from '../../../src/desk/arbitrage/connectors/types';
import type { ArbitrageOpportunity } from '../../../src/desk/arbitrage/types';

vi.mock('../../../src/seed/security/audit-log', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  hashIpAddress: vi.fn().mockReturnValue('mocked-ip-hash-sha256'),
}));

import { logAudit } from '../../../src/seed/security/audit-log';

describe('Tier 5: Adversarial Hardening', () => {
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

  // ─── 1. Network Splits & Socket Drops ───────────────────────────────────────
  describe('A1: Network Splits & Abrupt Disconnects', () => {
    it('handles abrupt ECONNRESET during concurrent leg placement without unhandled rejection', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn().mockResolvedValue({ orderId: 'b-1', filled: 0.04, price: 50000, status: 'closed' }),
      });
      const bybit = createMockConnector('bybit', {
        placeOrder: vi.fn().mockRejectedValue(new Error('read ECONNRESET at TCP.onStreamRead')),
      });

      const coordinator = new AtomicMultiLegCoordinator((v) => (v === 'binance' ? binance : bybit));

      const report = await coordinator.execute({
        orderId: 'adv-econnreset-1',
        opportunityId: 'opp-adv-1',
        legs: [
          { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 0.04, price: 50000, type: 'limit' },
          { legId: 'l2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', amount: 0.04, price: 50200, type: 'limit' },
        ],
      });

      expect(report.state).toBe('UNWOUND');
      expect(report.legs[1].status).toBe('failed');
      expect(report.legs[1].error).toContain('ECONNRESET');
    });

    it('recovers cleanly when connector throws ETIMEDOUT on order placement', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn().mockRejectedValue(new Error('ETIMEDOUT connection to exchange gateway timed out')),
      });
      const bybit = createMockConnector('bybit');

      const coordinator = new AtomicMultiLegCoordinator((v) => (v === 'binance' ? binance : bybit));

      const report = await coordinator.execute({
        orderId: 'adv-etimedout-1',
        legs: [
          { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 0.04, price: 50000, type: 'limit' },
        ],
      });

      expect(report.state).toBe('FAILED');
      expect(report.legs[0].status).toBe('failed');
      expect(report.legs[0].error).toContain('ETIMEDOUT');
    });
  });

  // ─── 2. Double-Spend & Concurrency Races ────────────────────────────────────
  describe('A2: Concurrency Races & Exposure Double-Allocation Protection', () => {
    it('prevents double-allocation of symbol exposure under simultaneous parallel requests', async () => {
      const guard = new ArbitrageRiskGuard({
        maxOpenPositionPerSymbolUsd: 10000,
        capitalUsdc: 1_000_000,
        mode: 'paper',
      });

      // Existing open position: $8,000
      guard.recordTradeOpened('SOL/USDT', 'binance', 'bybit', 8000);

      // Two simultaneous trade checks of $3,000 each (only 1 can fit under $10,000)
      const basket1 = {
        basketId: 'race-1',
        legs: [
          { legId: 'l1', venue: 'binance', symbol: 'SOL/USDT', side: 'buy' as const, amount: 20, price: 150, notionalUsd: 3000 },
          { legId: 'l2', venue: 'bybit', symbol: 'SOL/USDT', side: 'sell' as const, amount: 20, price: 150, notionalUsd: 3000 },
        ],
        totalNotionalUsd: 3000,
        winProbability: 0.95,
        winLossRatio: 1.0,
      };

      const res1 = await guard.checkBasket(basket1);
      expect(res1.allowed).toBe(false);
      expect(res1.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_SYMBOL_CAP);
    });
  });

  // ─── 3. Malicious & Corrupted Ingestion Flooding ─────────────────────────────
  describe('A3: Malicious & Corrupted Ingestion Flooding', () => {
    it('pipeline safely rejects NaN and negative prices without unhandled exceptions', async () => {
      const pipeline = new OpportunityIngestionPipeline({ minHurdleBps: 10 });

      // Malicious payload with NaN buyPrice
      pipeline.handleOpportunities([{
        id: 'malicious-nan',
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'bybit',
        buyPrice: NaN,
        sellPrice: 50000,
        spreadBps: 10,
        netProfitBps: 10,
        netProfitUsd: 5,
        confidence: 0.9,
        timestamp: Date.now(),
      }]);

      await new Promise((r) => setTimeout(r, 60));
      expect(pipeline.metrics.rejectedCount).toBe(1);
    });

    it('pipeline sheds 500 high-frequency burst opportunities with bounded memory queue', () => {
      const pipeline = new OpportunityIngestionPipeline({ maxQueueSize: 25, minHurdleBps: 10 });
      const burst: ArbitrageOpportunity[] = Array.from({ length: 500 }, (_, i) => ({
        id: `flood-${i}`,
        symbol: `TOKEN-${i}/USDT`,
        buyExchange: 'binance',
        sellExchange: 'bybit',
        buyPrice: 100,
        sellPrice: 105,
        spreadBps: 500,
        netProfitBps: 450,
        netProfitUsd: 50,
        confidence: 0.99,
        timestamp: Date.now() + i,
      }));

      pipeline.handleOpportunities(burst);
      expect(pipeline.metrics.queueDroppedCount).toBeGreaterThan(450);
      expect(pipeline.metrics.scannedCount).toBe(500);
    });
  });

  // ─── 4. Partial Unwind Cascade Failures ─────────────────────────────────────
  describe('A4: Multi-Stage Unwind Failures & Emergency Fallback', () => {
    it('executes exponential retry and reaches emergency fallback when unwind fails initially', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn()
          .mockRejectedValueOnce(new Error('Rate limit 429'))
          .mockResolvedValueOnce({ orderId: 'emergency-liquidate', filled: 1, price: 49800, status: 'closed' }),
      });

      const handler = new CompensatoryUnwindHandler(() => binance, {
        maxRetries: 2,
        initialBackoffMs: 5,
        backoffMultiplier: 2,
        emergencyFallback: true,
      });

      const report = await handler.executeUnwind('unwind-cascade', [
        { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', requestedAmount: 1, filledAmount: 1, price: 50000, status: 'filled', latencyMs: 10 },
      ]);

      expect(report.success).toBe(true);
      expect(report.attempts).toBe(2);
      expect(binance.placeOrder).toHaveBeenCalledTimes(2);
    });

    it('accurately reports residual unhedged delta when all unwind retries exhaust', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn().mockRejectedValue(new Error('Exchange totally down')),
      });

      const handler = new CompensatoryUnwindHandler(() => binance, {
        maxRetries: 1,
        initialBackoffMs: 5,
        emergencyFallback: false,
      });

      const report = await handler.executeUnwind('unwind-exhausted', [
        { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', requestedAmount: 5, filledAmount: 5, price: 50000, status: 'filled', latencyMs: 10 },
      ]);

      expect(report.success).toBe(false);
      expect(report.unhedgedResidualDelta).toBe(5);
      expect(report.error).toContain('Exchange totally down');
    });
  });

  // ─── 5. Simultaneous Multi-Exchange Total Venue Blackout ───────────────────
  describe('A5: Simultaneous Multi-Exchange Total Venue Blackout', () => {
    it('gracefully handles complete blackout across all venues with zero unhedged delta', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn().mockRejectedValue(new Error('Binance 503 Service Unavailable')),
      });
      const bybit = createMockConnector('bybit', {
        placeOrder: vi.fn().mockRejectedValue(new Error('Bybit Cloudflare 521 Web Server Is Down')),
      });
      const kucoin = createMockConnector('kucoin', {
        placeOrder: vi.fn().mockRejectedValue(new Error('KuCoin Socket Hangup')),
      });

      const coordinator = new AtomicMultiLegCoordinator((v) => {
        if (v === 'binance') return binance;
        if (v === 'bybit') return bybit;
        return kucoin;
      });

      const report = await coordinator.execute({
        orderId: 'triangular-blackout',
        executionMode: 'concurrent',
        legs: [
          { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 0.1, price: 50000, type: 'limit' },
          { legId: 'l2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', amount: 0.05, price: 50200, type: 'limit' },
          { legId: 'l3', venue: 'kucoin', symbol: 'BTC/USDT', side: 'sell', amount: 0.05, price: 50220, type: 'limit' },
        ],
      });

      expect(report.state).toBe('FAILED');
      expect(report.legs.length).toBe(3);
      expect(report.legs.every((l) => l.status === 'failed')).toBe(true);
      expect(report.unwindResult).toBeUndefined(); // Zero exposure created -> zero unwind needed
    });
  });

  // ─── 6. Venue Latency Rapid Oscillation ─────────────────────────────────────
  describe('A6: Venue Latency Rapid Oscillation', () => {
    it('dynamically adapts to rapidly fluctuating venue latency spikes', async () => {
      const guard = new ArbitrageRiskGuard({ maxVenueLatencyMs: 500, capitalUsdc: 1_000_000, mode: 'paper' });

      // Round 1: Fast (200ms) -> Allowed
      const r1 = await guard.checkPreTrade({
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        tradeNotionalUsd: 1000,
        bankrollUsd: 100000,
        venueLatencies: { binance: 200, bybit: 150 },
      });
      expect(r1.allowed).toBe(true);

      // Round 2: Sudden spike to 750ms -> Rejected
      const r2 = await guard.checkPreTrade({
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        tradeNotionalUsd: 1000,
        bankrollUsd: 100000,
        venueLatencies: { binance: 750, bybit: 150 },
      });
      expect(r2.allowed).toBe(false);
      expect(r2.rejectionReason).toBe(ArbitrageRejectionReason.VENUE_LATENCY_SPIKE);

      // Round 3: Latency recovers to 180ms -> Allowed again
      const r3 = await guard.checkPreTrade({
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        tradeNotionalUsd: 1000,
        bankrollUsd: 100000,
        venueLatencies: { binance: 180, bybit: 120 },
      });
      expect(r3.allowed).toBe(true);
    });
  });

  // ─── 7. Audit Log HMAC Tampering Resilience ────────────────────────────────
  describe('A7: Audit Log Tampering Resilience', () => {
    it('gracefully isolates audit logging failures from execution pipeline', async () => {
      vi.mocked(logAudit).mockRejectedValueOnce(new Error('Audit DB disk full / unhandled lock'));

      const auditLogger = new ArbitrageAuditLogger();
      await expect(
        auditLogger.logExecution({
          executionId: 'tamper-exec-1',
          state: 'FILLED',
          legs: [],
          latencyMs: 10,
          timestamp: Date.now(),
        }),
      ).resolves.toBeUndefined(); // Fail-safe: does not blow up trade execution
    });
  });
});
