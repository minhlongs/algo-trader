/**
 * Risk API Route Schemas
 * Zod validation schemas for /api/v1/risk/* endpoints
 */

import { z } from 'zod';

export const positionSchema = z.object({
  symbol: z.string().min(1),
  currentValue: z.number().positive(),
  side: z.enum(['long', 'short']).default('long'),
  returns: z.array(z.number()),
  dailyVolatility: z.number().nonnegative().optional(),
});

export const varRequestSchema = z.object({
  positions: z.array(positionSchema).min(1).max(50),
  confidence: z.enum(['0.95', '0.99']).default('0.95'),
  horizonDays: z.number().int().positive().max(365).default(1),
  method: z.enum(['parametric', 'historical', 'both']).default('both'),
});

export const correlationRequestSchema = z.object({
  positions: z.array(
    z.object({
      symbol: z.string().min(1),
      returns: z.array(z.number()),
    }),
  ).min(2).max(50),
});

export const drawdownAlertSchema = z.object({
  dailyThreshold: z.number().min(0).max(1).optional(),
  totalThreshold: z.number().min(0).max(1).optional(),
  maxConsecutiveLosses: z.number().int().positive().optional(),
});

export const atrStopSchema = z.object({
  symbol: z.string().min(1),
  candles: z.array(
    z.object({
      high: z.number(),
      low: z.number(),
      close: z.number(),
    }),
  ).min(15),
  direction: z.enum(['long', 'short']),
  period: z.number().int().min(2).max(100).default(14),
  multiplier: z.number().positive().default(2.0),
});

export const kellySchema = z.object({
  winProbability: z.number().min(0).max(1),
  winLossRatio: z.number().positive(),
  portfolioValue: z.number().positive(),
  correlation: z.number().min(-1).max(1).default(0),
  currentExposure: z.number().nonnegative().default(0),
  kellyFraction: z.number().min(0.1).max(0.5).optional(),
});

export const kellyHistorySchema = z.object({
  tradeReturns: z.array(z.number()).min(1),
  portfolioValue: z.number().positive(),
  correlation: z.number().min(-1).max(1).default(0),
  kellyFraction: z.number().min(0.1).max(0.5).optional(),
});
