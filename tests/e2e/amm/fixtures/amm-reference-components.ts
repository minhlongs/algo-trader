/**
 * Reference Components & Behavioral Simulators for
 * Prediction Market AMM & Negative-Risk Arbitrage Engine.
 *
 * Implements exact mathematical formulas, contracts, state machines, and
 * invariants specified in PROJECT.md and ORIGINAL_REQUEST.md.
 */

import { createHmac } from 'crypto';
import type {
  LmsrCostInput,
  LmsrTradeCostInput,
  DynamicBConfig,
  DynamicBState,
  DynamicBAdaptationResult,
  BinaryOutcomeToken,
  CpmmReserves,
  CpmmSwapResult,
  CpmmLiquidityResult,
  MultiTokenPoolConfig,
  PoolTradeRequest,
  PoolTradeResult,
  MultiOutcomeMarket,
  ArbitrageOpportunity,
  OutcomeOrderBook,
  BasketPricerConfig,
  BasketPricerResult,
  ExecutionLeg,
  BundleExecutionResult,
  UnwindResult,
  TwoSidedQuote,
  InventoryState,
  MarketState,
  RebalanceOrder,
  ToxicityAssessment,
  AdverseSelectionConfig,
  TradeIntent,
  RiskContext,
  RiskGateConfig,
  RiskCheckResult,
  AmmAuditAction,
  AmmAuditRecord,
  ChainVerificationResult,
  AmmMetricsSnapshot,
} from './amm-contracts';

// ============================================================================
// Feature 1: LMSR Mathematical Pricing
// C(q) = b * ln(sum(e^(q_i / b)))
// p_i(q) = e^(q_i / b) / sum(e^(q_j / b))
// Delta C = b * log1p(sum(p_i * expm1(Delta q_i / b)))
// ============================================================================
export class LmsrPricing {
  public static calculateCost(shares: number[], b: number): number {
    if (b <= 0 || !Number.isFinite(b)) {
      throw new Error(`LMSR liquidity parameter b must be strictly positive, got ${b}`);
    }
    if (shares.length === 0) {
      throw new Error('LMSR shares array must not be empty');
    }

    let maxScaled = -Infinity;
    for (let i = 0; i < shares.length; i++) {
      const scaled = shares[i] / b;
      if (scaled > maxScaled) {
        maxScaled = scaled;
      }
    }

    if (!Number.isFinite(maxScaled)) {
      return 0;
    }

    let sumExp = 0;
    for (let i = 0; i < shares.length; i++) {
      sumExp += Math.exp(shares[i] / b - maxScaled);
    }

    return b * (maxScaled + Math.log(sumExp));
  }

  public static calculateSpotPrices(shares: number[], b: number): number[] {
    if (b <= 0 || !Number.isFinite(b)) {
      throw new Error(`LMSR liquidity parameter b must be strictly positive, got ${b}`);
    }
    if (shares.length === 0) {
      throw new Error('LMSR shares array must not be empty');
    }

    let maxScaled = -Infinity;
    for (let i = 0; i < shares.length; i++) {
      const scaled = shares[i] / b;
      if (scaled > maxScaled) {
        maxScaled = scaled;
      }
    }

    const exps = new Array<number>(shares.length);
    let sumExp = 0;
    for (let i = 0; i < shares.length; i++) {
      const e = Math.exp(shares[i] / b - maxScaled);
      exps[i] = e;
      sumExp += e;
    }

    const prices = new Array<number>(shares.length);
    for (let i = 0; i < shares.length; i++) {
      prices[i] = exps[i] / sumExp;
    }

    return prices;
  }

  public static calculateTradeCost(shares: number[], deltaShares: number[], b: number): number {
    if (b <= 0 || !Number.isFinite(b)) {
      throw new Error(`LMSR liquidity parameter b must be strictly positive, got ${b}`);
    }
    if (shares.length === 0 || deltaShares.length !== shares.length) {
      throw new Error('LMSR shares and deltaShares must have identical non-zero length');
    }

    // Check maximum delta magnitude for micro-trade numerical stabilization
    let maxDeltaNorm = 0;
    for (let i = 0; i < deltaShares.length; i++) {
      const absD = Math.abs(deltaShares[i]);
      if (absD > maxDeltaNorm) {
        maxDeltaNorm = absD;
      }
    }

    // If delta is tiny relative to b, use the log1p(sum(p_i * expm1(Delta q_i / b))) formulation
    if (maxDeltaNorm / b < 1e-4) {
      const spotPrices = this.calculateSpotPrices(shares, b);
      let sumPExpm1 = 0;
      for (let i = 0; i < deltaShares.length; i++) {
        sumPExpm1 += spotPrices[i] * Math.expm1(deltaShares[i] / b);
      }
      return b * Math.log1p(sumPExpm1);
    }

    // Standard log-sum-exp difference
    const newShares = new Array<number>(shares.length);
    for (let i = 0; i < shares.length; i++) {
      newShares[i] = shares[i] + deltaShares[i];
    }
    const costAfter = this.calculateCost(newShares, b);
    const costBefore = this.calculateCost(shares, b);
    return costAfter - costBefore;
  }
}

