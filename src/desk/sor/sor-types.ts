import * as z from 'zod';

export const VenueIdSchema = z.enum([
  'binance',
  'bybit',
  'polymarket_clob',
  'amm_cpmm',
  'amm_lmsr',
]);
export type VenueId = z.infer<typeof VenueIdSchema>;

export const OrderSideSchema = z.enum(['BUY', 'SELL']);
export type OrderSide = z.infer<typeof OrderSideSchema>;

export const UrgencySchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type Urgency = z.infer<typeof UrgencySchema>;

export const ExecutionStrategySchema = z.enum(['MARKET', 'TWAP', 'VWAP', 'ICEBERG']);
export type ExecutionStrategy = z.infer<typeof ExecutionStrategySchema>;

export const OrderBookLevelSchema = z.tuple([
  z.number().positive(),
  z.number().nonnegative(),
]);
export type OrderBookLevel = z.infer<typeof OrderBookLevelSchema>;

export const VenueBookSchema = z.object({
  venueId: VenueIdSchema,
  symbol: z.string().min(1),
  bids: z.array(OrderBookLevelSchema),
  asks: z.array(OrderBookLevelSchema),
  takerFeeBps: z.number().nonnegative(),
  makerFeeBps: z.number().nonnegative().optional(),
  gasCostUsd: z.number().nonnegative().optional(),
  timestamp: z.number().int().nonnegative().optional(),
});
export type VenueBook = z.infer<typeof VenueBookSchema>;
export type VenueOrderBook = VenueBook;

export const OrderSliceSchema = z.object({
  venueId: VenueIdSchema,
  quantity: z.number().positive(),
  limitPrice: z.number().positive(),
  feeUsd: z.number().nonnegative(),
  gasCostUsd: z.number().nonnegative(),
  effectivePrice: z.number().positive().optional(),
  netProceedsOrCost: z.number().optional(),
});
export type OrderSlice = z.infer<typeof OrderSliceSchema>;
export type VenueOrderSlice = OrderSlice;

export const RoutingRequestSchema = z.object({
  symbol: z.string().min(1),
  side: OrderSideSchema,
  targetQuantity: z.number().positive(),
  maxSlippageBps: z.number().nonnegative().default(50),
  urgency: UrgencySchema.default('MEDIUM'),
  executionStrategy: ExecutionStrategySchema.optional(),
  limitPrice: z.number().positive().optional(),
});
export type RoutingRequest = z.infer<typeof RoutingRequestSchema>;

export const RoutingPlanSchema = z.object({
  routeId: z.string().min(1),
  symbol: z.string().min(1),
  side: OrderSideSchema,
  totalQuantity: z.number().nonnegative(),
  allocations: z.array(OrderSliceSchema),
  expectedEffectivePrice: z.number().nonnegative(),
  expectedTotalFeeUsd: z.number().nonnegative(),
  expectedGasCostUsd: z.number().nonnegative(),
  expectedNetProceedsUsd: z.number(),
  priceImprovementBps: z.number(),
  naiveBestVenue: z.string().optional(),
  naiveTotalCostUsd: z.number().optional(),
  timestamp: z.number().int().nonnegative().default(() => Date.now()),
});
export type RoutingPlan = z.infer<typeof RoutingPlanSchema>;

export const SlicingConfigSchema = z.object({
  strategy: ExecutionStrategySchema,
  slicesCount: z.number().int().positive().default(5),
  intervalMs: z.number().int().nonnegative().default(1000),
  jitterBps: z.number().int().nonnegative().default(1500),
  volumeProfile: z.array(z.number().nonnegative()).optional(),
  displayChunkRatio: z.number().min(0.01).max(1.0).default(0.20),
  minRefillDelayMs: z.number().int().nonnegative().default(50),
  maxRefillDelayMs: z.number().int().nonnegative().default(250),
  maxSlippageBps: z.number().nonnegative().default(50),
});
export type SlicingConfig = z.infer<typeof SlicingConfigSchema>;

export const SliceExecutionRecordSchema = z.object({
  sliceIndex: z.number().int().nonnegative(),
  quantity: z.number().nonnegative(),
  price: z.number().nonnegative(),
  feeUsd: z.number().nonnegative(),
  gasUsd: z.number().nonnegative(),
  timestamp: z.number().int().nonnegative(),
});
export type SliceExecutionRecord = z.infer<typeof SliceExecutionRecordSchema>;

export const ExecutionProgressSchema = z.object({
  orderId: z.string().min(1),
  strategy: ExecutionStrategySchema,
  totalQuantity: z.number().positive(),
  filledQuantity: z.number().nonnegative(),
  remainingQuantity: z.number().nonnegative(),
  completedSlices: z.number().int().nonnegative(),
  totalSlices: z.number().int().nonnegative(),
  averagePrice: z.number().nonnegative(),
  totalFeesUsd: z.number().nonnegative(),
  totalGasUsd: z.number().nonnegative(),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'CANCELLED', 'FAILED']),
  slices: z.array(SliceExecutionRecordSchema),
});
export type ExecutionProgress = z.infer<typeof ExecutionProgressSchema>;
