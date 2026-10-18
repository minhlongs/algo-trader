/**
 * Pure sizing, validation, timeout, and report helpers for MARL Hedge Execution.
 */
import { z } from 'zod';

export type VenueId = 'polymarket' | 'binance' | 'bybit' | 'kucoin';

export const HedgeExecutionConfigSchema = z.object({
  deltaThreshold: z.number().positive().default(0.10),
  hysteresisRatio: z.number().min(0.01).max(0.99).default(0.50),
  primaryHedgeVenue: z.enum(['binance', 'bybit']).default('binance'),
  fallbackHedgeVenue: z.enum(['binance', 'bybit']).default('bybit'),
  maxHedgeSlippageBps: z.number().nonnegative().default(15),
  orderTimeoutMs: z.number().int().positive().default(300),
  maxLatencyMs: z.number().int().positive().default(200),
  minLotSize: z.number().positive().default(0.001),
  circuitCooldownMs: z.number().int().positive().default(15_000),
});

export type HedgeExecutionConfig = z.infer<typeof HedgeExecutionConfigSchema>;

export interface HedgeExecutionReport {
  hedgeId: string;
  venue: VenueId | string;
  symbol: string;
  side: 'buy' | 'sell';
  requestedAmount: number;
  filledAmount: number;
  avgFillPrice: number;
  latencyMs: number;
  status: 'FILLED' | 'PARTIAL' | 'FAILED' | 'UNWOUND';
  residualDelta: number;
  error?: string;
}

export function buildHedgeReport(
  hedgeId: string,
  venue: VenueId | string,
  symbol: string,
  side: 'buy' | 'sell',
  requestedAmount: number,
  filledAmount: number,
  avgFillPrice: number,
  latencyMs: number,
  status: 'FILLED' | 'PARTIAL' | 'FAILED' | 'UNWOUND',
  residualDelta: number,
  error?: string,
): HedgeExecutionReport {
  return {
    hedgeId,
    venue: venue as VenueId,
    symbol,
    side,
    requestedAmount,
    filledAmount,
    avgFillPrice,
    latencyMs,
    status,
    residualDelta,
    ...(error ? { error } : {}),
  };
}

export function computeSimulatedHedgeReport(
  hedgeId: string,
  venue: VenueId | string,
  symbol: string,
  side: 'buy' | 'sell',
  absAmount: number,
  simulatedFillFraction: number,
): HedgeExecutionReport {
  const fillFraction = Math.max(0, Math.min(1.0, simulatedFillFraction));
  const filledAmount = Number((absAmount * fillFraction).toFixed(4));
  const residual = absAmount - filledAmount;
  const status = fillFraction >= 1.0 ? 'FILLED' : fillFraction > 0 ? 'PARTIAL' : 'FAILED';
  const rawResidual = side === 'buy' ? residual : -residual;
  const residualDelta = Math.abs(rawResidual) < 1e-12 ? 0 : Number(rawResidual.toFixed(4));

  return buildHedgeReport(hedgeId, venue, symbol, side, absAmount, filledAmount, 50_000, 15, status, residualDelta);
}

export function computeLiveFillReport(
  hedgeId: string,
  venue: VenueId | string,
  symbol: string,
  side: 'buy' | 'sell',
  absAmount: number,
  filled: number,
  fillPrice: number,
  latencyMs: number,
): HedgeExecutionReport {
  const fillRatio = absAmount > 0 ? filled / absAmount : 0;
  const status = fillRatio >= 0.999 ? 'FILLED' : filled > 0 ? 'PARTIAL' : 'FAILED';
  const residual = absAmount - filled;
  const signedResidual = side === 'buy' ? residual : -residual;
  return buildHedgeReport(
    hedgeId,
    venue,
    symbol,
    side,
    absAmount,
    filled,
    fillPrice,
    latencyMs,
    status,
    status === 'FILLED' ? 0 : Number(signedResidual.toFixed(4)),
  );
}

export async function raceWithOrderTimeout<T>(promise: Promise<T>, orderTimeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Hedge order timeout after ${orderTimeoutMs}ms`));
    }, orderTimeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