// ============================================================================
// Feature 2: Dynamic Liquidity b Adaptation
// Proportional liability scaling: q'_i = q_i * (b' / b) preserving spot prices
// Max MM subsidy bound = b * ln(n)
// ============================================================================
export class DynamicBAdapter {
  public static adaptB(
    currentState: DynamicBState,
    config: DynamicBConfig,
    outcomeCount: number
  ): DynamicBAdaptationResult {
    const { baseB, minB, maxB, volumeScalingAlpha, depthThresholdUsd } = config;
    const { currentB, rollingVolumeUsd, poolDepthUsd } = currentState;

    const volumeRatio = Math.max(0, rollingVolumeUsd) / Math.max(1, depthThresholdUsd);
    const targetB = baseB * (1 + volumeScalingAlpha * Math.sqrt(volumeRatio));
    const clampedB = Math.max(minB, Math.min(maxB, targetB));

    const maxSubsidyUsd = clampedB * Math.log(Math.max(2, outcomeCount));

    return {
      previousB: currentB,
      newB: clampedB,
      scaledShares: [], // Populated when caller passes shares
      maxSubsidyUsd,
    };
  }

  public static scaleLiabilities(shares: number[], oldB: number, newB: number): number[] {
    if (oldB <= 0 || newB <= 0) {
      throw new Error('Both oldB and newB must be positive');
    }
    const ratio = newB / oldB;
    return shares.map((q) => q * ratio);
  }

  public static calculateMaxSubsidy(b: number, outcomeCount: number): number {
    if (b <= 0 || outcomeCount < 2) return 0;
    return b * Math.log(outcomeCount);
  }
}

// ============================================================================
// Feature 3: Binary CPMM Engine
// Invariant: k = x * y
// Spot price: P_yes = y / (x + y), P_no = x / (x + y)
// Closed-form quadratic solver for selling shares
// ============================================================================
export class CpmmPricing {
  public static calculateSpotPrices(reserves: CpmmReserves): {
    spotPriceYes: number;
    spotPriceNo: number;
  } {
    const total = reserves.yesShares + reserves.noShares;
    if (total <= 0) {
      return { spotPriceYes: 0.5, spotPriceNo: 0.5 };
    }
    return {
      spotPriceYes: reserves.noShares / total,
      spotPriceNo: reserves.yesShares / total,
    };
  }

  public static calculateSwap(
    inputToken: BinaryOutcomeToken,
    inputAmount: number,
    reserves: CpmmReserves,
    feeBps: number
  ): CpmmSwapResult {
    if (inputAmount <= 0) {
      throw new Error('Input amount must be strictly positive');
    }
    if (reserves.yesShares <= 0 || reserves.noShares <= 0) {
      throw new Error('CPMM reserves must be strictly positive');
    }

    const feeAmount = (inputAmount * Math.max(0, feeBps)) / 10_000;
    const netInput = inputAmount - feeAmount;

    let outputAmount = 0;
    let newYesShares = reserves.yesShares;
    let newNoShares = reserves.noShares;

    if (inputToken === 'YES') {
      outputAmount = (netInput * reserves.noShares) / (reserves.yesShares + netInput);
      newYesShares = reserves.yesShares + inputAmount;
      newNoShares = reserves.noShares - outputAmount;
    } else {
      outputAmount = (netInput * reserves.yesShares) / (reserves.noShares + netInput);
      newNoShares = reserves.noShares + inputAmount;
      newYesShares = reserves.yesShares - outputAmount;
    }

    const newReserves: CpmmReserves = {
      yesShares: newYesShares,
      noShares: newNoShares,
      collateralReserve: reserves.collateralReserve + feeAmount,
    };

    const prices = this.calculateSpotPrices(newReserves);
    const effectivePrice = inputAmount / (outputAmount > 0 ? outputAmount : 1e-12);
    const prePrices = this.calculateSpotPrices(reserves);
    const preTargetPrice = inputToken === 'YES' ? prePrices.spotPriceYes : prePrices.spotPriceNo;
    const postTargetPrice = inputToken === 'YES' ? prices.spotPriceYes : prices.spotPriceNo;
    const priceImpact = Math.abs(postTargetPrice - preTargetPrice) / Math.max(1e-6, preTargetPrice);

    return {
      inputToken,
      inputAmount,
      outputAmount,
      feeAmount,
      newReserves,
      effectivePrice,
      priceImpact,
      spotPriceYes: prices.spotPriceYes,
      spotPriceNo: prices.spotPriceNo,
    };
  }

  public static calculateSellShares(
    token: BinaryOutcomeToken,
    sharesToSell: number,
    reserves: CpmmReserves,
    feeBps: number
  ): number {
    if (sharesToSell <= 0) {
      throw new Error('Shares to sell must be positive');
    }
    const k = reserves.yesShares * reserves.noShares;
    let collateralReturned = 0;

    if (token === 'YES') {
      const newYes = reserves.yesShares + sharesToSell;
      const newNo = k / newYes;
      collateralReturned = (reserves.noShares - newNo) * (1 - Math.max(0, feeBps) / 10_000);
    } else {
      const newNo = reserves.noShares + sharesToSell;
      const newYes = k / newNo;
      collateralReturned = (reserves.yesShares - newYes) * (1 - Math.max(0, feeBps) / 10_000);
    }

    return Math.max(0, collateralReturned);
  }

  public static addLiquidity(collateralAmount: number, reserves: CpmmReserves): CpmmLiquidityResult {
    if (collateralAmount <= 0) {
      throw new Error('Collateral amount must be positive');
    }
    const yesDelta = collateralAmount;
    const noDelta = collateralAmount;

    return {
      sharesAddedOrRemoved: collateralAmount,
      yesSharesDelta: yesDelta,
      noSharesDelta: noDelta,
      collateralDelta: collateralAmount,
      newReserves: {
        yesShares: reserves.yesShares + yesDelta,
        noShares: reserves.noShares + noDelta,
        collateralReserve: reserves.collateralReserve + collateralAmount,
      },
    };
  }
}

