/**
 * Net Profitability Calculator
 * Evaluates net arbitrage profitability after accounting for dynamic exchange fees,
 * on-chain Polygon gas costs, and order book depth VWAP slippage.
 */

import { z } from 'zod';
import {
  calcTakerFee,
  calcMakerRebate,
  classifyMarketCategory,
  FEE_SCHEDULES,
  type PolymarketCategory,
} from '../polymarket/polymarket-fee-calculator';

/**
 * Numerical precision margin for hurdle comparison to prevent IEEE-754
 * floating-point subtraction noise from rejecting exact threshold opportunities.
 */
export const HURDLE_EPSILON_BPS = 1e-6;

// ── Level & Depth Schemas ───────────────────────────────────────────────────

export const OrderBookLevelSchema = z.union([
  z.object({
    price: z.number().positive('Level price must be positive'),
    amount: z.number().positive('Level amount must be positive'),
  }),
  z.tuple([z.number().positive(), z.number().positive()]).transform(([price, amount]) => ({
    price,
    amount,
  })),
]);

export type OrderBookLevel = { price: number; amount: number };

export const OrderBookDepthSchema = z.object({
  bids: z.array(OrderBookLevelSchema).default([]),
  asks: z.array(OrderBookLevelSchema).default([]),
});

export type OrderBookDepth = {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
};

// Raw type accepting either tuple or object for flexible call sites
export type RawOrderBookDepth = {
  bids?: Array<OrderBookLevel | [number, number]>;
  asks?: Array<OrderBookLevel | [number, number]>;
};

// ── Venue Trade Leg Schemas ─────────────────────────────────────────────────

export const VenueTradeLegSchema = z.object({
  venue: z.string().min(1, 'Venue identifier required'),
  symbol: z.string().min(1, 'Trading symbol required'),
  side: z.enum(['buy', 'sell']),
  price: z.number(),
  amount: z.number().optional(),
  orderType: z.enum(['taker', 'maker']).default('taker'),
  polymarketCategory: z
    .enum([
      'crypto',
      'politics',
      'finance',
      'tech',
      'culture',
      'sports',
      'science',
      'pop_culture',
      'geopolitics',
      'world_events',
    ])
    .optional(),
  marketDescription: z.string().optional(),
  settlementType: z.enum(['off_chain_clob', 'on_chain_settle']).default('off_chain_clob'),
  orderBook: OrderBookDepthSchema.optional(),
  volume24hUsd: z.number().nonnegative().optional(),
});

export type VenueTradeLegInput = z.input<typeof VenueTradeLegSchema>;
export type VenueTradeLeg = z.output<typeof VenueTradeLegSchema>;

// ── Configuration Schemas ───────────────────────────────────────────────────

export const SlippageModelConfigSchema = z.object({
  cexBaseSlippageBps: z.number().nonnegative().default(2.0),
  cexImpactFactorBps: z.number().nonnegative().default(50.0),
  cexDefaultLiquidityUsd: z.number().positive().default(50_000_000),
  polyBaseSlippageBps: z.number().nonnegative().default(15.0),
  polyImpactFactorBps: z.number().nonnegative().default(200.0),
  polyDefaultLiquidityUsd: z.number().positive().default(500_000),
  impactAlpha: z.number().positive().default(0.5),
});

export type SlippageModelConfig = z.infer<typeof SlippageModelConfigSchema>;

export const GasConfigSchema = z.object({
  polygonGasUnits: z.number().positive().default(150_000),
  polygonGasPriceGwei: z.number().positive().default(50),
  maticPriceUsd: z.number().positive().default(0.50),
  polygonFlatGasUsd: z.number().nonnegative().default(0.02),
});

export type GasConfig = z.infer<typeof GasConfigSchema>;

export const NetProfitabilityInputSchema = z.object({
  buyLeg: VenueTradeLegSchema,
  sellLeg: VenueTradeLegSchema,
  tradeAmount: z.number().positive().optional(),
  minHurdleBps: z.number().nonnegative().default(10.0),
  feeOverrides: z
    .object({
      buyFeeRate: z.number().min(0).max(1).optional(),
      sellFeeRate: z.number().min(0).max(1).optional(),
    })
    .optional(),
  gasOverrides: z
    .object({
      polygonGasUsd: z.number().nonnegative().optional(),
    })
    .optional(),
  slippageModel: z.enum(['auto', 'vwap_orderbook', 'volume_based', 'fixed_bps']).default('auto'),
  slippageConfig: SlippageModelConfigSchema.partial().optional(),
  gasConfig: GasConfigSchema.partial().optional(),
});

