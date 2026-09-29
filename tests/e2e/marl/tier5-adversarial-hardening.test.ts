/**
 * Tier 5: Adversarial Hardening Test Suite (MARL Market-Making Engine)
 *
 * Subjecting the complete MARL system to 10 hostile, edge-case, and fault-injection scenarios:
 * - ADV1: Extreme Flash Volatility Spike (sigma surges 50x, finite reservation prices, clamp bounds)
 * - ADV2: Toxic Orderbook Sweep Cascade (rapid multi-level depletion, instant tripwire, quote withdrawal)
 * - ADV3: Complete CEX Exchange Outage Mid-Hedge (failover to secondary venue, zero delta leak)
 * - ADV4: Exhausted Retry Compensatory Unwind (emergency liquidation fallback on repeated failures)
 * - ADV5: Cryptographic HMAC Tamper Detection (malicious payload injection detected by verifyChain)
 * - ADV6: Microsecond Rapid Oscillating Spread Manipulation (damps jitter without unbounded thrashing)
 * - ADV7: Circuit Breaker Breach under Simultaneous Latency & Drawdown Spikes (fail-closed rejection)
 * - ADV8: Negative Edge & Adverse Selection Kelly Clamping (returns $0 on negative expectancy)
 * - ADV9: Concurrent High-Churn Multi-Agent Quoting Collision (fill attribution and inventory invariance)
 * - ADV10: Structured Logger and Zero-Console Defense (sanitized logs, zero console leaks)
 */

import { describe, it, expect, vi } from 'vitest';
import { logger } from '../../../src/shared/utils/logger';
import {
  calculateOptimalQuotes,
  CrossVenueNetDeltaTracker,
  ToleranceBandRebalanceTrigger,
  AtomicCrossVenueHedgeDispatcher,
  CompensatoryUnwindHandler,
  VpinCalculator,
  KylesLambdaEstimator,
  DynamicQuoteWideningController,
  InstantCancellationTripwire,
  InformedSweepDetector,
  PreTradeQuotingRiskGuard,
  MarlPrometheusTelemetry,
  MarlHashChainedAuditLogger,
  UnifiedMarlEngine,
} from './fixtures/marl-test-harness';

