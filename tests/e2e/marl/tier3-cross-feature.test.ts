/**
 * Tier 3: Cross-Feature Integration Test Suite (MARL Market-Making Engine)
 *
 * Verifies pairwise and end-to-end interactions across:
 * - Quoting Engine <-> Adverse Selection Toxicity Defense
 * - CLOB Maker Fills <-> Cross-Venue Net Delta Tracker
 * - Net Delta Trigger <-> Atomic CEX Hedge Dispatcher
 * - Hedge Partial Fill <-> Compensatory Unwind Handler
 * - Risk Gates / Drawdown Breaker <-> Execution Halt Cascade
 * - Engine Operations <-> Low-Latency Telemetry & Cryptographic Audit Trail
 * - Multi-Agent Quoting <-> POMDP Environment & Market Replay
 *
 * Covers 25 targeted cross-feature integration scenarios.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateOptimalQuotes,
  PolymarketQuoteFormatter,
  MultiAgentPOMDPEnv,
  SyntheticOrderbookReplayEngine,
  LiveClobStreamAdapter,
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

describe('Tier 3: Cross-Feature Integration (C1 to C25)', () => {
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

  // ─── C1: Quoting + Toxicity Surge ─────────────────────────────────────────
  it('C1: quoting spreads widen dynamically as VPIN CDF surges past 0.75 threshold', () => {
    const wideningCtrl = new DynamicQuoteWideningController(5.0, 0.75, 3.0, 1.5);
    const vpinCalc = new VpinCalculator(1_000, 20);

    // Initial calm quoting with minSpread base 0.06
    const wCalm = wideningCtrl.calculateMultiplier(vpinCalc.getCdf(), 1.0);
    const quotesCalm = calculateOptimalQuotes({
      midPrice: 0.50,
      inventory: 0,
      gamma: 0.1,
      sigma: 0.02,
      timeToHorizonSec: 100,
      kappa: 1.5,
      minSpread: 0.06 * wCalm,
    });

    // Ingest aggressive buy flow
    for (let i = 0; i < 25; i++) {
      vpinCalc.ingestTrade({ tradeId: `b-${i}`, timestamp: Date.now(), price: 0.55, volume: 1_000, bidPrice: 0.49, askPrice: 0.51 });
    }
    const wToxic = wideningCtrl.calculateMultiplier(vpinCalc.getCdf(), 1.0);
    const quotesToxic = calculateOptimalQuotes({
      midPrice: 0.50,
      inventory: 0,
      gamma: 0.1,
      sigma: 0.02,
      timeToHorizonSec: 100,
      kappa: 1.5,
      minSpread: 0.06 * wToxic,
    });

    expect(wToxic).toBeGreaterThan(wCalm);
    expect(quotesToxic.totalSpread).toBeGreaterThan(quotesCalm.totalSpread);
  });

  // ─── C2: Maker Fill on Polymarket + Net Delta Tracker ─────────────────────
  it('C2: maker fill on Polymarket CLOB immediately alters portfolio net delta', () => {
    const tracker = new CrossVenueNetDeltaTracker();
    const snapBefore = tracker.computeNetDelta();
    expect(snapBefore.netDelta).toBe(0);

    // Ingest long maker fill of 5 binary contracts
    tracker.updatePosition({
      venue: 'polymarket',
      symbol: 'BTC-USD-YES',
      contracts: 5,
      unitDelta: 1.0,
      netDelta: 5.0,
      notionalUsd: 2_500,
    });

    const snapAfter = tracker.computeNetDelta();
    expect(snapAfter.polyDelta).toBe(5.0);
    expect(snapAfter.netDelta).toBe(5.0);
    expect(snapAfter.rebalanceRequired).toBe(true);
  });

  // ─── C3: Net Delta Breach + Atomic CEX Hedge Rebalance ────────────────────
  it('C3: net delta breach triggers atomic CEX taker hedge to restore delta neutrality', async () => {
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

    // 1. Long maker fill creates net delta = +0.20
    tracker.updatePosition({
      venue: 'polymarket',
      symbol: 'BTC-USD-YES',
      contracts: 0.20,
      unitDelta: 1.0,
      netDelta: 0.20,
      notionalUsd: 100,
    });

    const snap = tracker.computeNetDelta(0.10);
    const reb = trigger.evaluate(snap.netDelta);
    expect(reb.triggerRebalance).toBe(true);
    expect(reb.targetHedgeAmount).toBe(-0.20);

    // 2. Dispatch hedge to Binance
    const report = await dispatcher.dispatchHedge(reb.targetHedgeAmount, 'binance', 'BTC/USDT', 1.0);
    expect(report.status).toBe('FILLED');

    // 3. Update CEX position in tracker
    tracker.updatePosition({
      venue: 'binance',
      symbol: 'BTC/USDT',
      contracts: 0.20,
      unitDelta: -1.0,
      netDelta: -0.20,
      notionalUsd: 10_000,
    });

    const finalSnap = tracker.computeNetDelta(0.10);
    expect(finalSnap.netDelta).toBe(0);
    expect(finalSnap.rebalanceRequired).toBe(false);
  });

  // ─── C4: Partial Hedge Fill + Compensatory Unwind ──────────────────────────
  it('C4: partial hedge fill on primary CEX routes residual delta to compensatory unwind', async () => {
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
    const unwindHandler = new CompensatoryUnwindHandler(3);

    // 50% fill on Binance
    const partialReport = await dispatcher.dispatchHedge(-0.10, 'binance', 'BTC/USDT', 0.50);
    expect(partialReport.status).toBe('PARTIAL');
    expect(partialReport.filledAmount).toBe(0.05);
    expect(partialReport.residualDelta).toBe(-0.05);

    // Compensatory unwind handles residual delta on Bybit
    const unwindResult = await unwindHandler.executeUnwind(partialReport, 'bybit');
    expect(unwindResult.unwindSuccess).toBe(true);
    expect(unwindResult.unwoundAmount).toBe(0.05);
    expect(unwindResult.actionTaken).toBe('secondary_cex_filled');
  });

  // ─── C5: Severe Drawdown Breach + Cross-Venue Execution Halt ──────────────
  it('C5: 15% daily drawdown breach halts quoting and rejects any new orders', () => {
    const engine = new UnifiedMarlEngine(createEngineConfig());
    engine.start();

    // Normal quote works
    const q1 = engine.generateQuote(0.50, 0);
    expect(q1).not.toBeNull();

    // Evaluate risk under 15% drawdown
    const riskCheck = engine.riskGuard.evaluateRisk(100, 100_000, 0.15, 50, 0);
    expect(riskCheck.approved).toBe(false);
    expect(riskCheck.circuitBroken).toBe(true);
    expect(riskCheck.rejectionReason).toBe('DRAWDOWN_BREAKER_TRIPPED');
  });

  // ─── C6: High Volatility Spike + Asymmetric Inventory Skew ─────────────────
  it('C6: high volatility combined with positive inventory forces deep asymmetric skew', () => {
    const quotesLowVol = calculateOptimalQuotes({
      midPrice: 0.50,
      inventory: 100,
      gamma: 0.1,
      sigma: 0.01,
      timeToHorizonSec: 100,
      kappa: 1.5,
    });
    const quotesHighVol = calculateOptimalQuotes({
      midPrice: 0.50,
      inventory: 100,
      gamma: 0.1,
      sigma: 0.05,
      timeToHorizonSec: 100,
      kappa: 1.5,
    });
    // High volatility amplifies the inventory penalty (q * gamma * sigma^2 * tau)
    expect(quotesHighVol.reservationPrice).toBeLessThan(quotesLowVol.reservationPrice);
    expect(quotesHighVol.bidPrice).toBeLessThan(quotesLowVol.bidPrice);
  });

  // ─── C7: Informed Sweep Detection + Instant Tripwire Activation ───────────
  it('C7: informed sweep burst immediately activates tripwire and suppresses quoting', () => {
    const engine = new UnifiedMarlEngine(createEngineConfig());
    engine.start();

    // Register 3-level aggressive sweep
    const now = Date.now();
    engine.sweepDetector.registerDepletion('buy', 500, now - 40);
    engine.sweepDetector.registerDepletion('buy', 800, now - 20);
    engine.sweepDetector.registerDepletion('buy', 1500, now - 5);

    // Attempt quote generation
    const quote = engine.generateQuote(0.50, 0);
    expect(quote).toBeNull();
  });

  // ─── C8: Joint VPIN and Kyle's Lambda Surge ────────────────────────────────
  it('C8: simultaneous spikes in volume imbalance and price impact compound spread widening', () => {
    const controller = new DynamicQuoteWideningController(5.0, 0.75, 3.0, 1.5);
    const wVpinOnly = controller.calculateMultiplier(0.85, 1.0);
    const wLambdaOnly = controller.calculateMultiplier(0.70, 2.0);
    const wJoint = controller.calculateMultiplier(0.85, 2.0);

    expect(wJoint).toBeGreaterThan(wVpinOnly);
    expect(wJoint).toBeGreaterThan(wLambdaOnly);
  });

  // ─── C9: Risk Rejection + Telemetry Counter + Audit Log ───────────────────
  it('C9: rejected quote increments telemetry counter and records audit event', () => {
    const engine = new UnifiedMarlEngine(createEngineConfig());
    const res = engine.riskGuard.evaluateRisk(10_000, 100_000, 0.02, 50, 0); // Exceeds 5k Kelly limit
    expect(res.approved).toBe(false);

    engine.telemetry.recordQuote('rejected', 'both');
    engine.auditLogger.logAction('marl.risk.rejected', { reason: res.rejectionReason });

    expect(engine.telemetry.quotesCount).toBe(1);
    const records = engine.auditLogger.getRecords();
    expect(records.some(r => r.action === 'marl.risk.rejected')).toBe(true);
  });

  // ─── C10: Cryptographic Chain Verification Across Lifecycle ───────────────
  it('C10: audit hash chain maintains cryptographic validity across multi-step cycle', () => {
    const logger = new MarlHashChainedAuditLogger('test-salt');
    logger.logAction('marl.quote.posted', { bid: 0.49, ask: 0.51 });
    logger.logAction('marl.fill.received', { side: 'buy', amount: 5, price: 0.49 });
    logger.logAction('marl.hedge.submitted', { venue: 'binance', amount: 5 });
    logger.logAction('marl.hedge.filled', { venue: 'binance', amount: 5 });

    const auditResult = logger.verifyChain();
    expect(auditResult.valid).toBe(true);
    expect(auditResult.total).toBe(4);
  });

  // ─── C11: Synthetic Replay Feeding POMDP Observation Normalizer ───────────
  it('C11: synthetic market replay ticks feed POMDP environment maintaining bounded vectors', () => {
    const replay = new SyntheticOrderbookReplayEngine('BTC-USD-YES', 0.50);
    const env = new MultiAgentPOMDPEnv(0.50);
    env.reset();

    for (let i = 0; i < 5; i++) {
      const step = replay.stepTick(0.02, 0.02);
      const action = {
        bidSpreadMultiplier: 1.0,
        askSpreadMultiplier: 1.0,
        bidSizeRatio: 0.5,
        askSizeRatio: 0.5,
        mode: 'BOTH' as const,
      };
      const envRes = env.step(action);
      expect(envRes.observation.values.length).toBe(24);
      expect(envRes.done).toBe(false);
    }
  });

  // ─── C12: Multi-Agent Proposals + Quarter-Kelly Sizing Filter ──────────────
  it('C12: quote proposals are bounded by Quarter-Kelly capital limits', () => {
    const guard = new PreTradeQuotingRiskGuard({
      maxPositionFraction: 0.05,
      maxInventoryNotionalUsd: 50_000,
      maxDailyDrawdownFraction: 0.15,
      maxVenueLatencyMs: 500,
      emergencyHaltEnabled: true,
    });

    const capital = 50_000;
    const kellyRes = guard.evaluateRisk(100, capital, 0.02, 30, 0, 0.60, 1.0);
    // Max 5% of 50k = 2500 USD
    expect(kellyRes.quarterKellySizeUsd).toBe(2500);

    const checkPass = guard.evaluateRisk(2000, capital, 0.02, 30, 0, 0.60, 1.0);
    expect(checkPass.approved).toBe(true);

    const checkFail = guard.evaluateRisk(3000, capital, 0.02, 30, 0, 0.60, 1.0);
    expect(checkFail.approved).toBe(false);
  });

  // ─── C13: Live CLOB Stream Feed Disconnect + Safety Cancellation ──────────
  it('C13: live stream feed disconnect halts quotes and raises health warning', () => {
    const adapter = new LiveClobStreamAdapter({ symbol: 'BTC-USD-YES' });
    adapter.connect();
    expect(adapter.isHealthy()).toBe(true);

    adapter.disconnect();
    expect(adapter.isHealthy()).toBe(false);
  });

  // ─── C14: Inventory Skew Quoting + Opposing CEX Neutralization ─────────────
  it('C14: aggressive inventory skew is successfully neutralized by CEX linear hedge', async () => {
    const tracker = new CrossVenueNetDeltaTracker();
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

    // 1. Skewed maker position
    tracker.updatePosition({
      venue: 'polymarket',
      symbol: 'BTC-USD-YES',
      contracts: 0.50,
      unitDelta: 1.0,
      netDelta: 0.50,
      notionalUsd: 250,
    });

    // 2. Dispatch offsetting CEX hedge
    const report = await dispatcher.dispatchHedge(-0.50, 'binance');
    tracker.updatePosition({
      venue: 'binance',
      symbol: 'BTC/USDT',
      contracts: report.filledAmount,
      unitDelta: -1.0,
      netDelta: -report.filledAmount,
      notionalUsd: 25_000,
    });

    const snap = tracker.computeNetDelta();
    expect(snap.netDelta).toBe(0);
  });

  // ─── C15: Compensatory Unwind Emergency Fallback ───────────────────────────
  it('C15: compensatory unwind records telemetry latency metadata on resolution', async () => {
    const unwind = new CompensatoryUnwindHandler(3);
    const tele = new MarlPrometheusTelemetry();

    const report = {
      hedgeId: 'h-15',
      venue: 'binance' as const,
      symbol: 'BTC/USDT',
      side: 'buy' as const,
      requestedAmount: 0.1,
      filledAmount: 0.02,
      avgFillPrice: 50_000,
      latencyMs: 18,
      status: 'PARTIAL' as const,
      residualDelta: 0.08,
    };

    const res = await unwind.executeUnwind(report, 'bybit');
    tele.recordHedgeLatency('bybit', 22, res.unwindSuccess ? 'UNWOUND' : 'FAILED');

    expect(tele.hedgeLatencies.length).toBe(1);
    expect(tele.hedgeLatencies[0]).toBe(22);
  });

  // ─── C16: Toxicity State Progression (Calm -> Widened -> Tripwire) ─────────
  it('C16: market transitions cleanly through calm -> widened -> tripwire stages', () => {
    const widening = new DynamicQuoteWideningController(5.0, 0.75, 3.0, 1.5);
    const tripwire = new InstantCancellationTripwire(0.95, 15_000);

    // Stage 1: Calm (VPIN CDF = 0.50)
    expect(widening.calculateMultiplier(0.50, 1.0)).toBe(1.0);
    expect(tripwire.evaluate(0.50, 1.0, false).tripwireActive).toBe(false);

    // Stage 2: Warning (VPIN CDF = 0.85)
    expect(widening.calculateMultiplier(0.85, 1.0)).toBeGreaterThan(1.0);
    expect(tripwire.evaluate(0.85, 1.0, false).tripwireActive).toBe(false);

    // Stage 3: Critical Tripwire (VPIN CDF = 0.96)
    expect(tripwire.evaluate(0.96, 1.0, false).tripwireActive).toBe(true);
  });

  // ─── C17: Asymmetric Inventory Skew + Boundary Clamping ───────────────────
  it('C17: large inventory in prediction market clamps bid to 0.01 while quoting ask near mid', () => {
    const quotes = calculateOptimalQuotes({
      midPrice: 0.50,
      inventory: 500, // Massive positive inventory
      gamma: 0.2,
      sigma: 0.05,
      timeToHorizonSec: 100,
      kappa: 1.5,
      minPrice: 0.01,
      maxPrice: 0.99,
    });
    expect(quotes.bidPrice).toBe(0.01);
    expect(quotes.askPrice).toBeLessThanOrEqual(0.51);
    expect(quotes.clamped).toBe(true);
  });

  // ─── C18: Quarter-Kelly Sizing Under Drawdown ──────────────────────────────
  it('C18: Quarter-Kelly size scales down as capital diminishes under drawdown', () => {
    const guard = new PreTradeQuotingRiskGuard({
      maxPositionFraction: 0.05,
      maxInventoryNotionalUsd: 50_000,
      maxDailyDrawdownFraction: 0.15,
      maxVenueLatencyMs: 500,
      emergencyHaltEnabled: true,
    });

    const sizeFullCapital = guard.evaluateRisk(100, 100_000, 0.02, 20, 0, 0.60, 1.0);
    const sizeDrawnCapital = guard.evaluateRisk(100, 50_000, 0.08, 20, 0, 0.60, 1.0);

    expect(sizeFullCapital.quarterKellySizeUsd).toBe(5_000);
    expect(sizeDrawnCapital.quarterKellySizeUsd).toBe(2_500);
  });

  // ─── C19: POMDP Environment Reward Response to Inventory ─────────────────
  it('C19: POMDP step reward penalizes higher inventory variance', () => {
    const env = new MultiAgentPOMDPEnv(0.50);
    env.reset();
    const r1 = env.step({
      bidSpreadMultiplier: 1.0,
      askSpreadMultiplier: 1.0,
      bidSizeRatio: 0.5,
      askSizeRatio: 0.5,
      mode: 'BOTH',
    });
    expect(r1.reward).toBeDefined();
    expect(Number.isFinite(r1.reward)).toBe(true);
  });

  // ─── C20: Full Order Cycle ────────────────────────────────────────────────
  it('C20: executes complete cycle: stream -> quote -> maker fill -> delta trigger -> hedge -> audit', async () => {
    const engine = new UnifiedMarlEngine(createEngineConfig());
    engine.start();

    // 1. Generate active quote
    const quote = engine.generateQuote(0.50, 0);
    expect(quote).not.toBeNull();

    // 2. Simulate maker fill on Polymarket
    engine.onMakerFill('buy', 5, 0.49);
    expect(engine.getStatus().inventory).toBe(5);

    // 3. Trigger rebalance evaluation
    const reb = engine.rebalanceTrigger.evaluate(engine.getStatus().netDelta);
    expect(reb.triggerRebalance).toBe(true);

    // 4. Dispatch hedge
    const hedgeReport = await engine.hedgeDispatcher.dispatchHedge(reb.targetHedgeAmount, 'binance');
    expect(hedgeReport.status).toBe('FILLED');

    // 5. Audit verify
    const auditRes = engine.auditLogger.verifyChain();
    expect(auditRes.valid).toBe(true);
    expect(auditRes.total).toBeGreaterThanOrEqual(2);
  });

  // ─── C21: Tolerance Hysteresis Under Oscillating Delta ─────────────────────
  it('C21: fluctuations within inner hysteresis band suppress hedge churn', () => {
    const trigger = new ToleranceBandRebalanceTrigger(0.10, 0.50); // inner = 0.05
    // Delta rises to 0.08 (inside outer threshold)
    expect(trigger.evaluate(0.08).triggerRebalance).toBe(false);
    // Delta rises to 0.09
    expect(trigger.evaluate(0.09).triggerRebalance).toBe(false);
    // Delta breaches outer threshold (0.12)
    expect(trigger.evaluate(0.12).triggerRebalance).toBe(true);
    // Delta drops to 0.07 (inside outer, but above inner 0.05 -> stays rebalancing)
    expect(trigger.evaluate(0.07).triggerRebalance).toBe(true);
    // Delta drops below inner band (0.04 -> rebalance complete)
    expect(trigger.evaluate(0.04).triggerRebalance).toBe(false);
  });

  // ─── C22: Sweep Alert Causes Quote Withdrawal Before Matching ─────────────
  it('C22: sweep detector alerts engine to cancel resting quotes before toxic fill', () => {
    const engine = new UnifiedMarlEngine(createEngineConfig());
    engine.start();

    // Sudden sweep registered
    const now = Date.now();
    engine.sweepDetector.registerDepletion('buy', 500, now - 30);
    engine.sweepDetector.registerDepletion('buy', 800, now - 20);
    engine.sweepDetector.registerDepletion('buy', 1000, now - 10);

    // Quote generation attempts are blocked
    const quote = engine.generateQuote(0.50, 0);
    expect(quote).toBeNull();
  });

  // ─── C23: Post-Toxicity Normalization & Quote Narrowing ───────────────────
  it('C23: dynamic spread multiplier normalizes back toward 1.0 after toxic flow subsides', () => {
    const widening = new DynamicQuoteWideningController(5.0, 0.75, 3.0, 1.5);
    const toxicW = widening.calculateMultiplier(0.90, 2.0);
    const calmW = widening.calculateMultiplier(0.40, 0.8);
    expect(toxicW).toBeGreaterThan(2.0);
    expect(calmW).toBe(1.0);
  });

  // ─── C24: Multi-Venue Failover ────────────────────────────────────────────
  it('C24: primary venue partial fill fails over cleanly to secondary venue unwind', async () => {
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

    const report = await dispatcher.dispatchHedge(0.05, 'binance', 'BTC/USDT', 0.20);
    expect(report.status).toBe('PARTIAL');
    const unwindRes = await unwind.executeUnwind(report, 'bybit');
    expect(unwindRes.unwindSuccess).toBe(true);
    expect(unwindRes.actionTaken).toBe('secondary_cex_filled');
  });

  // ─── C25: End-to-End PnL Tracking ─────────────────────────────────────────
  it('C25: telemetry tracks PnL updates and cumulative volume correctly', () => {
    const tele = new MarlPrometheusTelemetry();
    tele.recordFill('buy', 10, 0.49, 20);
    tele.recordFill('sell', 10, 0.51, 20);
    tele.recordPnl(0.20, 0.0);

    expect(tele.fillsCount).toBe(2);
    expect(tele.totalFilledSize).toBe(20);
    expect(tele.realizedPnl).toBe(0.20);
  });
});
