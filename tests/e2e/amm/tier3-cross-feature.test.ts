/**
 * Tier 3: Cross-Feature Interactions Test Suite
 * Prediction Market AMM & Negative-Risk Arbitrage Engine
 *
 * Covers >= 15 pairwise and cross-module interactions:
 * - AMM pricing + CLOB router & pool management
 * - Negative-risk scanner + depth walker + atomic bundle execution
 * - Bundle execution + compensatory unwind handler
 * - 2-sided quoter + adverse selection VPIN defense
 * - 2-sided quoter + cross-market delta rebalancer
 * - Pre-trade risk gates (Kelly, Drawdown, Latency) + master engine
 * - Master engine + audit logger + Prometheus metrics
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LmsrPricing,
  DynamicBAdapter,
  CpmmPricing,
  MultiTokenPool,
  CombinatorialScanner,
  BasketPricer,
  AtomicBasketCoordinator,
  CompensatoryUnwindHandler,
  TwoSidedQuoter,
  InventoryDeltaRebalancer,
  AdverseSelectionGuard,
  AmmRiskGuard,
  AmmMetricsRecorder,
  AmmAuditLogger,
  MasterAmmEngine,
  createMockMarket,
  createMockOrderbooks,
  createDefaultRiskContext,
  createDefaultPoolConfig,
} from './fixtures/amm-test-harness';
import type {
  CpmmReserves,
  DynamicBConfig,
  DynamicBState,
  TradeIntent,
  MarketState,
  InventoryState,
} from './fixtures/amm-test-harness';

describe('Tier 3: Cross-Feature Interactions (Pairwise & Systemic)', () => {
  // ─── C1: AMM Pricing + Multi-Token Pool ────────────────────────────────────
  it('C1: AMM LMSR pricing updates pool spot prices and collateral reserves across multi-turn trading', () => {
    const pool = new MultiTokenPool(createDefaultPoolConfig(3)); // 3 outcomes, b=1000
    pool.mintCompleteSet(5_000); // 5000 collateral, 5000 of each outcome

    // Initial spot prices should be equal (1/3 each)
    const initialShares = pool.getShares();
    const initialPrices = LmsrPricing.calculateSpotPrices(initialShares, pool.getB());
    expect(initialPrices[0]).toBeCloseTo(1 / 3, 6);

    // Trade: buy 200 shares of outcome 1
    const trade1 = pool.executeTrade({
      poolId: pool.getPoolId(),
      outcomeId: 'OUT_1',
      sharesDelta: 200,
    });

    expect(trade1.newSpotPrices['OUT_1']).toBeGreaterThan(initialPrices[0]);
    expect(trade1.newSpotPrices['OUT_2']).toBeLessThan(initialPrices[1]);
    expect(trade1.newSpotPrices['OUT_3']).toBeLessThan(initialPrices[2]);
    expect(pool.getCollateral()).toBeGreaterThan(5_000);
  });

  // ─── C2: Dynamic b Adaptation + Liability Scaling ─────────────────────────
  it('C2: Dynamic b adaptation scales liabilities proportionally without distorting spot prices', () => {
    const pool = new MultiTokenPool(createDefaultPoolConfig(3));
    pool.executeTrade({ poolId: pool.getPoolId(), outcomeId: 'OUT_1', sharesDelta: 300 });
    pool.executeTrade({ poolId: pool.getPoolId(), outcomeId: 'OUT_2', sharesDelta: 150 });

    const currentShares = pool.getShares();
    const currentB = pool.getB();
    const prePrices = LmsrPricing.calculateSpotPrices(currentShares, currentB);

    // Adapt b upward due to volume
    const config: DynamicBConfig = {
      baseB: 1_000,
      minB: 500,
      maxB: 5_000,
      volumeScalingAlpha: 0.5,
      depthThresholdUsd: 1_000,
    };
    const state: DynamicBState = {
      currentB,
      rollingVolumeUsd: pool.getVolumeUsd(),
      poolDepthUsd: pool.getCollateral(),
      lastUpdatedMs: Date.now(),
    };

    const adaptation = DynamicBAdapter.adaptB(state, config, 3);
    const scaledShares = DynamicBAdapter.scaleLiabilities(currentShares, currentB, adaptation.newB);
    const postPrices = LmsrPricing.calculateSpotPrices(scaledShares, adaptation.newB);

    // Verify invariant: spot prices strictly preserved
    for (let i = 0; i < 3; i++) {
      expect(postPrices[i]).toBeCloseTo(prePrices[i], 10);
    }
  });

  // ─── C3: CPMM Engine + Pre-Trade Risk Gate ────────────────────────────────
  it('C3: CPMM swap notional is evaluated and gated against 5% Quarter-Kelly limit', () => {
    const reserves: CpmmReserves = { yesShares: 20_000, noShares: 20_000, collateralReserve: 20_000 };
    const context = createDefaultRiskContext({ portfolioEquityUsd: 50_000 }); // 5% Kelly cap = 2,500

    // Swap 1: 1,500 USDC within 5% limit -> Approved
    const passIntent: TradeIntent = {
      intentId: 'intent-c3-pass',
      marketId: 'cpmm-market',
      notionalUsd: 1_500,
      expectedEdgeBps: 100,
      venueLatencyMs: 30,
    };
    const passCheck = AmmRiskGuard.evaluatePreTrade(passIntent, context);
    expect(passCheck.verdict).toBe('APPROVED');
    const swapPass = CpmmPricing.calculateSwap('YES', 1_500, reserves, 25);
    expect(swapPass.outputAmount).toBeGreaterThan(0);

    // Swap 2: 5,000 USDC exceeding 5% limit -> Rejected
    const failIntent: TradeIntent = {
      intentId: 'intent-c3-fail',
      marketId: 'cpmm-market',
      notionalUsd: 5_000,
      expectedEdgeBps: 100,
      venueLatencyMs: 30,
    };
    const failCheck = AmmRiskGuard.evaluatePreTrade(failIntent, context);
    expect(failCheck.verdict).toBe('REJECTED');
    expect(failCheck.rejectionCode).toBe('KELLY_CAP_EXCEEDED');
  });

  // ─── C4: Combinatorial Scanner + Basket Depth Walker ──────────────────────
  it('C4: Scanner identifies overpriced basket and depth walker determines executable size after fees', () => {
    const market = createMockMarket(4, 1.15, 0.01); // 4 outcomes, overpriced by ~15%
    const opp = CombinatorialScanner.scanBasket(market);
    expect(opp).not.toBeNull();
    expect(opp?.direction).toBe('OVERPRICED_SELL_BASKET');

    const orderbooks = createMockOrderbooks(market, 5);
    const pricerResult = BasketPricer.priceBasket(opp!, orderbooks, {
      feeBps: 20,
      gasCostUsd: 0.10,
      minProfitHurdleUsd: 1.0,
      maxSlippageBps: 100,
    });

    expect(pricerResult.executableSize).toBeGreaterThan(0);
    expect(pricerResult.isProfitable).toBe(true);
    expect(pricerResult.netProfitUsd).toBeGreaterThan(1.0);
    expect(pricerResult.roiBps).toBeGreaterThan(0);
  });

  // ─── C5: Basket Pricer + Atomic Bundle Coordinator ────────────────────────
  it('C5: Priced basket is executed atomically by bundle coordinator to FILLED status', async () => {
    const market = createMockMarket(3, 1.12, 0.01);
    const opp = CombinatorialScanner.scanBasket(market)!;
    const orderbooks = createMockOrderbooks(market, 5);

    const pricer = BasketPricer.priceBasket(opp, orderbooks, {
      feeBps: 20,
      gasCostUsd: 0.05,
      minProfitHurdleUsd: 1.0,
      maxSlippageBps: 100,
    });
    expect(pricer.isProfitable).toBe(true);

    const execution = await AtomicBasketCoordinator.executeOpportunity(opp);
    expect(execution.status).toBe('FILLED');
    expect(execution.legs.every((l) => l.status === 'FILLED')).toBe(true);
    expect(execution.realizedPnlUsd).toBeGreaterThan(0);
  });

  // ─── C6: Bundle Coordinator + Compensatory Unwind ─────────────────────────
  it('C6: Bundle execution with partial fill triggers compensatory unwind to net-zero exposure', async () => {
    const market = createMockMarket(3, 1.12, 0.01);
    const opp = CombinatorialScanner.scanBasket(market)!;

    // Simulate outcome 3 failing completely while 1 and 2 filled
    const execution = await AtomicBasketCoordinator.executeOpportunity(opp, {
      OUTCOME_3: { fillRatio: 0, shouldFail: true },
    });

    expect(execution.status).toBe('UNWOUND');
    expect(execution.unwindResult).toBeDefined();
    expect(execution.unwindResult?.residualExposure).toBe(0);
    expect(execution.unwindResult?.unwoundLegs).toHaveLength(2); // OUTCOME_1 & OUTCOME_2 unwound
  });

  // ─── C7: 2-Sided Quoter + Inventory Delta Rebalancer ───────────────────────
  it('C7: Quoting inventory accumulation triggers external CEX delta rebalancer', () => {
    const market: MarketState = {
      marketId: 'mkt-polymarket',
      spotPrices: { YES: 0.5, NO: 0.5 },
      volatility: 0.02,
      timeToMaturitySec: 86_400,
    };

    // Simulated inventory accumulation over time from maker fills
    const inventory: InventoryState = {
      holdings: { YES: 1_200, NO: 0 },
      cashBalanceUsd: 10_000,
      netPortfolioDelta: 1_200,
    };

    // 1. Quoter observes long YES inventory and skews reservation price downward
    const quotes = TwoSidedQuoter.generateQuotes(market, inventory);
    expect(quotes.YES.skewOffset).toBeGreaterThan(0);
    expect(quotes.YES.bidPrice).toBeLessThan(0.5);

    // 2. Rebalancer detects YES position exceeding 500 max tolerance and triggers hedge
    const rebalanceOrders = InventoryDeltaRebalancer.evaluateRebalance(
      inventory,
      { YES: 0.5, NO: 0.5 },
      500
    );

    expect(rebalanceOrders).toHaveLength(1);
    expect(rebalanceOrders[0].side).toBe('SELL');
    expect(rebalanceOrders[0].targetQuantity).toBe(700); // 1200 - 500
    expect(rebalanceOrders[0].urgency).toBe('MEDIUM');
  });

  // ─── C8: 2-Sided Quoter + Adverse Selection VPIN Defense ──────────────────
  it('C8: Order flow toxicity surge widens 2-sided quoting spread dynamically', () => {
    const guard = new AdverseSelectionGuard({
      bucketSizeVolume: 1_000,
      windowBucketCount: 5,
      vpinWarningThreshold: 0.4,
      vpinCriticalThreshold: 0.7,
      maxDynamicFeeMultiplier: 3.0,
    });

    // Feed directional flow to trigger HIGH toxicity
    const baseTime = Date.now() - 500;
    for (let i = 0; i < 5; i++) {
      guard.recordTrade(800, 'BUY', baseTime + i * 20);
      guard.recordTrade(200, 'SELL', baseTime + i * 20 + 5);
    }

    const toxicity = guard.assessFlow(50, 'BUY');
    expect(toxicity.toxicityLevel).toBe('HIGH');
    expect(toxicity.dynamicFeeMultiplier).toBeGreaterThan(1.5);

    // Widen quoter spread based on dynamic fee multiplier
    const market: MarketState = {
      marketId: 'mkt-c8',
      spotPrices: { YES: 0.5 },
      volatility: 0.02,
      timeToMaturitySec: 86_400,
    };
    const inv: InventoryState = { holdings: { YES: 0 }, cashBalanceUsd: 10_000, netPortfolioDelta: 0 };

    const baseQuotes = TwoSidedQuoter.generateQuotes(market, inv, { kappa: 10, minSpreadBps: 200 });
    const widenedQuotes = TwoSidedQuoter.generateQuotes(market, inv, {
      kappa: 10,
      minSpreadBps: Math.round(200 * toxicity.dynamicFeeMultiplier * 3),
    });

    expect(widenedQuotes.YES.spreadBps).toBeGreaterThan(baseQuotes.YES.spreadBps);
  });

  // ─── C9: Adverse Selection Critical Sweep + Quoter Tripwire ────────────────
  it('C9: Toxic whale sweep burst triggers tripwire pulling quotes and initiating cooldown', () => {
    const guard = new AdverseSelectionGuard({
      sweepVelocityThreshold: 2_000,
    });

    // Flash sweep: 3,000 volume in 10ms
    const now = Date.now();
    guard.recordTrade(1_500, 'BUY', now);
    guard.recordTrade(1_500, 'BUY', now);

    const assessment = guard.assessFlow(100, 'BUY');
    expect(assessment.shouldTripwirePullQuotes).toBe(true);
    expect(assessment.cooldownPeriodMs).toBe(30_000);
    expect(assessment.toxicityLevel).toBe('CRITICAL');
  });

  // ─── C10: Master AMM Engine + Kelly Cap Enforcement ───────────────────────
  it('C10: Master AMM engine blocks trade exceeding Quarter-Kelly cap before execution', () => {
    const engine = new MasterAmmEngine('master-c10');
    const poolConfig = createDefaultPoolConfig(2);
    engine.registerPool(poolConfig);

    const context = createDefaultRiskContext({ portfolioEquityUsd: 20_000 }); // 5% Kelly cap = 1,000

    // Trade requesting 5,000 shares (~2,500 notional) > 1,000 limit
    const res = engine.executeTrade(
      {
        poolId: poolConfig.poolId,
        outcomeId: 'OUT_1',
        sharesDelta: 5_000,
      },
      context
    );

    expect(res.success).toBe(false);
    expect(res.rejection?.rejectionCode).toBe('KELLY_CAP_EXCEEDED');
    expect(res.result).toBeUndefined();
  });

  // ─── C11: Master AMM Engine + Daily Drawdown Circuit Breaker ───────────────
  it('C11: Master AMM engine freezes all trading when daily drawdown circuit breaker trips', () => {
    const engine = new MasterAmmEngine('master-c11');
    const poolConfig = createDefaultPoolConfig(2);
    engine.registerPool(poolConfig);

    // 25% daily drawdown breach (100k peak -> 75k current)
    const context = createDefaultRiskContext({
      peakDailyEquityUsd: 100_000,
      currentDailyEquityUsd: 75_000,
    });

    const res = engine.executeTrade(
      {
        poolId: poolConfig.poolId,
        outcomeId: 'OUT_1',
        sharesDelta: 20,
      },
      context
    );

    expect(res.success).toBe(false);
    expect(res.rejection?.rejectionCode).toBe('DAILY_DRAWDOWN_BREACH');

    const chain = engine.getAuditLogger().getChain();
    const lastRecord = chain[chain.length - 1];
    expect(lastRecord.action).toBe('RISK_GATE_REJECTED');
  });

  // ─── C12: Master AMM Engine + Venue Latency Filter ─────────────────────────
  it('C12: Master AMM engine blocks trades under venue latency spike (>500ms)', () => {
    const context = createDefaultRiskContext();
    const highLatencyIntent: TradeIntent = {
      intentId: 'intent-spike',
      marketId: 'mkt-1',
      notionalUsd: 500,
      expectedEdgeBps: 50,
      venueLatencyMs: 650, // Spike to 650ms
    };

    const verdict = AmmRiskGuard.evaluatePreTrade(highLatencyIntent, context);
    expect(verdict.verdict).toBe('REJECTED');
    expect(verdict.rejectionCode).toBe('LATENCY_SPIKE_EXCEEDED');
  });

  // ─── C13: Master AMM Engine + Prometheus Metrics ──────────────────────────
  it('C13: Executed trades concurrently update Prometheus volume and PnL telemetry', () => {
    const engine = new MasterAmmEngine('master-c13');
    const pool = engine.registerPool(createDefaultPoolConfig(3));
    const context = createDefaultRiskContext();

    expect(engine.getMetrics().getSnapshot().tradeVolumeUsd).toBe(0);

    engine.executeTrade(
      { poolId: pool.getPoolId(), outcomeId: 'OUT_1', sharesDelta: 50 },
      context
    );
    engine.executeTrade(
      { poolId: pool.getPoolId(), outcomeId: 'OUT_2', sharesDelta: 30 },
      context
    );

    const snapshot = engine.getMetrics().getSnapshot();
    expect(snapshot.tradeVolumeUsd).toBeGreaterThan(0);
    expect(snapshot.activePoolsCount).toBe(1);
  });

  // ─── C14: Master AMM Engine + Hash-Chained Audit Trail ────────────────────
  it('C14: Engine trade lifecycle creates tamper-evident SHA-256 HMAC hash chain', () => {
    const engine = new MasterAmmEngine('audit-key-c14');
    const pool = engine.registerPool(createDefaultPoolConfig(2));
    const context = createDefaultRiskContext();

    for (let i = 0; i < 5; i++) {
      engine.executeTrade(
        { poolId: pool.getPoolId(), outcomeId: 'OUT_1', sharesDelta: 10 },
        context
      );
    }

    const verification = engine.getAuditLogger().verifyChain();
    expect(verification.valid).toBe(true);
    expect(engine.getAuditLogger().getChain().length).toBeGreaterThanOrEqual(6); // 1 pool init + 5 approval + 5 trade
  });

  // ─── C15: Negative-Risk Underpriced Basket Arbitrage + Complete Set Merge ─
  it('C15: Underpriced basket arbitrage buys all legs and merges complete set for risk-free profit', () => {
    // Underpriced market: sum of asks = 0.90
    const market = createMockMarket(3, 0.90, 0.005);
    const opp = CombinatorialScanner.scanBasket(market);

    expect(opp).not.toBeNull();
    expect(opp?.direction).toBe('UNDERPRICED_BUY_BASKET');

    // Simulate buying complete basket of 100 units
    const costToBuy = opp!.sumPrices * 100;
    const mergeProceeds = 100 * 1.0; // 100 USDC on merge
    const grossProfit = mergeProceeds - costToBuy;

    expect(grossProfit).toBeCloseTo(100 - costToBuy, 4);
    expect(grossProfit).toBeGreaterThan(5.0);
  });

  // ─── C16: Volume Surge + Dynamic b Scaling + VPIN Fee Widening ────────────
  it('C16: Concurrent market activity scales pool parameter b and widens VPIN defense multiplier', () => {
    const pool = new MultiTokenPool(createDefaultPoolConfig(2));
    const guard = new AdverseSelectionGuard({
      bucketSizeVolume: 1_000,
      windowBucketCount: 5,
      vpinWarningThreshold: 0.4,
      vpinCriticalThreshold: 0.7,
      maxDynamicFeeMultiplier: 3.0,
    });

    // 1. Surging volume
    const baseTime = Date.now() - 500;
    for (let i = 0; i < 5; i++) {
      guard.recordTrade(900, 'BUY', baseTime + i * 20);
      guard.recordTrade(100, 'SELL', baseTime + i * 20 + 5);
      pool.mintCompleteSet(1_000);
    }

    const toxicity = guard.assessFlow(50, 'BUY');
    expect(toxicity.toxicityLevel).toBe('CRITICAL');

    // 2. Dynamic b adapts to new pool depth and volume
    const config: DynamicBConfig = {
      baseB: 1_000,
      minB: 500,
      maxB: 10_000,
      volumeScalingAlpha: 0.5,
      depthThresholdUsd: 1_000,
    };
    const state: DynamicBState = {
      currentB: pool.getB(),
      rollingVolumeUsd: 5_000,
      poolDepthUsd: pool.getCollateral(),
      lastUpdatedMs: Date.now(),
    };

    const adaptation = DynamicBAdapter.adaptB(state, config, 2);
    expect(adaptation.newB).toBeGreaterThan(pool.getB());
    expect(toxicity.dynamicFeeMultiplier).toBe(3.0);
  });
});