// ============================================================================
// Feature 4: Multi-Token Pool State Manager
// Complete set minting / merging and pool state accounting
// ============================================================================
export class MultiTokenPool {
  private config: MultiTokenPoolConfig;
  private shares: number[];
  private currentB: number;
  private collateralReserve: number;
  private volumeUsd: number = 0;
  private tradeCount: number = 0;

  constructor(config: MultiTokenPoolConfig) {
    this.config = config;
    this.shares = new Array<number>(config.outcomes.length).fill(0);
    this.currentB = config.initialB ?? 1_000;
    this.collateralReserve = config.initialCollateral;
  }

  public getPoolId(): string {
    return this.config.poolId;
  }

  public getOutcomes(): string[] {
    return this.config.outcomes.map((o) => o.id);
  }

  public getShares(): number[] {
    return [...this.shares];
  }

  public getB(): number {
    return this.currentB;
  }

  public getCollateral(): number {
    return this.collateralReserve;
  }

  public getVolumeUsd(): number {
    return this.volumeUsd;
  }

  public getTradeCount(): number {
    return this.tradeCount;
  }

  public mintCompleteSet(amountUsd: number): { sharesMinted: number; collateralAdded: number } {
    if (amountUsd <= 0) {
      throw new Error('Mint amount must be strictly positive');
    }
    for (let i = 0; i < this.shares.length; i++) {
      this.shares[i] += amountUsd;
    }
    this.collateralReserve += amountUsd;
    return { sharesMinted: amountUsd, collateralAdded: amountUsd };
  }

  public mergeCompleteSet(amountTokens: number): {
    sharesBurned: number;
    collateralReturned: number;
  } {
    if (amountTokens <= 0) {
      throw new Error('Merge amount must be strictly positive');
    }
    for (let i = 0; i < this.shares.length; i++) {
      if (this.shares[i] < amountTokens) {
        throw new Error(
          `Insufficient shares for outcome ${this.config.outcomes[i].id}: available ${this.shares[i]}, requested ${amountTokens}`
        );
      }
    }
    for (let i = 0; i < this.shares.length; i++) {
      this.shares[i] -= amountTokens;
    }
    this.collateralReserve -= amountTokens;
    return { sharesBurned: amountTokens, collateralReturned: amountTokens };
  }

  public executeTrade(trade: PoolTradeRequest): PoolTradeResult {
    const outcomeIndex = this.config.outcomes.findIndex((o) => o.id === trade.outcomeId);
    if (outcomeIndex === -1) {
      throw new Error(`Unknown outcome ID ${trade.outcomeId}`);
    }

    const deltaVector = new Array<number>(this.shares.length).fill(0);
    deltaVector[outcomeIndex] = trade.sharesDelta;

    const baseCost = LmsrPricing.calculateTradeCost(this.shares, deltaVector, this.currentB);
    const feeUsd = Math.abs(baseCost) * (this.config.feeBps / 10_000);
    const netCostUsd = baseCost + feeUsd;

    if (trade.maxCostUsd !== undefined && netCostUsd > trade.maxCostUsd) {
      throw new Error(
        `Trade cost ${netCostUsd.toFixed(4)} exceeds maximum allowed ${trade.maxCostUsd}`
      );
    }

    this.shares[outcomeIndex] += trade.sharesDelta;
    this.collateralReserve += netCostUsd;
    this.volumeUsd += Math.abs(netCostUsd);
    this.tradeCount += 1;

    const newPrices = LmsrPricing.calculateSpotPrices(this.shares, this.currentB);
    const spotMap: Record<string, number> = {};
    this.config.outcomes.forEach((o, idx) => {
      spotMap[o.id] = newPrices[idx];
    });

    return {
      poolId: this.config.poolId,
      outcomeId: trade.outcomeId,
      sharesDelta: trade.sharesDelta,
      costUsd: baseCost,
      feeUsd,
      netCostUsd,
      newSpotPrices: spotMap,
      timestamp: Date.now(),
    };
  }
}

// ============================================================================
// Feature 5: Combinatorial Mispricing Scanner
// Detects sum(P_i) > 1.00 + fee (overpriced) and sum(P_i) < 1.00 - fee (underpriced)
// ============================================================================
export class CombinatorialScanner {
  public static scanBasket(
    market: MultiOutcomeMarket,
    overrideFeeBps?: number
  ): ArbitrageOpportunity | null {
    if (market.outcomes.length < 2) {
      return null;
    }

    const feeBps = overrideFeeBps ?? market.feeBps;
    const feeThreshold = (feeBps / 10_000) * market.outcomes.length;

    let sumBids = 0;
    let sumAsks = 0;
    const bidMap: Record<string, number> = {};
    const askMap: Record<string, number> = {};

    for (const o of market.outcomes) {
      sumBids += o.bestBid;
      sumAsks += o.bestAsk;
      bidMap[o.outcomeId] = o.bestBid;
      askMap[o.outcomeId] = o.bestAsk;
    }

    // Condition 1: Overpriced basket: sell outcomes at bid, mint complete set at 1.00
    if (sumBids > 1.0 + feeThreshold) {
      const grossSpread = sumBids - 1.0;
      return {
        opportunityId: `arb-over-${market.marketId}-${Date.now()}`,
        marketId: market.marketId,
        direction: 'OVERPRICED_SELL_BASKET',
        sumPrices: sumBids,
        hurdlePrice: 1.0 + feeThreshold,
        grossSpread,
        outcomes: market.outcomes.map((o) => o.outcomeId),
        legPrices: bidMap,
        theoreticalMaxProfitUsd: grossSpread * 1_000,
        timestamp: Date.now(),
      };
    }

    // Condition 2: Underpriced basket: buy outcomes at ask, merge complete set at 1.00
    if (sumAsks < 1.0 - feeThreshold && sumAsks > 0.05) {
      const grossSpread = 1.0 - sumAsks;
      return {
        opportunityId: `arb-under-${market.marketId}-${Date.now()}`,
        marketId: market.marketId,
        direction: 'UNDERPRICED_BUY_BASKET',
        sumPrices: sumAsks,
        hurdlePrice: 1.0 - feeThreshold,
        grossSpread,
        outcomes: market.outcomes.map((o) => o.outcomeId),
        legPrices: askMap,
        theoreticalMaxProfitUsd: grossSpread * 1_000,
        timestamp: Date.now(),
      };
    }

    return null;
  }
}

