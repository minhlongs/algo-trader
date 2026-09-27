/**
 * Zod configuration schemas and inferred types for MARL Market-Making.
 * Validates Avellaneda-Stoikov parameters, Quoting Engine settings, and Replay configurations.
 */

import { z } from 'zod';

export const AvellanedaStoikovConfigSchema = z.object({
  gamma: z.number().positive('Risk aversion gamma must be > 0').default(0.1),
  kappa: z.number().positive('Orderbook intensity kappa must be > 0').default(1.5),
  sigma: z.number().nonnegative('Volatility sigma must be >= 0').default(0.02),
  terminalHorizonSec: z.number().positive('Terminal horizon must be > 0').default(86_400),
  tickSize: z.number().positive('Tick size must be > 0').default(0.01),
  minSpread: z.number().nonnegative('Min spread must be >= 0').default(0.02),
  maxSpread: z.number().positive('Max spread must be > 0').default(0.20),
  maxInventory: z.number().positive('Max inventory must be > 0').default(10_000),
  quoteSize: z.number().positive('Quote size must be > 0').default(100),
});

export type AvellanedaStoikovConfig = z.infer<typeof AvellanedaStoikovConfigSchema>;

export const QuotingEngineConfigSchema = z.object({
  symbol: z.string().min(1, 'Symbol cannot be empty'),
  venue: z.string().default('polymarket'),
  tickIntervalMs: z.number().int().positive().default(1_000),
  aggregationMode: z.enum(['best_quote', 'weighted_average', 'consensus']).default('best_quote'),
  maxPositionFraction: z.number().min(0.01).max(1.0).default(0.05),
  inventoryLimit: z.number().positive().default(10_000),
  quoteTimeoutMs: z.number().int().positive().default(5_000),
  minConfidence: z.number().min(0.0).max(1.0).default(0.5),
});

export type QuotingEngineConfig = z.infer<typeof QuotingEngineConfigSchema>;

export const MarketReplayConfigSchema = z.object({
  symbol: z.string().min(1, 'Symbol cannot be empty').default('REPLAY'),
  venue: z.string().default('polymarket'),
  initialMidPrice: z.number().positive().default(0.50),
  initialInventory: z.number().default(0),
  tickSize: z.number().positive().default(0.01),
  stepCount: z.number().int().positive().default(100),
  timeStepSec: z.number().positive().default(1.0),
  randomSeed: z.number().optional(),
  arrivalIntensity: z.number().positive().default(1.0),
  queueDepletionFactor: z.number().min(0).max(1).default(0.5),
  volatility: z.number().nonnegative().default(0.02),
});

export type MarketReplayConfig = z.infer<typeof MarketReplayConfigSchema>;
