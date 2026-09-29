/**
 * Tier 4: Real-World Workloads Test Suite
 * Prediction Market AMM & Negative-Risk Arbitrage Engine
 *
 * Implements 8 realistic multi-market application scenarios specified in TEST_INFRA.md:
 * S1. Realistic 2026 Presidential Election Market Basket (10-outcome LMSR pool)
 * S2. Super Bowl Multi-Outcome Winner Market (CPMM vs LMSR complete-set arbitrage)
 * S3. Toxic Flow Surge: Whale order sweep triggering fee widening & quote pull
 * S4. Volatility Breakout with Flash Latency Spike: Latency filter tripwire
 * S5. Partial Fill Cascade: Multi-leg basket arbitrage order with automated unwind
 * S6. Daily Drawdown Threshold Breach: 15% drawdown circuit breaker freeze
 * S7. Continuous 2-Sided Quoting with CEX Delta Rebalancer
 * S8. End-to-End Cryptographic Audit Verification (10,000 sequenced events)
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
  MultiOutcomeMarket,
  TradeIntent,
  MarketState,
  InventoryState,
} from './fixtures/amm-test-harness';

describe('Tier 4: Real-World Workloads (S1 to S8)', () => {
  // ─── S1: 2026 Presidential Election Market Basket ──────────────────────────
  it('S1: simulates 2026 Presidential Election 10-outcome LMSR pool with shifting probabilities', () => {
    const candidates = [
      'DEM_NOMINEE_A',
      'DEM_NOMINEE_B',
      'REP_NOMINEE_A',
      'REP_NOMINEE_B',
      'IND_NOMINEE_A',
      'IND_NOMINEE_B',
      'LIBERTARIAN',
      'GREEN_PARTY',
      'OTHER_QUALIFIED_1',
      'OTHER_QUALIFIED_2',
    ];

    const poolConfig = {
      poolId: 'presidential-election-2026',
      name: '2026 US Presidential Election Winner',
      engineType: 'LMSR' as const,
      outcomes: candidates.map((c) => ({ id: c, name: c, symbol: c })),
      initialB: 50_000,
      initialCollateral: 250_000,
      feeBps: 15, // 15 bps
    };

    const pool = new MultiTokenPool(poolConfig);
    expect(pool.getOutcomes()).toHaveLength(10);

    // Initial spot prices are uniform 10% each
    const initialPrices = LmsrPricing.calculateSpotPrices(pool.getShares(), pool.getB());
    for (const p of initialPrices) {
      expect(p).toBeCloseTo(0.10, 6);
    }

    // Phase 1: Breaking Debate News — massive volume into REP_NOMINEE_A
    for (let i = 0; i < 5; i++) {
      pool.executeTrade({
        poolId: pool.getPoolId(),
        outcomeId: 'REP_NOMINEE_A',
        sharesDelta: 15_000,
      });
    }

    const midPrices = LmsrPricing.calculateSpotPrices(pool.getShares(), pool.getB());
    const repAIndex = candidates.indexOf('REP_NOMINEE_A');
    expect(midPrices[repAIndex]).toBeGreaterThan(0.30); // Prob jumps from 10% to >30%

    // Invariant: sum of all 10 outcome spot prices strictly remains 1.00
    const sumProb = midPrices.reduce((acc, p) => acc + p, 0);
    expect(sumProb).toBeCloseTo(1.0, 10);

    // Phase 2: Counter-surge for DEM_NOMINEE_A
    for (let i = 0; i < 4; i++) {
      pool.executeTrade({
        poolId: pool.getPoolId(),
        outcomeId: 'DEM_NOMINEE_A',
        sharesDelta: 18_000,
      });
    }

    const finalPrices = LmsrPricing.calculateSpotPrices(pool.getShares(), pool.getB());
    const demAIndex = candidates.indexOf('DEM_NOMINEE_A');
    expect(finalPrices[demAIndex]).toBeGreaterThan(0.20); // Prob jumps from 10% to >20%
    expect(finalPrices.reduce((acc, p) => acc + p, 0)).toBeCloseTo(1.0, 10);
    expect(pool.getVolumeUsd()).toBeGreaterThan(25_000);
  });

  // ─── S2: Super Bowl Multi-Outcome Winner Market ─────────────────────────────
  it('S2: executes Super Bowl complete-set minting and combinatorial basket arbitrage', () => {
    // 4 conference championship teams in Super Bowl winner market
    const market = createMockMarket(4, 1.14, 0.005); // Sum of prices = 1.14 (overpriced basket)
    const opp = CombinatorialScanner.scanBasket(market);

    expect(opp).not.toBeNull();
    expect(opp?.direction).toBe('OVERPRICED_SELL_BASKET');
    expect(opp?.grossSpread).toBeGreaterThan(0.10);

    const orderbooks = createMockOrderbooks(market, 5);
    const pricer = BasketPricer.priceBasket(opp!, orderbooks, {
      feeBps: 20,
      gasCostUsd: 0.20,
      minProfitHurdleUsd: 10.0,
      maxSlippageBps: 50,
    });

    expect(pricer.isProfitable).toBe(true);
    expect(pricer.executableSize).toBeGreaterThanOrEqual(100);
    expect(pricer.netProfitUsd).toBeGreaterThan(10.0);

    // Mint complete set for 1.00 USDC per unit and sell all outcomes
    const pool = new MultiTokenPool(createDefaultPoolConfig(4));
    const mintRes = pool.mintCompleteSet(pricer.executableSize);
    expect(mintRes.sharesMinted).toBe(pricer.executableSize);

    // Verify gross revenue exceeds collateral spent
    const revenue = Object.values(pricer.effectiveLegPrices).reduce(
      (acc, p) => acc + p * pricer.executableSize,
      0
    );
    expect(revenue).toBeGreaterThan(pricer.totalCapitalRequiredUsd);
  });

  // ─── S3: Toxic Flow Surge & Defensive Fee Widening ─────────────────────────
  it('S3: toxic whale sweep across outcomes triggers dynamic fee widening and quote tripwire', () => {
    const guard = new AdverseSelectionGuard({
      bucketSizeVolume: 2_000,
      windowBucketCount: 5,
      vpinWarningThreshold: 0.45,
      vpinCriticalThreshold: 0.70,
      maxDynamicFeeMultiplier: 3.0,
      sweepVelocityThreshold: 4_000,
    });

    const market: MarketState = {
      marketId: 'super-bowl-mkt',
      spotPrices: { KC_CHIEFS: 0.55, SF_49ERS: 0.45 },
      volatility: 0.03,
      timeToMaturitySec: 3600,
    };
    const inventory: InventoryState = {
      holdings: { KC_CHIEFS: 0, SF_49ERS: 0 },
      cashBalanceUsd: 50_000,
      netPortfolioDelta: 0,
    };

    // Baseline calm quoting
    const calmQuotes = TwoSidedQuoter.generateQuotes(market, inventory, { kappa: 10, minSpreadBps: 150 });
    expect(calmQuotes.KC_CHIEFS.bidPrice).toBeLessThan(0.55);

    // Whale initiates aggressive directional sweep: 10,000 volume of BUY orders in 50ms
    const sweepTime = Date.now();
    guard.recordTrade(5_000, 'BUY', sweepTime);
    guard.recordTrade(5_000, 'BUY', sweepTime);

    const assessment = guard.assessFlow(500, 'BUY');
    expect(assessment.toxicityLevel).toBe('CRITICAL');
    expect(assessment.shouldTripwirePullQuotes).toBe(true);
    expect(assessment.dynamicFeeMultiplier).toBe(3.0);
    expect(assessment.cooldownPeriodMs).toBe(30_000);
  });

  // ─── S4: Volatility Breakout with Flash Latency Spike ───────────────────────
  it('S4: volatility breakout with flash latency spike trips pre-trade latency filter', () => {
    const context = createDefaultRiskContext({ portfolioEquityUsd: 100_000 });

    // Under normal latency (40ms), quote order passes
    const normalTrade: TradeIntent = {
      intentId: 'trade-normal',
      marketId: 'polymarket-btc-100k',
      notionalUsd: 2_000,
      expectedEdgeBps: 60,
      venueLatencyMs: 40,
    };
    const normalVerdict = AmmRiskGuard.evaluatePreTrade(normalTrade, context);
    expect(normalVerdict.verdict).toBe('APPROVED');

    // Market experiences flash network congestion / WebSocket RPC spike to 720ms
    const staleTrade: TradeIntent = {
      intentId: 'trade-stale',
      marketId: 'polymarket-btc-100k',
      notionalUsd: 2_000,
      expectedEdgeBps: 60,
      venueLatencyMs: 720, // > 500ms threshold
    };
    const staleVerdict = AmmRiskGuard.evaluatePreTrade(staleTrade, context);
    expect(staleVerdict.verdict).toBe('REJECTED');
    expect(staleVerdict.rejectionCode).toBe('LATENCY_SPIKE_EXCEEDED');
  });

  // ─── S5: Partial Fill Cascade & Compensatory Unwind ─────────────────────────
  it('S5: executes multi-leg basket arbitrage order with 2 of 4 legs filled and unwinds to net zero', async () => {
    const market = createMockMarket(4, 1.15, 0.01);
    const opp = CombinatorialScanner.scanBasket(market)!;

    // Simulate 2 legs filling completely, 1 partially filling, 1 failing
    const execution = await AtomicBasketCoordinator.executeOpportunity(opp, {
      OUTCOME_1: { fillRatio: 1.0, latencyMs: 15 },
      OUTCOME_2: { fillRatio: 1.0, latencyMs: 20 },
      OUTCOME_3: { fillRatio: 0.35, latencyMs: 25 },
      OUTCOME_4: { fillRatio: 0, shouldFail: true, latencyMs: 50 },
    });

    expect(execution.status).toBe('UNWOUND');
    expect(execution.unwindResult).toBeDefined();

    // Invariant: zero residual exposure after unwind
    expect(execution.unwindResult?.residualExposure).toBe(0);
    expect(execution.unwindResult?.unwoundLegs).toHaveLength(3); // 1, 2, and partial 3
    expect(execution.unwindResult?.netUnwindLossUsd).toBeGreaterThan(0);
  });

  // ─── S6: Daily Drawdown Threshold Breach ────────────────────────────────────
  it('S6: consecutive adverse fills trip 15% daily drawdown circuit breaker, freezing all new orders', () => {
    const engine = new MasterAmmEngine('drawdown-s6-audit');
    const pool = engine.registerPool(createDefaultPoolConfig(2));

    // Initial equity = 100,000
    let currentEquity = 100_000;
    const peakEquity = 100_000;

    // Trade 1: Small loss
    currentEquity = 92_000; // 8% drawdown -> OK
    let ctx = createDefaultRiskContext({
      portfolioEquityUsd: currentEquity,
      peakDailyEquityUsd: peakEquity,
      currentDailyEquityUsd: currentEquity,
    });
    let trade = engine.executeTrade(
      { poolId: pool.getPoolId(), outcomeId: 'OUT_1', sharesDelta: 10 },
      ctx
    );
    expect(trade.success).toBe(true);

    // Catastrophic flash loss: equity drops to 84,000 (16% drawdown > 15%)
    currentEquity = 84_000;
    ctx = createDefaultRiskContext({
      portfolioEquityUsd: currentEquity,
      peakDailyEquityUsd: peakEquity,
      currentDailyEquityUsd: currentEquity,
    });

    trade = engine.executeTrade(
      { poolId: pool.getPoolId(), outcomeId: 'OUT_1', sharesDelta: 10 },
      ctx
    );

    expect(trade.success).toBe(false);
    expect(trade.rejection?.rejectionCode).toBe('DAILY_DRAWDOWN_BREACH');

    // Confirm breaker logged to audit trail
    const chain = engine.getAuditLogger().getChain();
    expect(chain[chain.length - 1].action).toBe('RISK_GATE_REJECTED');
  });

  // ─── S7: Continuous 2-Sided Quoting with CEX Delta Rebalancer ──────────────
  it('S7: simulates continuous 10-cycle 2-sided quoting session with periodic CEX rebalancing', () => {
    const market: MarketState = {
      marketId: 'mkt-continuous',
      spotPrices: { YES: 0.50, NO: 0.50 },
      volatility: 0.02,
      timeToMaturitySec: 86_400,
    };

    const inventory: InventoryState = {
      holdings: { YES: 0, NO: 0 },
      cashBalanceUsd: 10_000,
      netPortfolioDelta: 0,
    };

    let totalRebalances = 0;
    let totalHedgedNotional = 0;

    // Simulate 10 discrete quoting rounds
    for (let round = 1; round <= 10; round++) {
      // 1. Quoter produces quotes
      const quotes = TwoSidedQuoter.generateQuotes(market, inventory, { kappa: 8 });
      expect(quotes.YES.bidPrice).toBeLessThan(quotes.YES.askPrice);

      // 2. Simulated maker fill: market buys 150 YES shares from our ask
      inventory.holdings.YES += 150;
      inventory.netPortfolioDelta += 150;

      // 3. Rebalancer checks exposure with tolerance = 400
      const rebalances = InventoryDeltaRebalancer.evaluateRebalance(
        inventory,
        market.spotPrices,
        400
      );

      if (rebalances.length > 0) {
        totalRebalances += 1;
        for (const order of rebalances) {
          totalHedgedNotional += order.targetQuantity * order.limitPrice;
          // Apply simulated hedge fill
          inventory.holdings.YES -= order.targetQuantity;
          inventory.netPortfolioDelta -= order.targetQuantity;
        }
      }
    }

    expect(totalRebalances).toBeGreaterThan(0);
    expect(totalHedgedNotional).toBeGreaterThan(0);
    // Residual exposure kept within tolerance band (<= 400)
    expect(Math.abs(inventory.holdings.YES)).toBeLessThanOrEqual(400);
  });

  // ─── S8: End-to-End Cryptographic Audit Verification ──────────────────────
  it('S8: generates 10,000 sequenced events and cryptographically verifies chain integrity', () => {
    const logger = new AmmAuditLogger('prod-audit-salt-2026');

    // Generate 10,000 chained events across pool actions, trades, and risk checks
    for (let i = 0; i < 10_000; i++) {
      const action =
        i % 4 === 0
          ? 'POOL_INITIALIZED'
          : i % 4 === 1
            ? 'TRADE_EXECUTED'
            : i % 4 === 2
              ? 'RISK_GATE_APPROVED'
              : 'QUOTE_PUBLISHED';

      logger.logEvent(action, {
        seq: i,
        randomPayload: `event-hash-${i}`,
      });
    }

    expect(logger.getChain()).toHaveLength(10_000);

    // Verify pristine chain
    const result = logger.verifyChain();
    expect(result.valid).toBe(true);
    expect(result.failedIndex).toBeUndefined();

    // Verify detection of tampering at record 5,000
    const rawChain = logger.getChain() as Array<{
      index: number;
      timestamp: number;
      action: string;
      details: Record<string, unknown>;
      prevHash: string;
      hash: string;
    }>;

    const originalHash = rawChain[5_000].hash;
    // Flip a single character in the hash
    const corruptedChar = originalHash[0] === 'a' ? 'b' : 'a';
    rawChain[5_000].hash = corruptedChar + originalHash.slice(1);

    const tamperedResult = logger.verifyChain();
    expect(tamperedResult.valid).toBe(false);
    expect(tamperedResult.failedIndex).toBe(5_000);
    expect(tamperedResult.reason).toMatch(/corruption/i);

    // Restore original hash
    rawChain[5_000].hash = originalHash;
    expect(logger.verifyChain().valid).toBe(true);
  });
});