// ============================================================================
// Feature 6: Basket Pricer & Depth Walker
// Computes executable size, fee netting, and on-chain gas costs
// ============================================================================
export class BasketPricer {
  public static priceBasket(
    opportunity: ArbitrageOpportunity,
    orderbooks: Record<string, OutcomeOrderBook>,
    config: BasketPricerConfig
  ): BasketPricerResult {
    const { feeBps, gasCostUsd, minProfitHurdleUsd } = config;
    const outcomes = opportunity.outcomes;

    // Determine available depth across all legs
    let minAvailableSize = Infinity;
    for (const outcomeId of outcomes) {
      const ob = orderbooks[outcomeId];
      if (!ob) {
        minAvailableSize = 0;
        break;
      }
      const levels = opportunity.direction === 'OVERPRICED_SELL_BASKET' ? ob.bids : ob.asks;
      const totalDepth = levels.reduce((acc, lvl) => acc + lvl.size, 0);
      if (totalDepth < minAvailableSize) {
        minAvailableSize = totalDepth;
      }
    }

    if (!Number.isFinite(minAvailableSize) || minAvailableSize <= 0) {
      return {
        opportunityId: opportunity.opportunityId,
        direction: opportunity.direction,
        executableSize: 0,
        effectiveLegPrices: {},
        totalCapitalRequiredUsd: 0,
        grossProfitUsd: 0,
        feeUsd: 0,
        gasCostUsd,
        netProfitUsd: -gasCostUsd,
        roiBps: 0,
        isProfitable: false,
      };
    }

    // Walk depth for chosen size
    const testSize = Math.min(minAvailableSize, 500); // capped at 500 units for evaluation
    const effectivePrices: Record<string, number> = {};
    let totalCostOrProceeds = 0;

    for (const outcomeId of outcomes) {
      const ob = orderbooks[outcomeId];
      const levels = opportunity.direction === 'OVERPRICED_SELL_BASKET' ? ob.bids : ob.asks;

      let remaining = testSize;
      let legNotional = 0;

      for (const lvl of levels) {
        const fill = Math.min(remaining, lvl.size);
        legNotional += fill * lvl.price;
        remaining -= fill;
        if (remaining <= 0) break;
      }

      const avgPrice = legNotional / testSize;
      effectivePrices[outcomeId] = avgPrice;
      totalCostOrProceeds += legNotional;
    }

    let grossProfit = 0;
    let capitalRequired = 0;

    if (opportunity.direction === 'OVERPRICED_SELL_BASKET') {
      capitalRequired = testSize * 1.0; // Mint complete set for 1.00 USDC per unit
      grossProfit = totalCostOrProceeds - capitalRequired;
    } else {
      capitalRequired = totalCostOrProceeds; // Buy all outcomes
      const mergeProceeds = testSize * 1.0;
      grossProfit = mergeProceeds - capitalRequired;
    }

    const feeUsd = totalCostOrProceeds * (feeBps / 10_000);
    const netProfitUsd = grossProfit - feeUsd - gasCostUsd;
    const roiBps = capitalRequired > 0 ? (netProfitUsd / capitalRequired) * 10_000 : 0;
    const isProfitable = netProfitUsd >= minProfitHurdleUsd;

    return {
      opportunityId: opportunity.opportunityId,
      direction: opportunity.direction,
      executableSize: testSize,
      effectiveLegPrices: effectivePrices,
      totalCapitalRequiredUsd: capitalRequired,
      grossProfitUsd: grossProfit,
      feeUsd,
      gasCostUsd,
      netProfitUsd,
      roiBps,
      isProfitable,
    };
  }
}

// ============================================================================
// Feature 7: Atomic Multi-Leg Bundle Coordinator
// 6-state lifecycle tracking: PENDING -> SUBMITTED -> FILLED | PARTIAL_UNWINDING -> UNWOUND | FAILED
// ============================================================================
let bundleCounter = 0;