export type NetProfitabilityInput = z.input<typeof NetProfitabilityInputSchema>;
export type NetProfitabilityResolved = z.output<typeof NetProfitabilityInputSchema>;

// ── Result Schema (Aligned with PROJECT.md) ─────────────────────────────────

export type RejectionReason =
  | 'NEGATIVE_GROSS_SPREAD'
  | 'ZERO_ORDERBOOK_DEPTH'
  | 'INSUFFICIENT_LIQUIDITY'
  | 'MASSIVE_FEE_SPIKE'
  | 'MASSIVE_GAS_SPIKE'
  | 'EXCESSIVE_SLIPPAGE'
  | 'BELOW_HURDLE'
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_VENUE';

export interface VwapSlippageResult {
  vwap: number;
  slippageUsd: number;
  slippageBps: number;
  filledAmount: number;
  insufficientLiquidity: boolean;
}

export interface NetProfitabilityAnalysis {
  isProfitable: boolean;
  grossSpreadUsd: number;
  grossSpreadBps: number;
  estimatedBuyFeeUsd: number;
  estimatedSellFeeUsd: number;
  estimatedGasUsd: number;
  estimatedBuySlippageUsd: number;
  estimatedSellSlippageUsd: number;
  totalCostUsd: number;
  netProfitUsd: number;
  netProfitBps: number;
  rejectionReason?: RejectionReason | string;
  breakdown?: {
    effectiveTradeAmount: number;
    buyNotionalUsd: number;
    sellNotionalUsd: number;
    buyFeeRate: number;
    sellFeeRate: number;
    buyVwap?: number;
    sellVwap?: number;
    buySlippageBps: number;
    sellSlippageBps: number;
    hasZeroDepth: boolean;
    insufficientLiquidity: boolean;
    availableDepthBuy?: number;
    availableDepthSell?: number;
  };
}

export interface CalculatorConstructorOptions {
  defaultHurdleBps?: number;
  maticPriceUsd?: number;
  gasConfig?: Partial<GasConfig>;
  slippageConfig?: Partial<SlippageModelConfig>;
}

export class NetProfitabilityCalculator {
  private readonly defaultGasConfig: GasConfig;
  private readonly defaultSlippageConfig: SlippageModelConfig;
  private readonly defaultHurdleBps: number;

  constructor(options?: CalculatorConstructorOptions) {
    const rawGas = { ...options?.gasConfig };
    if (options?.maticPriceUsd !== undefined) {
      rawGas.maticPriceUsd = options.maticPriceUsd;
    }
    this.defaultGasConfig = GasConfigSchema.parse(rawGas);
    this.defaultSlippageConfig = SlippageModelConfigSchema.parse(options?.slippageConfig ?? {});
    this.defaultHurdleBps = options?.defaultHurdleBps ?? 10.0;
  }

  /**
   * Main calculation entry point.
   */
  calculate(rawInput: NetProfitabilityInput): NetProfitabilityAnalysis {
    return this.evaluate(rawInput);
  }

  /**
   * Evaluate net profitability of an arbitrage opportunity.
   * Alias for evaluate() to maintain compatibility across naming conventions.
   */
  evaluateNetProfitability(rawInput: NetProfitabilityInput): NetProfitabilityAnalysis {
    return this.evaluate(rawInput);
  }

  /**
   * Pure evaluation logic.
   */
  evaluate(rawInput: NetProfitabilityInput): NetProfitabilityAnalysis {
    // 1. Validate Input Structure
    const parseResult = NetProfitabilityInputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      return this.buildInvalidResponse(parseResult.error.message);
    }
    const input = parseResult.data;

    const buyPrice = input.buyLeg.price;
    const sellPrice = input.sellLeg.price;
    const effectiveTradeAmount =
      input.tradeAmount ?? input.buyLeg.amount ?? input.sellLeg.amount ?? 1.0;

    // Zero / Negative price / amount check
    if (
      buyPrice <= 0 ||
      sellPrice <= 0 ||
      effectiveTradeAmount <= 0 ||
      !Number.isFinite(buyPrice) ||
      !Number.isFinite(sellPrice) ||
      !Number.isFinite(effectiveTradeAmount)
    ) {
      return this.buildInvalidResponse('Price and amount must be positive, finite numbers');
    }

