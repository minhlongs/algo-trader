/**
 * Profitability Types & Schemas
 * Zod schemas and TypeScript type declarations for arbitrage profitability evaluation.
 */

import { z } from 'zod';

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

// ── Result Types ────────────────────────────────────────────────────────────

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