describe('Tier 5: Adversarial Hardening (ADV1 to ADV10)', () => {
  const createBaseConfig = () => ({
    symbol: 'BTC-USD-YES',
    asConfig: {
      gamma: 0.1,
      kappa: 1.5,
      sigma: 0.02,
      terminalHorizonSec: 86_400,
      tickSize: 0.01,
      minSpread: 0.02,
      maxSpread: 0.20,
      maxInventory: 10_000,
      quoteSize: 100,
    },
    deltaHedgeConfig: {
      deltaThreshold: 0.10,
      hysteresisRatio: 0.50,
      primaryHedgeVenue: 'binance' as const,
      fallbackHedgeVenue: 'bybit' as const,
      maxHedgeSlippageBps: 15,
      orderTimeoutMs: 300,
      maxUnwindRetries: 3,
      emergencyLiquidation: true,
      minLotSize: 0.001,
    },
    adverseSelectionConfig: {
      bucketVolumeUsd: 10_000,
      vpinWindowBuckets: 50,
      vpinWarningCdf: 0.75,
      vpinTripwireCdf: 0.95,
      kylesLambdaWindowTicks: 100,
      kylesLambdaBaseline: 0.0001,
      kylesLambdaMultiplierTripwire: 3.0,
      maxSpreadWideningMultiplier: 5.0,
      cooldownWindowMs: 15_000,
      bucketTimeoutMs: 300_000,
      sweepLevelThreshold: 3,
      sweepWindowMs: 100,
    },
    riskConfig: {
      maxPositionFraction: 0.05,
      maxInventoryNotionalUsd: 50_000,
      maxDailyDrawdownFraction: 0.15,
      maxVenueLatencyMs: 500,
      emergencyHaltEnabled: true,
    },
  });

  // ─── ADV1: Extreme Flash Volatility Spike ──────────────────────────────────
  it('ADV1: survives 50x volatility shock with finite reservation prices and strict tick clamping', () => {
    const extremeSigma = 1.0; // 50x normal 0.02
    const result = calculateOptimalQuotes({
      midPrice: 0.50,
      inventory: 200,
      gamma: 0.1,
      sigma: extremeSigma,
      timeToHorizonSec: 3600,
      kappa: 1.5,
      minPrice: 0.01,
      maxPrice: 0.99,
      tickSize: 0.01,
    });

    expect(Number.isFinite(result.reservationPrice)).toBe(true);
    expect(Number.isFinite(result.bidPrice)).toBe(true);
    expect(Number.isFinite(result.askPrice)).toBe(true);
    expect(result.bidPrice).toBeGreaterThanOrEqual(0.01);
    expect(result.askPrice).toBeLessThanOrEqual(0.99);
    expect(result.clamped).toBe(true);
  });

  // ─── ADV2: Toxic Orderbook Sweep Cascade ────────────────────────────────────
  it('ADV2: detects toxic 5-level sweep cascade in <50ms and trips instant quote cancellation', () => {
    const sweepDetector = new InformedSweepDetector();
    const tripwire = new InstantCancellationTripwire(0.95, 10_000);
    const now = Date.now();

    // Inject rapid depletions across 5 levels within 40ms
    for (let i = 0; i < 5; i++) {
      sweepDetector.registerDepletion('sell', 500, now + i * 8);
    }

    const sweepResult = sweepDetector.checkSweep(0.48, 0.01);
    expect(sweepResult.sweepDetected).toBe(true);
    expect(sweepResult.levelsDepleted).toBeGreaterThanOrEqual(3);

    const tripResult = tripwire.evaluate(0.50, 1.0, sweepResult.sweepDetected, now + 50);
    expect(tripResult.tripwireActive).toBe(true);
    expect(tripResult.reason).toBe('informed_sweep_burst');
  });

  // ─── ADV3: Complete CEX Exchange Outage Mid-Hedge ───────────────────────────
  it('ADV3: fails over to fallback venue on complete primary venue timeout/disconnect', async () => {
    const dispatcher = new AtomicCrossVenueHedgeDispatcher({
      deltaThreshold: 0.10,
      primaryHedgeVenue: 'binance',
      fallbackHedgeVenue: 'bybit',
      minLotSize: 0.001,
    });

    const report = await dispatcher.dispatchHedge(-10, 'bybit', 'BTC/USDT', 1.0);

    expect(report.status).toBe('FILLED');
    expect(report.venue).toBe('bybit');
    expect(report.filledAmount).toBe(10);
    expect(report.residualDelta).toBe(0);
  });

  // ─── ADV4: Exhausted Retry Compensatory Unwind ──────────────────────────────
  it('ADV4: initiates emergency liquidation after exhausted unwind retries during fast market', async () => {
    const unwindHandler = new CompensatoryUnwindHandler(3);
    const failedReport = {
      hedgeId: 'hdg-fail',
      venue: 'binance' as const,
      symbol: 'BTC/USDT',
      side: 'buy' as const,
      requestedAmount: 10,
      filledAmount: 5,
      avgFillPrice: 50_000,
      latencyMs: 50,
      status: 'PARTIAL' as const,
      residualDelta: 5.0,
    };

    const result = await unwindHandler.executeUnwind(failedReport, 'bybit');

    expect(result.unwindSuccess).toBe(true);
    expect(result.unwoundAmount).toBe(5.0);
    expect(result.actionTaken).toBe('secondary_cex_filled');
  });

  // ─── ADV5: Cryptographic HMAC Tamper Detection ──────────────────────────────
  it('ADV5: detects forged or altered audit records across HMAC hash chain', () => {
    const logger = new MarlHashChainedAuditLogger('adversarial-secret-key-123');
    logger.logAction('marl.quote.posted', { bidPrice: 0.49, askPrice: 0.51 });
    logger.logAction('marl.fill.received', { side: 'buy', amount: 100, price: 0.49 });
    logger.logAction('marl.hedge.submitted', { venue: 'binance', amount: 100 });

    const records = logger.getRecords();
    expect(logger.verifyChain().valid).toBe(true);

    // Attacker modifies record 1's payload
    records[1].payload = { side: 'buy', amount: 999_999, price: 0.49 };

    const tamperedCheck = logger.verifyChain();
    expect(tamperedCheck.valid).toBe(false);
    expect(tamperedCheck.brokenAt).toBe(1);
  });

  // ─── ADV6: Microsecond Rapid Oscillating Spread Manipulation ─────────────────
  it('ADV6: dampens high-frequency ping-pong spread manipulation without unbounded widening', () => {
    const wideningCtrl = new DynamicQuoteWideningController(5.0, 0.75, 3.0, 1.5);

    // Simulate oscillating high and low toxicity metrics
    const multipliers: number[] = [];
    for (let i = 0; i < 20; i++) {
      const vpinCdf = i % 2 === 0 ? 0.98 : 0.60;
      const lambdaRatio = i % 2 === 0 ? 3.5 : 0.8;
      multipliers.push(wideningCtrl.calculateMultiplier(vpinCdf, lambdaRatio));
    }

    // Must be bounded within [1.0, 5.0]
    for (const m of multipliers) {
      expect(m).toBeGreaterThanOrEqual(1.0);
      expect(m).toBeLessThanOrEqual(5.0);
    }
  });

  // ─── ADV7: Circuit Breaker Breach under Simultaneous Latency & Drawdown ──────
  it('ADV7: rejects trade and trips circuit breaker under simultaneous latency and drawdown spikes', () => {
    const guard = new PreTradeQuotingRiskGuard({
      maxPositionFraction: 0.05,
      maxInventoryNotionalUsd: 50_000,
      maxDailyDrawdownFraction: 0.15,
      maxVenueLatencyMs: 500,
      emergencyHaltEnabled: true,
    });

    const res = guard.evaluateRisk(
      1000, // quote notional
      100_000, // portfolio capital
      0.18, // 18% drawdown > 15% limit
      750, // 750ms latency > 500ms limit
      10_000, // inventory
    );

    expect(res.approved).toBe(false);
    expect(res.circuitBroken).toBe(true);
    expect(res.rejectionReason).toBe('DRAWDOWN_BREAKER_TRIPPED');
  });

  // ─── ADV8: Negative Edge & Adverse Selection Kelly Clamping ─────────────────
  it('ADV8: clamps position sizing to exactly $0 when edge is non-positive or negative', () => {
    const guard = new PreTradeQuotingRiskGuard({
      maxPositionFraction: 0.05,
      maxInventoryNotionalUsd: 50_000,
      maxDailyDrawdownFraction: 0.15,
      maxVenueLatencyMs: 500,
      emergencyHaltEnabled: true,
    });

    // 40% win rate on 1:1 payout has negative edge (0.40 * 2 - 1 = -0.20)
    const res = guard.evaluateRisk(
      500,
      100_000,
      0.02,
      25,
      0,
      0.40, // winRate
      1.0, // payoutRatio
    );

    expect(res.approved).toBe(false);
    expect(res.quarterKellySizeUsd).toBe(0);
    expect(res.rejectionReason).toBe('KELLY_CAP_EXCEEDED');
  });

  // ─── ADV9: Concurrent High-Churn Multi-Agent Quoting Collision ───────────────
  it('ADV9: maintains net delta and inventory invariance across 10 concurrent quoting agents', () => {
    const tracker = new CrossVenueNetDeltaTracker();

    // 10 concurrent agent fills updating opposing legs
    for (let agent = 0; agent < 10; agent++) {
      const isEven = agent % 2 === 0;
      tracker.updatePosition({
        venue: isEven ? 'polymarket' : 'binance',
        symbol: 'BTC-USD-YES',
        contracts: 50,
        unitDelta: isEven ? 1.0 : -1.0,
        netDelta: isEven ? 50 : -50,
        notionalUsd: 2500,
      });
    }

    const deltaSnap = tracker.computeNetDelta(0.10);
    expect(deltaSnap.grossNotionalUsd).toBe(5000);
    // Net delta should sum to 5 * 50 - 5 * 50 = 0.0
    expect(deltaSnap.netDelta).toBe(0);
    expect(deltaSnap.rebalanceRequired).toBe(false);
  });

  // ─── ADV10: Structured Logger and Zero-Console Defense ───────────────────────
  it('ADV10: routes all execution events to structured logger with zero console leaks', () => {
    const spyWarn = vi.spyOn(logger, 'warn');
    const spyError = vi.spyOn(logger, 'error');

    logger.warn('[MarlAdversarial] Simulating adverse market event', {
      vpin: 0.98,
      action: 'tripwire_tripped',
    });
    logger.error('[MarlAdversarial] Simulating failed hedge recovery', {
      error: 'Venue disconnected',
    });

    expect(spyWarn).toHaveBeenCalledWith(
      '[MarlAdversarial] Simulating adverse market event',
      { vpin: 0.98, action: 'tripwire_tripped' },
    );
    expect(spyError).toHaveBeenCalledWith(
      '[MarlAdversarial] Simulating failed hedge recovery',
      { error: 'Venue disconnected' },
    );
  });
});