    const buyNotionalUsd = buyPrice * effectiveTradeAmount;
    const sellNotionalUsd = sellPrice * effectiveTradeAmount;

    // 2. Gross Spread Calculation
    const grossSpreadUsd = (sellPrice - buyPrice) * effectiveTradeAmount;
    const grossSpreadBps = buyPrice > 0 ? ((sellPrice - buyPrice) / buyPrice) * 10_000 : 0;

    // Fast-fail: Negative or zero gross spread
    if (grossSpreadUsd <= 0) {
      return {
        isProfitable: false,
        grossSpreadUsd,
        grossSpreadBps,
        estimatedBuyFeeUsd: 0,
        estimatedSellFeeUsd: 0,
        estimatedGasUsd: 0,
        estimatedBuySlippageUsd: 0,
        estimatedSellSlippageUsd: 0,
        totalCostUsd: 0,
        netProfitUsd: grossSpreadUsd,
        netProfitBps: grossSpreadBps,
        rejectionReason: 'NEGATIVE_GROSS_SPREAD',
        breakdown: {
          effectiveTradeAmount,
          buyNotionalUsd,
          sellNotionalUsd,
          buyFeeRate: 0,
          sellFeeRate: 0,
          buySlippageBps: 0,
          sellSlippageBps: 0,
          hasZeroDepth: false,
          insufficientLiquidity: false,
        },
      };
    }

    // 3. Dynamic Fee Engine
    const buyFeeCalc = this.calculateLegFee(input.buyLeg, buyNotionalUsd, input.feeOverrides?.buyFeeRate);
    const sellFeeCalc = this.calculateLegFee(input.sellLeg, sellNotionalUsd, input.feeOverrides?.sellFeeRate);

    const estimatedBuyFeeUsd = buyFeeCalc.feeUsd;
    const estimatedSellFeeUsd = sellFeeCalc.feeUsd;
    const totalFeesUsd = estimatedBuyFeeUsd + estimatedSellFeeUsd;

    // 4. Gas Cost Modeling
    const gasConfig = { ...this.defaultGasConfig, ...input.gasConfig };
    const buyGasUsd = this.calculateLegGas(input.buyLeg, gasConfig, input.gasOverrides?.polygonGasUsd);
    const sellGasUsd = this.calculateLegGas(input.sellLeg, gasConfig, input.gasOverrides?.polygonGasUsd);
    const estimatedGasUsd = buyGasUsd + sellGasUsd;

    // 5. Slippage Engine
    const slippageConfig = { ...this.defaultSlippageConfig, ...input.slippageConfig };
    const slippageMode = input.slippageModel ?? 'auto';

    let buySlippageResult: VwapSlippageResult;
    let sellSlippageResult: VwapSlippageResult;
    let hasZeroDepth = false;

    // Buy Leg Slippage
    if (
      (slippageMode === 'vwap_orderbook' || slippageMode === 'auto') &&
      input.buyLeg.orderBook
    ) {
      if (!input.buyLeg.orderBook.asks || input.buyLeg.orderBook.asks.length === 0) {
        hasZeroDepth = true;
        buySlippageResult = {
          vwap: 0,
          slippageUsd: 0,
          slippageBps: 0,
          filledAmount: 0,
          insufficientLiquidity: true,
        };
      } else {
        buySlippageResult = this.calculateVwapSlippage(input.buyLeg.orderBook, 'buy', effectiveTradeAmount);
      }
    } else {
      buySlippageResult = this.calculateParametricSlippage(
        input.buyLeg.venue,
        buyNotionalUsd,
        slippageConfig
      );
    }

    // Sell Leg Slippage
    if (
      (slippageMode === 'vwap_orderbook' || slippageMode === 'auto') &&
      input.sellLeg.orderBook
    ) {
      if (!input.sellLeg.orderBook.bids || input.sellLeg.orderBook.bids.length === 0) {
        hasZeroDepth = true;
        sellSlippageResult = {
          vwap: 0,
          slippageUsd: 0,
          slippageBps: 0,
          filledAmount: 0,
          insufficientLiquidity: true,
        };
      } else {
        sellSlippageResult = this.calculateVwapSlippage(input.sellLeg.orderBook, 'sell', effectiveTradeAmount);
      }
    } else {
      sellSlippageResult = this.calculateParametricSlippage(
        input.sellLeg.venue,
        sellNotionalUsd,
        slippageConfig
      );
    }

