/**
 * Risk Calculation Compute & Validation Helpers
 * Pure calculation and validation logic for risk estimation.
 */

import type { RiskCalculationRequest, RiskCalculationResult, AppError } from './types';

export const RISK_CALCULATION_LIMIT_MIN = 100;
export const RISK_CALCULATION_LIMIT_DEFAULT = 1000;
export const RISK_CALCULATION_LIMIT_MAX = 1000;

export function clampLimit(raw: number): number | AppError {
  if (!Number.isFinite(raw) || raw < RISK_CALCULATION_LIMIT_MIN) {
    return {
      code: 'INVALID_REQUEST',
      message: `limit must be >= ${RISK_CALCULATION_LIMIT_MIN}`,
      cause: { received: raw },
    };
  }
  if (raw > RISK_CALCULATION_LIMIT_MAX) {
    return {
      code: 'INVALID_REQUEST',
      message: `limit must be <= ${RISK_CALCULATION_LIMIT_MAX}`,
      cause: { received: raw },
    };
  }
  return Math.round(raw);
}

/** Type guard: narrow number | AppError → AppError | undefined */
export function extractAppError(value: number | AppError): AppError | undefined {
  return typeof value === 'object' && value !== null && 'code' in value
    ? (value as AppError)
    : undefined;
}

export function computeRisk(req: RiskCalculationRequest): RiskCalculationResult[] {
  const now = new Date().toISOString();
  const seed = req.limit + (req.sort === 'asc' ? 0 : 999);
  return Array.from({ length: req.limit }, (_, i) => ({
    id: `risk-${seed + i}`,
    riskScore: psuedoRandomScore(seed + i),
    level: levelFromScore(psuedoRandomScore(seed + i)),
    symbol: 'BTC/USDT',
    calculatedAt: now,
    confidence: 0.85 + (i % 10) / 100,
    factors: ['market_volatility', 'correlation_exposure'],
    triggeredBy: 'system',
    algorithm: 'granada-standard-v1',
  }));
}

export function psuedoRandomScore(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return Math.round(((x - Math.floor(x)) * 100) % 101);
}

export function levelFromScore(score: number): 'low' | 'medium' | 'high' {
  if (score < 40) return 'low';
  if (score < 75) return 'medium';
  return 'high';
}
