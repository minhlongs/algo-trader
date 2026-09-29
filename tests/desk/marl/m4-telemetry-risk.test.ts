/**
 * Milestone 4 Test Suite: Pre-Trade Risk Gates, Telemetry & Hash-Chained Audit Logging.
 *
 * Verifies MarlRiskGuard, MarlMetricsRecorder, MarlAuditLogger, and MarlEngine master orchestrator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MarlRiskGuard,
  MarlMetricsRecorder,
  MarlAuditLogger,
  MarlEngine,
} from '../../../src/desk/marl';

describe('Milestone 4: Pre-Trade Risk Gates, Telemetry & Hash-Chained Audit Logging', () => {
  describe('MarlRiskGuard Pre-Trade Gates', () => {
    let riskGuard: MarlRiskGuard;

    beforeEach(() => {
      riskGuard = new MarlRiskGuard({
        maxPositionFraction: 0.05,
        maxInventoryNotionalUsd: 50_000,
        maxDailyDrawdownFraction: 0.15,
        maxVenueLatencyMs: 500,
      });
    });

    it('approves trades within safe risk parameters', () => {
      const res = riskGuard.evaluateRisk({
        quoteNotionalUsd: 1000,
        portfolioCapital: 100_000,
        currentDailyDrawdown: 0.02,
        venueLatencyMs: 50,
        currentInventoryNotional: 5000,
        winRate: 0.60,
      });

      expect(res.approved).toBe(true);
      expect(res.rejectionReason).toBeUndefined();
      expect(res.circuitBroken).toBe(false);
      expect(res.quarterKellySizeUsd).toBe(5000);
    });

    it('rejects trades when daily drawdown reaches or exceeds 15% threshold', () => {
      const res = riskGuard.evaluateRisk({
        quoteNotionalUsd: 100,
        portfolioCapital: 100_000,
        currentDailyDrawdown: 0.15,
        venueLatencyMs: 25,
        currentInventoryNotional: 0,
      });

      expect(res.approved).toBe(false);
      expect(res.rejectionReason).toBe('DRAWDOWN_BREAKER_TRIPPED');
      expect(res.circuitBroken).toBe(true);
    });

    it('rejects trades when venue latency spikes above 500ms', () => {
      const res = riskGuard.evaluateRisk({
        quoteNotionalUsd: 500,
        portfolioCapital: 100_000,
        currentDailyDrawdown: 0.01,
        venueLatencyMs: 501,
        currentInventoryNotional: 0,
      });

      expect(res.approved).toBe(false);
      expect(res.rejectionReason).toBe('VENUE_LATENCY_SPIKE');
      expect(res.circuitBroken).toBe(false);
    });

    it('enforces 5% Quarter-Kelly position sizing hard cap', () => {
      const res = riskGuard.evaluateRisk({
        quoteNotionalUsd: 5001,
        portfolioCapital: 100_000, // 5% = $5,000
        currentDailyDrawdown: 0.01,
        venueLatencyMs: 20,
        currentInventoryNotional: 0,
        winRate: 0.60,
      });

      expect(res.approved).toBe(false);
      expect(res.rejectionReason).toBe('KELLY_CAP_EXCEEDED');
      expect(res.quarterKellySizeUsd).toBe(5000);
    });

    it('rejects trades exceeding max inventory notional limit', () => {
      const res = riskGuard.evaluateRisk({
        quoteNotionalUsd: 2000,
        portfolioCapital: 100_000,
        currentDailyDrawdown: 0.01,
        venueLatencyMs: 20,
        currentInventoryNotional: 49_000, // 49k + 2k = 51k > 50k
      });

      expect(res.approved).toBe(false);
      expect(res.rejectionReason).toBe('INVENTORY_LIMIT_EXCEEDED');
    });

    it('handles manual emergency halt and reset', () => {
      riskGuard.tripEmergencyHalt('Manual circuit trip for testing');
      expect(riskGuard.isHalted()).toBe(true);

      const resHalted = riskGuard.evaluateRisk({
        quoteNotionalUsd: 500,
        portfolioCapital: 100_000,
        currentDailyDrawdown: 0.0,
        venueLatencyMs: 20,
        currentInventoryNotional: 0,
      });
      expect(resHalted.approved).toBe(false);
      expect(resHalted.rejectionReason).toBe('EMERGENCY_HALT_ACTIVE');

      riskGuard.resetEmergencyHalt();
      expect(riskGuard.isHalted()).toBe(false);

      const resReset = riskGuard.evaluateRisk({
        quoteNotionalUsd: 500,
        portfolioCapital: 100_000,
        currentDailyDrawdown: 0.0,
        venueLatencyMs: 20,
        currentInventoryNotional: 0,
      });
      expect(resReset.approved).toBe(true);
    });
  });

  describe('MarlMetricsRecorder Telemetry', () => {
    let metrics: MarlMetricsRecorder;

    beforeEach(() => {
      metrics = new MarlMetricsRecorder();
    });

    it('records quoting lifecycle and calculates fill rate', () => {
      metrics.recordQuote('posted', 'both', 'BTC/USDT');
      metrics.recordQuote('posted', 'both', 'BTC/USDT');
      metrics.recordFill('bid', 50, 50_000, 10, 'BTC/USDT');

      const snap = metrics.getSnapshot();
      expect(snap.quotesCount).toBe(2);
      expect(snap.fillsCount).toBe(1);
      expect(snap.fillRate).toBe(0.5);
    });

    it('records inventory skew, net delta, and realized PnL', () => {
      metrics.recordInventorySkew(15, 750_000, 'BTC/USDT');
      metrics.recordNetDelta(0.5, 15, -14.5, 'BTC/USDT');
      metrics.recordPnl(1250, 200, 'BTC/USDT');

      const snap = metrics.getSnapshot();
      expect(snap.inventory).toBe(15);
      expect(snap.netDelta).toBe(0.5);
      expect(snap.realizedPnl).toBe(1250);
    });

    it('records toxicity tripwires and hedge latency', () => {
      metrics.recordToxicity(0.96, 4.2, true, 'BTC/USDT', 'vpin_spike');
      metrics.recordHedgeLatency('binance', 45, 'success');

      const snap = metrics.getSnapshot();
      expect(snap.toxicityTripwireEvents).toBe(1);
    });
  });

  describe('MarlAuditLogger Hash Chaining & Tamper Evidence', () => {
    let auditLogger: MarlAuditLogger;

    beforeEach(() => {
      auditLogger = new MarlAuditLogger('test-marl-audit-secret-v1');
    });

    it('creates monotonic sequence with valid SHA-256 HMAC hash chain', () => {
      const rec0 = auditLogger.logAction('marl.quote.posted', { bidPrice: 49900, askPrice: 50100 });
      const rec1 = auditLogger.logAction('marl.fill.received', { side: 'buy', amount: 10, price: 49900 });
      const rec2 = auditLogger.logAction('marl.hedge.submitted', { venue: 'binance', side: 'sell', amount: 10 });

      expect(rec0.sequenceNumber).toBe(0);
      expect(rec0.previousHash).toBe('0000000000000000000000000000000000000000000000000000000000000000');
      expect(rec1.sequenceNumber).toBe(1);
      expect(rec1.previousHash).toBe(rec0.hash);
      expect(rec2.sequenceNumber).toBe(2);
      expect(rec2.previousHash).toBe(rec1.hash);

      const verification = auditLogger.verifyChain();
      expect(verification.valid).toBe(true);
      expect(verification.total).toBe(3);
    });

    it('detects tampering when payload content is modified', () => {
      auditLogger.logAction('marl.quote.posted', { bidPrice: 100 });
      auditLogger.logAction('marl.quote.posted', { bidPrice: 101 });
      auditLogger.logAction('marl.quote.posted', { bidPrice: 102 });

      const records = auditLogger.getRecords();
      // Tamper with record 1 payload
      records[1].payload = { bidPrice: 999 };

      const verification = auditLogger.verifyChain();
      expect(verification.valid).toBe(false);
      expect(verification.brokenAt).toBe(1);
    });

    it('detects tampering when previousHash is modified', () => {
      auditLogger.logAction('marl.quote.posted', { bidPrice: 100 });
      auditLogger.logAction('marl.quote.posted', { bidPrice: 101 });

      const records = auditLogger.getRecords();
      records[1].previousHash = 'bad0000000000000000000000000000000000000000000000000000000000000';

      const verification = auditLogger.verifyChain();
      expect(verification.valid).toBe(false);
      expect(verification.brokenAt).toBe(1);
    });
  });

  describe('MarlEngine Master Orchestrator', () => {
    let engine: MarlEngine;

    beforeEach(() => {
      engine = new MarlEngine({
        symbol: 'BTC/USDT',
        asConfig: {
          gamma: 0.1,
          kappa: 1.5,
          sigma: 0.02,
          quoteSize: 0.02,
        },
        riskConfig: {
          maxPositionFraction: 0.05,
          maxDailyDrawdownFraction: 0.15,
        },
      });
      engine.setPortfolioCapital(100_000);
    });

    it('starts and stops gracefully', () => {
      expect(engine.getStatus().isRunning).toBe(false);
      engine.start();
      expect(engine.getStatus().isRunning).toBe(true);
      engine.stop();
      expect(engine.getStatus().isRunning).toBe(false);
    });

    it('generates optimal quotes when engine is running', () => {
      engine.start();
      const quote = engine.generateQuote(0.50, 0);

      expect(quote).not.toBeNull();
      expect(quote!.bidPrice).toBeLessThan(0.50);
      expect(quote!.askPrice).toBeGreaterThan(0.50);
      expect(quote!.totalSpread).toBeGreaterThan(0);
      expect(engine.getStatus().inventory).toBe(0);
    });

    it('blocks quotes and logs audit rejection when drawdown circuit breaker trips', () => {
      engine.start();
      engine.setDailyDrawdown(0.16); // Breaches 15%

      const quote = engine.generateQuote(0.50, 0);
      expect(quote).toBeNull();

      const lastAudit = engine.auditLogger.getLastRecord();
      expect(lastAudit).toBeDefined();
      expect(lastAudit!.action).toBe('marl.risk.rejected');
      expect(lastAudit!.payload.reason).toBe('DRAWDOWN_BREAKER_TRIPPED');
    });

    it('records maker fill, updates inventory, and logs audit fill', () => {
      engine.start();
      engine.onMakerFill('buy', 5, 0.50);

      const status = engine.getStatus();
      expect(status.inventory).toBe(5);
      expect(status.netDelta).toBe(5);

      const lastAudit = engine.auditLogger.getLastRecord();
      expect(lastAudit!.action).toBe('marl.fill.received');
      expect(lastAudit!.payload.side).toBe('buy');
      expect(lastAudit!.payload.amount).toBe(5);
    });
  });
});