    const estimatedBuySlippageUsd = buySlippageResult.slippageUsd;
    const estimatedSellSlippageUsd = sellSlippageResult.slippageUsd;
    const totalSlippageUsd = estimatedBuySlippageUsd + estimatedSellSlippageUsd;

    // 6. Net Profitability Synthesis
    const totalCostUsd = totalFeesUsd + estimatedGasUsd + totalSlippageUsd;
    const netProfitUsd = grossSpreadUsd - totalCostUsd;
    const netProfitBps = buyNotionalUsd > 0 ? (netProfitUsd / buyNotionalUsd) * 10_000 : 0;
    const minHurdleBps = input.minHurdleBps ?? this.defaultHurdleBps;

    // 7. Decision Rule & Rejection Categorization
    let isProfitable = false;
    let rejectionReason: RejectionReason | undefined;

    if (hasZeroDepth) {
      isProfitable = false;
      rejectionReason = 'ZERO_ORDERBOOK_DEPTH';
    } else if (buySlippageResult.insufficientLiquidity || sellSlippageResult.insufficientLiquidity) {
      isProfitable = false;
      rejectionReason = 'INSUFFICIENT_LIQUIDITY';
    } else if (totalFeesUsd >= grossSpreadUsd) {
      isProfitable = false;
      rejectionReason = 'MASSIVE_FEE_SPIKE';
    } else if (estimatedGasUsd >= (grossSpreadUsd - totalFeesUsd)) {
      isProfitable = false;
      rejectionReason = 'MASSIVE_GAS_SPIKE';
    } else if (
      totalCostUsd >= grossSpreadUsd ||
      netProfitUsd <= 0 ||
      netProfitBps < minHurdleBps - HURDLE_EPSILON_BPS
    ) {
      isProfitable = false;
      rejectionReason = 'BELOW_HURDLE';
    } else {
      isProfitable = true;
      rejectionReason = undefined;
    }