export class AtomicBasketCoordinator {
  public static async executeOpportunity(
    opp: ArbitrageOpportunity,
    mockOverrides?: Record<
      string,
      { fillRatio: number; shouldFail?: boolean; latencyMs?: number }
    >
  ): Promise<BundleExecutionResult> {
    const startTime = Date.now();
    bundleCounter += 1;
    const legs: ExecutionLeg[] = opp.outcomes.map((id, index) => {
      const override = mockOverrides?.[id];
      const targetSize = 100;
      const fillRatio = override?.shouldFail ? 0 : (override?.fillRatio ?? 1.0);
      const filledSize = targetSize * fillRatio;
      const status =
        override?.shouldFail || fillRatio === 0
          ? 'FAILED'
          : fillRatio >= 1.0
            ? 'FILLED'
            : 'PARTIAL';

      return {
        legId: `leg-${index}-${id}`,
        outcomeId: id,
        side: opp.direction === 'OVERPRICED_SELL_BASKET' ? 'SELL' : 'BUY',
        targetSize,
        filledSize,
        limitPrice: opp.legPrices[id] ?? 0.5,
        avgFillPrice: opp.legPrices[id] ?? 0.5,
        status,
        latencyMs: override?.latencyMs ?? 15,
      };
    });

    const hasFailure = legs.some((l) => l.status === 'FAILED');
    const hasPartial = legs.some((l) => l.status === 'PARTIAL');
    const allFilled = legs.every((l) => l.status === 'FILLED');

    let status: BundleExecutionResult['status'] = 'SUBMITTED';
    let unwindResult: UnwindResult | undefined = undefined;
    let realizedPnl = 0;

    if (allFilled) {
      status = 'FILLED';
      realizedPnl = opp.grossSpread * 100;
    } else if (hasPartial || (hasFailure && legs.some((l) => l.filledSize > 0))) {
      status = 'PARTIAL_UNWINDING';
      unwindResult = await CompensatoryUnwindHandler.unwindPartialFills(legs);
      status = 'UNWOUND';
      realizedPnl = -unwindResult.netUnwindLossUsd;
    } else {
      status = 'FAILED';
    }

    const totalFilled = legs.reduce((acc, l) => acc + l.filledSize, 0);
    const totalLatency = legs.reduce((acc, l) => acc + l.latencyMs, 0);

    return {
      bundleId: `bundle-${Date.now()}-${bundleCounter}`,
      opportunityId: opp.opportunityId,
      status,
      legs,
      totalFilledSize: totalFilled,
      realizedPnlUsd: realizedPnl,
      unwindResult,
      totalLatencyMs: totalLatency,
      executedAt: Date.now(),
    };
  }
}

// ============================================================================
// Feature 8: Compensatory Unwind Handler
// Opposite-side market liquidation for zero residual exposure
// ============================================================================
export class CompensatoryUnwindHandler {
  public static async unwindPartialFills(legs: ExecutionLeg[]): Promise<UnwindResult> {
    const filledLegs = legs.filter((l) => l.filledSize > 0);
    const unwoundLegs = filledLegs.map((l) => {
      // Unwind penalty / slippage simulated at 200 bps
      const unwindPrice = l.side === 'BUY' ? l.avgFillPrice * 0.98 : l.avgFillPrice * 1.02;
      const realizedLoss = Math.abs(l.avgFillPrice - unwindPrice) * l.filledSize;

      return {
        outcomeId: l.outcomeId,
        unwoundSize: l.filledSize,
        unwindPrice,
        realizedLossUsd: realizedLoss,
      };
    });

    const totalNotional = unwoundLegs.reduce((acc, u) => acc + u.unwoundSize * u.unwindPrice, 0);
    const netLoss = unwoundLegs.reduce((acc, u) => acc + u.realizedLossUsd, 0);

    return {
      unwoundLegs,
      totalUnwoundNotionalUsd: totalNotional,
      netUnwindLossUsd: netLoss,
      residualExposure: 0,
      completedAt: Date.now(),
    };
  }
}

// ============================================================================
// Feature 9: Adaptive 2-Sided Quoting Agent
// Inventory-skewed quotes: reservation price shifts inversely with inventory
// ============================================================================
export class TwoSidedQuoter {
  public static generateQuotes(
    market: MarketState,
    inventory: InventoryState,
    config?: {
      gamma?: number;
      sigma?: number;
      kappa?: number;
      minSpreadBps?: number;
      quoteSize?: number;
    }
  ): Record<string, TwoSidedQuote> {
    const gamma = config?.gamma ?? 0.1;
    const sigma = config?.sigma ?? 0.02;
    const kappa = config?.kappa ?? 1.5;
    const minSpread = (config?.minSpreadBps ?? 200) / 10_000;
    const quoteSize = config?.quoteSize ?? 100;
    const tau = Math.max(1, market.timeToMaturitySec);

    const quotes: Record<string, TwoSidedQuote> = {};

    for (const [outcomeId, spotPrice] of Object.entries(market.spotPrices)) {
      const q = inventory.holdings[outcomeId] ?? 0;
      // Inventory skew: long q lowers reservation price, short q raises it
      const skewOffset = q * gamma * Math.pow(sigma, 2) * (tau / 86_400);
      const resPrice = spotPrice - skewOffset;

      const halfSpreadBase = Math.max(minSpread / 2, (1 / kappa) * Math.log(1 + gamma / kappa));
      const rawBid = resPrice - halfSpreadBase;
      const rawAsk = resPrice + halfSpreadBase;

      // Quantize to 0.01 tick and clamp to (0.01, 0.99)
      const bidPrice = Math.max(0.01, Math.min(0.98, Math.round(rawBid * 100) / 100));
      const askPrice = Math.max(bidPrice + 0.01, Math.min(0.99, Math.round(rawAsk * 100) / 100));

      quotes[outcomeId] = {
        outcomeId,
        bidPrice,
        askPrice,
        bidSize: quoteSize,
        askSize: quoteSize,
        spreadBps: Math.round(((askPrice - bidPrice) / spotPrice) * 10_000),
        skewOffset,
        timestamp: Date.now(),
      };
    }

    return quotes;
  }
}

