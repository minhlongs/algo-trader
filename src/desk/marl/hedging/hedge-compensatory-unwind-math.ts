/**
 * Pure Unwind Schedule, Quote Skew & Residual Delta Math for MARL Cross-Venue Hedging.
 */
import { z } from 'zod';

export type SupportedVenue = 'polymarket' | 'binance' | 'bybit' | 'kucoin';

export const CompensatoryUnwindConfigSchema = z.object({
  maxRetries: z.number().int().nonnegative().default(3),
  fallbackVenue: z.enum(['binance', 'bybit', 'polymarket']).default('bybit'),
  skewSensitivity: z.number().positive().default(0.1),
  maxSkewMultiplier: z.number().positive().default(3.0),
  emergencyDeltaThreshold: z.number().positive().default(1.0),
  emergencyLiquidation: z.boolean().default(true),
  backoffBaseMs: z.number().int().positive().default(20),
  minLotSize: z.number().positive().default(0.001),
});

export type CompensatoryUnwindConfig = z.infer<typeof CompensatoryUnwindConfigSchema>;

export interface QuoteSkewAdjustment {
  vulnerableSide: 'bid' | 'ask' | 'none';
  bidSpreadMultiplier: number;
  askSpreadMultiplier: number;
  skewFactor: number;
}

export interface CompensatoryUnwindResult {
  unwindSuccess: boolean;
  residualDelta: number;
  filledAmount: number;
  unwoundAmount: number;
  retryCount: number;
  actionTaken: 'secondary_cex_filled' | 'poly_liquidated' | 'emergency_market' | 'quote_skewed' | 'none';
  quoteSkew?: QuoteSkewAdjustment;
  error?: string;
}

export function computeResidualDelta(targetAmount: number, filledAmount: number, side: 'buy' | 'sell'): number {
  const rawResidual = Math.max(0, targetAmount - filledAmount);
  if (rawResidual < 1e-6) return 0;
  return side === 'buy' ? rawResidual : -rawResidual;
}

export function computeQuoteSkewAdjustment(
  residualDelta: number,
  sensitivity: number,
  maxSkewMultiplier: number,
): QuoteSkewAdjustment {
  const absResidual = Math.abs(residualDelta);
  if (absResidual < 1e-6) {
    return { vulnerableSide: 'none', bidSpreadMultiplier: 1.0, askSpreadMultiplier: 1.0, skewFactor: 0 };
  }
  const skewMult = Math.min(maxSkewMultiplier, 1.0 + sensitivity * absResidual);
  const vulnerableSide = residualDelta > 0 ? 'ask' : 'bid';
  return {
    vulnerableSide,
    bidSpreadMultiplier: vulnerableSide === 'bid' ? skewMult : 1.0,
    askSpreadMultiplier: vulnerableSide === 'ask' ? skewMult : 1.0,
    skewFactor: Number((skewMult - 1.0).toFixed(4)),
  };
}

export function isEmergencyDeltaExceeded(residualDelta: number, threshold: number): boolean {
  return Math.abs(residualDelta) >= threshold;
}

export function computeUnwindBackoffMs(backoffBaseMs: number, retryCount: number): number {
  return backoffBaseMs * Math.pow(2, Math.max(0, retryCount - 1));
}