    return {
      isProfitable,
      grossSpreadUsd,
      grossSpreadBps,
      estimatedBuyFeeUsd,
      estimatedSellFeeUsd,
      estimatedGasUsd,
      estimatedBuySlippageUsd,
      estimatedSellSlippageUsd,
      totalCostUsd,
      netProfitUsd,
      netProfitBps,
      rejectionReason,
      breakdown: {
        effectiveTradeAmount,
        buyNotionalUsd,
        sellNotionalUsd,
        buyFeeRate: buyFeeCalc.rate,
        sellFeeRate: sellFeeCalc.rate,
        buyVwap: buySlippageResult.vwap > 0 ? buySlippageResult.vwap : undefined,
        sellVwap: sellSlippageResult.vwap > 0 ? sellSlippageResult.vwap : undefined,
        buySlippageBps: buySlippageResult.slippageBps,
        sellSlippageBps: sellSlippageResult.slippageBps,
        hasZeroDepth,
        insufficientLiquidity:
          buySlippageResult.insufficientLiquidity || sellSlippageResult.insufficientLiquidity,
        availableDepthBuy: buySlippageResult.filledAmount,
        availableDepthSell: sellSlippageResult.filledAmount,
      },
    };
  }

  /**
   * Helper: Calculate VWAP slippage across order book levels.
   */
  calculateVwapSlippage(
    orderBook: RawOrderBookDepth,
    side: 'buy' | 'sell',
    targetAmount: number
  ): VwapSlippageResult {
    if (!orderBook || targetAmount <= 0) {
      return {
        vwap: 0,
        slippageUsd: 0,
        slippageBps: 0,
        filledAmount: 0,
        insufficientLiquidity: true,
      };
    }

    if (side === 'buy') {
      const rawAsks = orderBook.asks ?? [];
      if (rawAsks.length === 0) {
        return {
          vwap: 0,
          slippageUsd: 0,
          slippageBps: 0,
          filledAmount: 0,
          insufficientLiquidity: true,
        };
      }

      // Normalize levels to { price, amount } and sort ascending by price
      const sortedAsks = rawAsks
        .map((lvl) => (Array.isArray(lvl) ? { price: lvl[0], amount: lvl[1] } : lvl))
        .filter((lvl) => lvl.price > 0 && lvl.amount > 0)
        .sort((a, b) => a.price - b.price);

      if (sortedAsks.length === 0) {
        return {
          vwap: 0,
          slippageUsd: 0,
          slippageBps: 0,
          filledAmount: 0,
          insufficientLiquidity: true,
        };
      }

      const bestAsk = sortedAsks[0].price;
      let remaining = targetAmount;
      let totalCost = 0;
      let totalFilled = 0;

      for (const level of sortedAsks) {
        const fill = Math.min(remaining, level.amount);
        totalCost += fill * level.price;
        totalFilled += fill;
        remaining -= fill;
        if (remaining <= 0) break;
      }

      const insufficientLiquidity = remaining > 0;
      const vwap = totalFilled > 0 ? totalCost / totalFilled : 0;
      const slippagePerUnit = Math.max(0, vwap - bestAsk);
      const slippageUsd = slippagePerUnit * totalFilled;
      const slippageBps = bestAsk > 0 ? (slippagePerUnit / bestAsk) * 10_000 : 0;

      return {
        vwap,
        slippageUsd,
        slippageBps,
        filledAmount: totalFilled,
        insufficientLiquidity,
      };
    } else {
      // side === 'sell'
      const rawBids = orderBook.bids ?? [];
      if (rawBids.length === 0) {
        return {
          vwap: 0,
          slippageUsd: 0,
          slippageBps: 0,
          filledAmount: 0,
          insufficientLiquidity: true,
        };
      }

      // Normalize levels to { price, amount } and sort descending by price
      const sortedBids = rawBids
        .map((lvl) => (Array.isArray(lvl) ? { price: lvl[0], amount: lvl[1] } : lvl))
        .filter((lvl) => lvl.price > 0 && lvl.amount > 0)
        .sort((a, b) => b.price - a.price);

      if (sortedBids.length === 0) {
        return {
          vwap: 0,
          slippageUsd: 0,
          slippageBps: 0,
          filledAmount: 0,
          insufficientLiquidity: true,
        };
      }

      const bestBid = sortedBids[0].price;
      let remaining = targetAmount;
      let totalRevenue = 0;
      let totalFilled = 0;

      for (const level of sortedBids) {
        const fill = Math.min(remaining, level.amount);
        totalRevenue += fill * level.price;
        totalFilled += fill;
        remaining -= fill;
        if (remaining <= 0) break;
      }

      const insufficientLiquidity = remaining > 0;
      const vwap = totalFilled > 0 ? totalRevenue / totalFilled : 0;
      const slippagePerUnit = Math.max(0, bestBid - vwap);
      const slippageUsd = slippagePerUnit * totalFilled;
      const slippageBps = bestBid > 0 ? (slippagePerUnit / bestBid) * 10_000 : 0;

      return {
        vwap,
        slippageUsd,
        slippageBps,
        filledAmount: totalFilled,
        insufficientLiquidity,
      };
    }
  }

  /**
   * Helper: Calculate Polymarket dynamic fee rate and dollar amount.
   */
  calculatePolymarketFee(
    category: PolymarketCategory,
    probability: number,
    notionalUsd: number
  ): { rate: number; feeUsd: number; rebateUsd: number } {
    const clampedP = Math.min(Math.max(probability, 0.001), 0.999);
    const rate = calcTakerFee(category, clampedP);
    const feeUsd = notionalUsd * rate;
    const rebateUsd = calcMakerRebate(category, feeUsd);

    return {
      rate,
      feeUsd,
      rebateUsd,
    };
  }

  /**
   * Adapter: Calculate net profitability directly from a SpreadDetector ArbitrageOpportunity.
   */
  fromSpreadOpportunity(
    opp: {
      buyExchange: string;
      sellExchange: string;
      symbol: string;
      buyPrice: number;
      sellPrice: number;
      amount?: number;
      id?: string;
    },
    options?: {
      minHurdleBps?: number;
      settlementType?: 'off_chain_clob' | 'on_chain_settle';
      polymarketCategory?: PolymarketCategory;
    }
  ): NetProfitabilityAnalysis {
    const amount = opp.amount ?? 1.0;
    return this.calculate({
      buyLeg: {
        venue: opp.buyExchange,
        symbol: opp.symbol,
        side: 'buy',
        price: opp.buyPrice,
        amount,
        settlementType: options?.settlementType ?? 'off_chain_clob',
        polymarketCategory: options?.polymarketCategory,
      },
      sellLeg: {
        venue: opp.sellExchange,
        symbol: opp.symbol,
        side: 'sell',
        price: opp.sellPrice,
        amount,
        settlementType: options?.settlementType ?? 'off_chain_clob',
        polymarketCategory: options?.polymarketCategory,
      },
      tradeAmount: amount,
      minHurdleBps: options?.minHurdleBps ?? this.defaultHurdleBps,
    });
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  private calculateLegFee(
    leg: VenueTradeLeg,
    notionalUsd: number,
    feeOverride?: number
  ): { rate: number; feeUsd: number } {
    if (feeOverride !== undefined) {
      return { rate: feeOverride, feeUsd: notionalUsd * feeOverride };
    }

    const venue = leg.venue.toLowerCase();
    if (venue === 'polymarket') {
      const category: PolymarketCategory =
        leg.polymarketCategory ??
        (leg.marketDescription ? classifyMarketCategory(leg.marketDescription) : 'crypto');

      const clampedP = Math.min(Math.max(leg.price, 0.001), 0.999);
      const schedule = FEE_SCHEDULES[category];

      if (schedule.exempt) {
        return { rate: 0, feeUsd: 0 };
      }

      if (leg.orderType === 'maker') {
        const takerRate = calcTakerFee(category, clampedP);
        // Maker rebate reduces net cost
        const rebateRate = takerRate * schedule.makerRebatePct;
        return { rate: -rebateRate, feeUsd: -notionalUsd * rebateRate };
      }

      const takerRate = calcTakerFee(category, clampedP);
      return { rate: takerRate, feeUsd: notionalUsd * takerRate };
    }

    // Default CEX venues (Binance, Bybit, KuCoin) standard 10 bps (0.10%)
    const defaultCexRate = 0.0010;
    return { rate: defaultCexRate, feeUsd: notionalUsd * defaultCexRate };
  }

  private calculateLegGas(
    leg: VenueTradeLeg,
    gasConfig: GasConfig,
    gasOverrideUsd?: number
  ): number {
    if (gasOverrideUsd !== undefined) {
      return gasOverrideUsd;
    }

    const venue = leg.venue.toLowerCase();
    if (venue === 'polymarket' && leg.settlementType === 'on_chain_settle') {
      // Polygon PoS formula: gasUnits * gasPriceGwei * 1e-9 * maticPriceUsd
      const formulaGas =
        gasConfig.polygonGasUnits *
        gasConfig.polygonGasPriceGwei *
        1e-9 *
        gasConfig.maticPriceUsd;
      return Math.max(formulaGas, 0);
    }

    // CEX matching and Polymarket off-chain CLOB have $0 on-chain gas
    return 0.0;
  }

  private calculateParametricSlippage(
    venue: string,
    notionalUsd: number,
    cfg: SlippageModelConfig
  ): VwapSlippageResult {
    const isPoly = venue.toLowerCase() === 'polymarket';
    const baseBps = isPoly ? cfg.polyBaseSlippageBps : cfg.cexBaseSlippageBps;
    const impactFactor = isPoly ? cfg.polyImpactFactorBps : cfg.cexImpactFactorBps;
    const liquidity = isPoly ? cfg.polyDefaultLiquidityUsd : cfg.cexDefaultLiquidityUsd;

    const ratio = Math.max(0, notionalUsd / liquidity);
    const impactBps = impactFactor * Math.pow(ratio, cfg.impactAlpha);
    const slippageBps = baseBps + impactBps;
    const slippageUsd = notionalUsd * (slippageBps / 10_000);

    return {
      vwap: 0,
      slippageUsd,
      slippageBps,
      filledAmount: notionalUsd,
      insufficientLiquidity: false,
    };
  }

  private buildInvalidResponse(_reason: string): NetProfitabilityAnalysis {
    return {
      isProfitable: false,
      grossSpreadUsd: 0,
      grossSpreadBps: 0,
      estimatedBuyFeeUsd: 0,
      estimatedSellFeeUsd: 0,
      estimatedGasUsd: 0,
      estimatedBuySlippageUsd: 0,
      estimatedSellSlippageUsd: 0,
      totalCostUsd: 0,
      netProfitUsd: 0,
      netProfitBps: 0,
      rejectionReason: 'INVALID_INPUT',
    };
  }
}