// ============================================================================
// Feature 10: Cross-Market Inventory Rebalancer
// Delta rebalancing against external reference feeds
// ============================================================================
export class InventoryDeltaRebalancer {
  public static evaluateRebalance(
    inventory: InventoryState,
    refPrices: Record<string, number>,
    maxTolerance: number = 500
  ): RebalanceOrder[] {
    const orders: RebalanceOrder[] = [];

    for (const [outcomeId, qty] of Object.entries(inventory.holdings)) {
      if (Math.abs(qty) > maxTolerance) {
        const excess = Math.abs(qty) - maxTolerance;
        const side: 'BUY' | 'SELL' = qty > 0 ? 'SELL' : 'BUY';
        const price = refPrices[outcomeId] ?? 0.5;

        orders.push({
          rebalanceId: `reb-${outcomeId}-${Date.now()}`,
          venue: 'BINANCE_OR_CEX_REFERENCE',
          outcomeId,
          side,
          targetQuantity: excess,
          limitPrice: side === 'SELL' ? price * 0.995 : price * 1.005,
          urgency: excess > maxTolerance * 2 ? 'HIGH' : 'MEDIUM',
          reason: `Inventory ${qty} exceeds tolerance ${maxTolerance}`,
        });
      }
    }

    return orders;
  }
}

// ============================================================================
// Feature 11: Adverse Selection & Toxic Flow Defense
// VPIN calculation, dynamic fee multiplier, and quote cancellation tripwire
// ============================================================================
export class AdverseSelectionGuard {
  private config: AdverseSelectionConfig;
  private currentBucketBuyVol: number = 0;
  private currentBucketSellVol: number = 0;
  private completedBucketImbalances: number[] = [];
  private recentVolumeEvents: { volume: number; timestamp: number }[] = [];

  constructor(config?: Partial<AdverseSelectionConfig>) {
    this.config = {
      bucketSizeVolume: config?.bucketSizeVolume ?? 1_000,
      windowBucketCount: config?.windowBucketCount ?? 10,
      vpinWarningThreshold: config?.vpinWarningThreshold ?? 0.4,
      vpinCriticalThreshold: config?.vpinCriticalThreshold ?? 0.7,
      maxDynamicFeeMultiplier: config?.maxDynamicFeeMultiplier ?? 3.0,
      sweepVelocityThreshold: config?.sweepVelocityThreshold ?? 2_500,
    };
  }

  public recordTrade(volume: number, side: 'BUY' | 'SELL', timestampMs: number = Date.now()): void {
    this.recentVolumeEvents.push({ volume, timestamp: timestampMs });

    // Clean old events past 500ms
    const cutoff = timestampMs - 500;
    this.recentVolumeEvents = this.recentVolumeEvents.filter((e) => e.timestamp >= cutoff);

    if (side === 'BUY') {
      this.currentBucketBuyVol += volume;
    } else {
      this.currentBucketSellVol += volume;
    }

    while (this.currentBucketBuyVol + this.currentBucketSellVol >= this.config.bucketSizeVolume) {
      const bucketTotal = this.currentBucketBuyVol + this.currentBucketSellVol;
      const buyFraction = bucketTotal > 0 ? this.currentBucketBuyVol / bucketTotal : 0.5;
      const bucketBuy = this.config.bucketSizeVolume * buyFraction;
      const bucketSell = this.config.bucketSizeVolume * (1 - buyFraction);
      const imbalance = Math.abs(bucketBuy - bucketSell);
      this.completedBucketImbalances.push(imbalance);

      if (this.completedBucketImbalances.length > this.config.windowBucketCount) {
        this.completedBucketImbalances.shift();
      }

      this.currentBucketBuyVol = Math.max(0, this.currentBucketBuyVol - bucketBuy);
      this.currentBucketSellVol = Math.max(0, this.currentBucketSellVol - bucketSell);
    }
  }

  public assessFlow(tradeVolume: number, side: 'BUY' | 'SELL'): ToxicityAssessment {
    this.recordTrade(tradeVolume, side);

    let vpin = 0;
    if (this.completedBucketImbalances.length > 0) {
      const totalImbalance = this.completedBucketImbalances.reduce((a, b) => a + b, 0);
      const totalVol = this.completedBucketImbalances.length * this.config.bucketSizeVolume;
      vpin = Math.min(1.0, Math.max(0, totalVol > 0 ? totalImbalance / totalVol : 0));
    }

    // Check sweep burst velocity (last 100ms)
    const now = Date.now();
    const burstVol = this.recentVolumeEvents
      .filter((e) => e.timestamp >= now - 100)
      .reduce((a, b) => a + b.volume, 0);

    const isSweepBurst = burstVol > this.config.sweepVelocityThreshold;

    let toxicityLevel: ToxicityAssessment['toxicityLevel'] = 'LOW';
    let dynamicFeeMultiplier = 1.0;
    let shouldTripwirePullQuotes = false;
    let cooldownPeriodMs = 0;

    if (vpin >= this.config.vpinCriticalThreshold - 1e-6 || isSweepBurst) {
      toxicityLevel = 'CRITICAL';
      dynamicFeeMultiplier = this.config.maxDynamicFeeMultiplier;
      shouldTripwirePullQuotes = true;
      cooldownPeriodMs = 30_000;
    } else if (vpin >= this.config.vpinWarningThreshold - 1e-6) {
      toxicityLevel = 'HIGH';
      const progress =
        (vpin - this.config.vpinWarningThreshold) /
        (this.config.vpinCriticalThreshold - this.config.vpinWarningThreshold);
      dynamicFeeMultiplier = 1.0 + progress * (this.config.maxDynamicFeeMultiplier - 1.0);
    } else if (vpin >= 0.25) {
      toxicityLevel = 'MEDIUM';
      dynamicFeeMultiplier = 1.25;
    }

    return {
      vpin,
      toxicityLevel,
      dynamicFeeMultiplier,
      shouldTripwirePullQuotes,
      cooldownPeriodMs,
      reason: isSweepBurst ? 'RAPID_SWEEP_BURST_DETECTED' : undefined,
    };
  }
}

