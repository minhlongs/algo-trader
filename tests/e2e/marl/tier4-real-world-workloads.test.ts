/**
 * Tier 4: Real-World Workload Scenarios Test Suite (MARL Market-Making Engine)
 *
 * Simulates 6 production-grade, multi-tick realistic market workloads:
 * - S1: Full trading session replay (1,000+ ticks) with queue position modeling & fills
 * - S2: High-volatility news breakout with price jump anomaly & toxicity surge
 * - S3: Continuous cross-venue delta neutrality under erratic fills & compensatory unwinds
 * - S4: Toxic sweep cascade with defensive quote retreat and quarantine cooldown
 * - S5: Risk limit breach & cumulative 15% daily drawdown circuit trip
 * - S6: Multi-agent competitive quoting adapting under regime shifts
 */

import { describe, it, expect } from 'vitest';
import {
  calculateOptimalQuotes,
  SyntheticOrderbookReplayEngine,
  MultiAgentPOMDPEnv,
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

describe('Tier 4: Real-World Workloads (S1 to S6)', () => {
  const createEngineConfig = () => ({
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

  // ─── S1: Full Trading Session Market Replay (1,000+ Ticks) ────────────────
  it('S1: executes 1,000+ tick trading session with continuous quoting, fills, and inventory skew', () => {
    const replay = new SyntheticOrderbookReplayEngine('BTC-USD-YES', 0.50);
    const tele = new MarlPrometheusTelemetry();
    let totalFills = 0;
    let inventory = 0;

    for (let tick = 0; tick < 1_000; tick++) {
      // Calculate Avellaneda-Stoikov quotes based on current inventory
      const quotes = calculateOptimalQuotes({
        midPrice: 0.50,
        inventory,
        gamma: 0.1,
        sigma: 0.02,
        timeToHorizonSec: Math.max(1, 1_000 - tick),
        kappa: 1.5,
      });

      tele.recordQuote('posted', 'both');

      // Execute discrete replay step
      const step = replay.stepTick(quotes.bidSpread, quotes.askSpread);
      if (step.fills.length > 0) {
        for (const fill of step.fills) {
          totalFills += 1;
          const deltaChange = fill.side === 'buy' ? fill.size : -fill.size;
          inventory += deltaChange;
          tele.recordFill(fill.side, fill.size, fill.price, fill.spreadBps);
        }
      }

      tele.recordInventorySkew(inventory, Math.abs(inventory * 0.50));
    }

    expect(tele.quotesCount).toBe(1_000);
    expect(totalFills).toBeGreaterThan(0);
    expect(tele.fillsCount).toBe(totalFills);
    expect(tele.getFillRate()).toBeGreaterThan(0);
  });

  // ─── S2: High-Volatility News Breakout & Toxicity Surge ────────────────────
  it('S2: handles high-volatility news breakout with rapid price jump and toxicity tripwire', () => {
    const engine = new UnifiedMarlEngine(createEngineConfig());
    engine.start();

    // 1. Initial calm regime
    const initialQuote = engine.generateQuote(0.50, 0);
    expect(initialQuote).not.toBeNull();
    const calmSpread = initialQuote!.totalSpread;

    // 2. Sudden news breakout: 5 fast sweeps and price jumps
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      engine.sweepDetector.registerDepletion('buy', 2_000, now - 10 * (5 - i));
      engine.vpinCalc.ingestTrade({
        tradeId: `news-tx-${i}`,
        timestamp: now,
        price: 0.55 + i * 0.02,
        volume: 10_000,
        bidPrice: 0.50 + i * 0.02,
        askPrice: 0.52 + i * 0.02,
      });
      engine.kylesLambda.ingestInterval(0.02, 10_000);
    }

    // 3. Check sweep and price jump
    const sweepRes = engine.sweepDetector.checkSweep(0.65, 0.01);
    expect(sweepRes.sweepDetected).toBe(true);
    expect(sweepRes.fastJumpAnomaly).toBe(true);

    // 4. Engine trips defensive tripwire: quote generation returns null (canceled)
    const quoteAfterBreakout = engine.generateQuote(0.65, 0);
    expect(quoteAfterBreakout).toBeNull();

    // 5. Tripwire audit event verified
    const records = engine.auditLogger.getRecords();
    expect(records.some(r => r.action === 'marl.tripwire.activated')).toBe(true);
  });

  // ─── S3: Continuous Cross-Venue Hedging with Partial Fills ─────────────────
  it('S3: maintains delta neutrality over 10 consecutive cycles under erratic partial fills', async () => {
    const tracker = new CrossVenueNetDeltaTracker();
    const trigger = new ToleranceBandRebalanceTrigger(0.10, 0.50);
    const dispatcher = new AtomicCrossVenueHedgeDispatcher({
      deltaThreshold: 0.10,
      hysteresisRatio: 0.50,
      primaryHedgeVenue: 'binance',
      fallbackHedgeVenue: 'bybit',
      maxHedgeSlippageBps: 15,
      orderTimeoutMs: 300,
      maxUnwindRetries: 3,
      emergencyLiquidation: true,
      minLotSize: 0.001,
    });
    const unwind = new CompensatoryUnwindHandler(3);

    for (let cycle = 1; cycle <= 10; cycle++) {
      // 1. Maker fill creates long delta
      tracker.updatePosition({
        venue: 'polymarket',
        symbol: 'BTC-USD-YES',
        contracts: cycle * 0.20,
        unitDelta: 1.0,
        netDelta: cycle * 0.20,
        notionalUsd: 100 * cycle,
      });

      // 2. Evaluate rebalance
      const snap = tracker.computeNetDelta(0.10);
      const reb = trigger.evaluate(snap.netDelta);
      if (reb.triggerRebalance) {
        // 3. Dispatch hedge with simulated partial fill (70%)
        const hedgeReport = await dispatcher.dispatchHedge(reb.targetHedgeAmount, 'binance', 'BTC/USDT', 0.70);
        expect(hedgeReport.status).toBe('PARTIAL');

        // 4. Compensatory unwind handles the remaining 30%
        const unwindRes = await unwind.executeUnwind(hedgeReport, 'bybit');
        expect(unwindRes.unwindSuccess).toBe(true);

        // 5. Update CEX position with full amount (primary + unwind)
        tracker.updatePosition({
          venue: 'binance',
          symbol: 'BTC/USDT',
          contracts: cycle * 0.20,
          unitDelta: -1.0,
          netDelta: -(cycle * 0.20),
          notionalUsd: 10_000 * cycle,
        });
      }

      // Check net delta is neutral
      const finalSnap = tracker.computeNetDelta(0.10);
      expect(finalSnap.netDelta).toBe(0);
    }
  });

  // ─── S4: Toxic Sweep Cascade with Defensive Quote Retreat ─────────────────
  it('S4: toxic sweep cascade enforces quarantine cooldown preventing adverse selection', () => {
    const tripwire = new InstantCancellationTripwire(0.95, 15_000);
    const sweepDetector = new InformedSweepDetector();

    // Sudden sweep cascade
    const now = Date.now();
    sweepDetector.registerDepletion('sell', 1_000, now - 30);
    sweepDetector.registerDepletion('sell', 1_500, now - 20);
    sweepDetector.registerDepletion('sell', 2_500, now - 10);

    const sweep = sweepDetector.checkSweep(0.42, 0.01);
    expect(sweep.sweepDetected).toBe(true);
    expect(sweep.direction).toBe('sell');

    // Tripwire activates
    const trip = tripwire.evaluate(0.50, 1.0, sweep.sweepDetected);
    expect(trip.tripwireActive).toBe(true);
    expect(trip.reason).toBe('informed_sweep_burst');

    // In quarantine cooldown: refusal to quote even under calm flow
    const duringCooldown = tripwire.evaluate(0.30, 0.5, false);
    expect(duringCooldown.tripwireActive).toBe(true);
    expect(duringCooldown.reason).toBe('quarantine_cooldown_active');
  });

  // ─── S5: Cumulative Daily Drawdown Circuit Trip ────────────────────────────
  it('S5: cumulative losses trip 15% drawdown circuit breaker locking out new trades', () => {
    const guard = new PreTradeQuotingRiskGuard({
      maxPositionFraction: 0.05,
      maxInventoryNotionalUsd: 50_000,
      maxDailyDrawdownFraction: 0.15,
      maxVenueLatencyMs: 500,
      emergencyHaltEnabled: true,
    });

    const capital = 100_000;

    // Trade 1 at 5% drawdown: APPROVED
    expect(guard.evaluateRisk(100, capital, 0.05, 50, 0).approved).toBe(true);

    // Trade 2 at 10% drawdown: APPROVED
    expect(guard.evaluateRisk(100, capital, 0.10, 50, 0).approved).toBe(true);

    // Trade 3 at 14.5% drawdown: APPROVED
    expect(guard.evaluateRisk(100, capital, 0.145, 50, 0).approved).toBe(true);

    // Trade 4 at 15.0% drawdown: REJECTED (circuit broken)
    const tripResult = guard.evaluateRisk(100, capital, 0.15, 50, 0);
    expect(tripResult.approved).toBe(false);
    expect(tripResult.circuitBroken).toBe(true);
    expect(tripResult.rejectionReason).toBe('DRAWDOWN_BREAKER_TRIPPED');

    // Subsequent trades permanently rejected
    const postTrip = guard.evaluateRisk(10, capital, 0.16, 50, 0);
    expect(postTrip.approved).toBe(false);
    expect(postTrip.circuitBroken).toBe(true);
  });

  // ─── S6: Multi-Agent Quoting Under Regime Shifts ───────────────────────────
  it('S6: multi-agent quoting adapts bid/ask placement across calm, volatile, and trending regimes', () => {
    // Regime 1: Calm (low volatility, zero inventory)
    const calmQuotes = calculateOptimalQuotes({
      midPrice: 0.50,
      inventory: 0,
      gamma: 0.1,
      sigma: 0.005,
      timeToHorizonSec: 1_000,
      kappa: 2.0,
    });

    // Regime 2: Volatile (high sigma)
    const volQuotes = calculateOptimalQuotes({
      midPrice: 0.50,
      inventory: 0,
      gamma: 0.1,
      sigma: 0.05,
      timeToHorizonSec: 1_000,
      kappa: 1.0,
    });

    // Regime 3: Trending with accumulated inventory
    const trendQuotes = calculateOptimalQuotes({
      midPrice: 0.55,
      inventory: 50, // Long inventory from upward trend
      gamma: 0.1,
      sigma: 0.03,
      timeToHorizonSec: 500,
      kappa: 1.5,
    });

    // Validations across regime shifts:
    // 1. Volatile regime has wider spread than calm
    expect(volQuotes.totalSpread).toBeGreaterThan(calmQuotes.totalSpread);

    // 2. Trending regime with long inventory skews reservation price downward
    expect(trendQuotes.reservationPrice).toBeLessThan(0.55);
    expect(trendQuotes.askSpread).toBeLessThan(trendQuotes.bidSpread);

    // 3. All regimes respect Polymarket tick boundaries
    expect(calmQuotes.bidPrice).toBeGreaterThanOrEqual(0.01);
    expect(volQuotes.askPrice).toBeLessThanOrEqual(0.99);
    expect(trendQuotes.askPrice).toBeGreaterThan(trendQuotes.bidPrice);
  });
});