// ============================================================================
// Feature 12: Pre-Trade Risk Gates
// 5% Quarter-Kelly, max pool exposure, 15% daily drawdown, 500ms latency filter
// ============================================================================
export class AmmRiskGuard {
  public static evaluatePreTrade(
    intent: TradeIntent,
    context: RiskContext,
    config?: Partial<RiskGateConfig>
  ): RiskCheckResult {
    const maxQuarterKelly = config?.maxQuarterKellyRatio ?? 0.05;
    const maxPoolExp = config?.maxPoolExposureUsd ?? 50_000;
    const maxDrawdown = config?.maxDailyDrawdownThreshold ?? 0.15;
    const maxLatency = config?.maxVenueLatencyMs ?? 500;

    // 1. Latency Spike Gate
    if (intent.venueLatencyMs > maxLatency) {
      return {
        verdict: 'REJECTED',
        allowedNotionalUsd: 0,
        rejectionCode: 'LATENCY_SPIKE_EXCEEDED',
        reason: `Venue latency ${intent.venueLatencyMs}ms exceeds threshold ${maxLatency}ms`,
      };
    }

    // 2. Daily Drawdown Circuit Breaker Gate
    const peak = Math.max(context.peakDailyEquityUsd, context.portfolioEquityUsd);
    const drawdown = peak > 0 ? (peak - context.currentDailyEquityUsd) / peak : 0;
    if (drawdown > maxDrawdown) {
      return {
        verdict: 'REJECTED',
        allowedNotionalUsd: 0,
        rejectionCode: 'DAILY_DRAWDOWN_BREACH',
        reason: `Daily drawdown ${(drawdown * 100).toFixed(2)}% exceeds threshold ${(maxDrawdown * 100).toFixed(2)}%`,
      };
    }

    // 3. Max Pool Exposure Gate
    if (context.currentPoolExposureUsd + intent.notionalUsd > maxPoolExp) {
      return {
        verdict: 'REJECTED',
        allowedNotionalUsd: Math.max(0, maxPoolExp - context.currentPoolExposureUsd),
        rejectionCode: 'MAX_POOL_EXPOSURE_EXCEEDED',
        reason: `Pool exposure ${context.currentPoolExposureUsd + intent.notionalUsd} exceeds max ${maxPoolExp}`,
      };
    }

    // 4. Quarter-Kelly Cap Gate (5% equity cap)
    const maxKellyNotional = context.portfolioEquityUsd * maxQuarterKelly;
    if (intent.notionalUsd > maxKellyNotional) {
      return {
        verdict: 'REJECTED',
        allowedNotionalUsd: maxKellyNotional,
        rejectionCode: 'KELLY_CAP_EXCEEDED',
        reason: `Notional ${intent.notionalUsd} exceeds Quarter-Kelly limit ${maxKellyNotional}`,
      };
    }

    return {
      verdict: 'APPROVED',
      allowedNotionalUsd: intent.notionalUsd,
    };
  }
}

// ============================================================================
// Feature 13: Prometheus Metrics Instrumentation
// In-memory recorder for AMM telemetry
// ============================================================================
export class AmmMetricsRecorder {
  private liquidityDepthUsd: number = 0;
  private tradeVolumeUsd: number = 0;
  private arbitragePnlUsd: number = 0;
  private vpinToxicity: number = 0;
  private circuitBreakerTripped: boolean = false;
  private activePoolsCount: number = 0;

  public recordTrade(volumeUsd: number, pnlUsd?: number): void {
    this.tradeVolumeUsd += Math.max(0, volumeUsd);
    if (pnlUsd !== undefined) {
      this.arbitragePnlUsd += pnlUsd;
    }
  }

  public setLiquidityDepth(depthUsd: number): void {
    this.liquidityDepthUsd = Math.max(0, depthUsd);
  }

  public setVpinToxicity(vpin: number): void {
    this.vpinToxicity = Math.max(0, Math.min(1.0, vpin));
  }

  public setCircuitBreakerTripped(tripped: boolean): void {
    this.circuitBreakerTripped = tripped;
  }

  public setActivePoolsCount(count: number): void {
    this.activePoolsCount = Math.max(0, count);
  }

  public getSnapshot(): AmmMetricsSnapshot {
    return {
      liquidityDepthUsd: this.liquidityDepthUsd,
      tradeVolumeUsd: this.tradeVolumeUsd,
      arbitragePnlUsd: this.arbitragePnlUsd,
      vpinToxicity: this.vpinToxicity,
      circuitBreakerTripped: this.circuitBreakerTripped,
      activePoolsCount: this.activePoolsCount,
    };
  }
}

// ============================================================================
// Feature 14: Hash-Chained Audit Logger
// SHA-256 HMAC cryptographic chain verification
// ============================================================================
export class AmmAuditLogger {
  private hmacSecret: string;
  private chain: AmmAuditRecord[] = [];

  constructor(hmacSecret: string = 'amm-secret-audit-key-2026') {
    this.hmacSecret = hmacSecret;
  }

  public getChain(): readonly AmmAuditRecord[] {
    return this.chain;
  }

  public computeRecordHash(
    prevHash: string,
    index: number,
    timestamp: number,
    action: AmmAuditAction,
    details: Record<string, unknown>
  ): string {
    const payload = `${prevHash}:${index}:${timestamp}:${action}:${JSON.stringify(details)}`;
    return createHmac('sha256', this.hmacSecret).update(payload).digest('hex');
  }

  public logEvent(action: AmmAuditAction, details: Record<string, unknown>): AmmAuditRecord {
    const index = this.chain.length;
    const prevHash = index === 0 ? '0'.repeat(64) : this.chain[index - 1].hash;
    const timestamp = Date.now();
    const hash = this.computeRecordHash(prevHash, index, timestamp, action, details);

    const record: AmmAuditRecord = {
      index,
      timestamp,
      action,
      details,
      prevHash,
      hash,
    };

    this.chain.push(record);
    return record;
  }

  public verifyChain(): ChainVerificationResult {
    if (this.chain.length === 0) {
      return { valid: true };
    }

    for (let i = 0; i < this.chain.length; i++) {
      const record = this.chain[i];

      // Check index sequence
      if (record.index !== i) {
        return {
          valid: false,
          failedIndex: i,
          reason: `Non-contiguous index: expected ${i}, found ${record.index}`,
        };
      }

      // Check prevHash alignment
      const expectedPrev = i === 0 ? '0'.repeat(64) : this.chain[i - 1].hash;
      if (record.prevHash !== expectedPrev) {
        return {
          valid: false,
          failedIndex: i,
          reason: `prevHash mismatch at index ${i}: expected ${expectedPrev}, found ${record.prevHash}`,
        };
      }

      // Recompute and verify HMAC hash
      const recomputed = this.computeRecordHash(
        record.prevHash,
        record.index,
        record.timestamp,
        record.action,
        record.details
      );

      if (record.hash !== recomputed) {
        return {
          valid: false,
          failedIndex: i,
          reason: `Cryptographic hash corruption at index ${i}: stored ${record.hash}, recomputed ${recomputed}`,
        };
      }

      // Check monotonic timestamp
      if (i > 0 && record.timestamp < this.chain[i - 1].timestamp) {
        return {
          valid: false,
          failedIndex: i,
          reason: `Non-monotonic timestamp at index ${i}: ${record.timestamp} < ${this.chain[i - 1].timestamp}`,
        };
      }
    }

    return { valid: true };
  }
}

// ============================================================================
// Feature 15: Master AMM Engine & Lifecycle
// Unified facade integrating pricing, pools, arbitrage, risk, and telemetry
// ============================================================================
export class MasterAmmEngine {
  private pools: Map<string, MultiTokenPool> = new Map();
  private auditLogger: AmmAuditLogger;
  private metrics: AmmMetricsRecorder;
  private adverseGuard: AdverseSelectionGuard;
  private isRunning: boolean = false;

  constructor(auditSecret?: string) {
    this.auditLogger = new AmmAuditLogger(auditSecret);
    this.metrics = new AmmMetricsRecorder();
    this.adverseGuard = new AdverseSelectionGuard();
    this.isRunning = true;
  }

  public registerPool(poolConfig: MultiTokenPoolConfig): MultiTokenPool {
    const pool = new MultiTokenPool(poolConfig);
    this.pools.set(poolConfig.poolId, pool);
    this.metrics.setActivePoolsCount(this.pools.size);
    this.auditLogger.logEvent('POOL_INITIALIZED', {
      poolId: poolConfig.poolId,
      outcomes: poolConfig.outcomes.map((o) => o.id),
      initialCollateral: poolConfig.initialCollateral,
    });
    return pool;
  }

  public getPool(poolId: string): MultiTokenPool | undefined {
    return this.pools.get(poolId);
  }

  public executeTrade(
    trade: PoolTradeRequest,
    riskContext: RiskContext
  ): { success: boolean; result?: PoolTradeResult; rejection?: RiskCheckResult } {
    const pool = this.pools.get(trade.poolId);
    if (!pool) {
      throw new Error(`Pool ${trade.poolId} not found`);
    }

    const tradeIntent: TradeIntent = {
      intentId: `intent-${Date.now()}`,
      marketId: trade.poolId,
      poolId: trade.poolId,
      notionalUsd: Math.abs(trade.sharesDelta * 0.5), // estimated notional
      expectedEdgeBps: 50,
      venueLatencyMs: 25,
    };

    const riskVerdict = AmmRiskGuard.evaluatePreTrade(tradeIntent, riskContext);
    if (riskVerdict.verdict === 'REJECTED') {
      this.auditLogger.logEvent('RISK_GATE_REJECTED', {
        intentId: tradeIntent.intentId,
        reason: riskVerdict.reason,
      });
      return { success: false, rejection: riskVerdict };
    }

    this.auditLogger.logEvent('RISK_GATE_APPROVED', {
      intentId: tradeIntent.intentId,
      allowedNotionalUsd: riskVerdict.allowedNotionalUsd,
    });

    const result = pool.executeTrade(trade);
    this.metrics.recordTrade(result.netCostUsd);
    this.auditLogger.logEvent('TRADE_EXECUTED', {
      poolId: result.poolId,
      outcomeId: result.outcomeId,
      netCostUsd: result.netCostUsd,
    });

    return { success: true, result };
  }

  public getAuditLogger(): AmmAuditLogger {
    return this.auditLogger;
  }

  public getMetrics(): AmmMetricsRecorder {
    return this.metrics;
  }

  public getAdverseGuard(): AdverseSelectionGuard {
    return this.adverseGuard;
  }

  public shutdown(): void {
    this.isRunning = false;
  }

  public isActive(): boolean {
    return this.isRunning;
  }
}
