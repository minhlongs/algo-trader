/**
 * Synchronized Risk Gate Evaluator (Milestone 2 - R2)
 * Pure evaluation functions for pre-trade risk checks.
 */

import type { CircuitBreakerTier } from '../risk/portfolio-risk-types';
import type { UnifiedTradeIntent } from './orchestrator-types';

export interface EvaluatorParams {
  readonly currentTier: CircuitBreakerTier;
  readonly currentNav: number;
  readonly currentCash: number;
  readonly minCashBufferRatio: number;
  readonly maxGrossLeverage: number;
  readonly maxSingleVenueConcentration: number;
  readonly engineBudget: number;
  readonly committed: number;
  readonly venuePositions: Record<string, number>;
}

export interface EvaluationResult {
  readonly approved: boolean;
  readonly scaledQty: number;
  readonly reason?: string;
  readonly postCashRatio: number;
  readonly grossLev: number;
}

export function evaluateOrderRisk(
  intent: UnifiedTradeIntent,
  price: number,
  params: EvaluatorParams
): EvaluationResult {
  let scaledQty = intent.quantity;

  // 1. Synchronized Circuit Breaker Gate
  if (params.currentTier === 'HALT' || params.currentTier === 'HARD_STOP') {
    return {
      approved: false,
      scaledQty,
      reason: `Trading halted under ${params.currentTier} circuit breaker`,
      postCashRatio: params.currentNav > 0 ? params.currentCash / params.currentNav : 0,
      grossLev: 0,
    };
  }

  if (params.currentTier === 'ALERT' || params.currentTier === 'REDUCE') {
    if (!intent.isRiskReducing) {
      return {
        approved: false,
        scaledQty,
        reason: `Order expansion rejected in ${params.currentTier} tier`,
        postCashRatio: params.currentNav > 0 ? params.currentCash / params.currentNav : 0,
        grossLev: 0,
      };
    }
    const mult = params.currentTier === 'ALERT' ? 0.75 : 0.50;
    scaledQty = intent.quantity * mult;
  }

  const effectiveNotional = scaledQty * price;

  // 2. Real-Time Capital Budgeting Gate
  if (params.committed + effectiveNotional > params.engineBudget) {
    return {
      approved: false,
      scaledQty,
      reason: `Order notional $${effectiveNotional.toFixed(0)} exceeds remaining engine budget ($${(params.engineBudget - params.committed).toFixed(0)})`,
      postCashRatio: params.currentNav > 0 ? params.currentCash / params.currentNav : 0,
      grossLev: 0,
    };
  }

  // 3. Liquid Cash Buffer Guard (C_cash >= 0.20 * NAV)
  const postOrderCash = params.currentCash - effectiveNotional;
  const postCashRatio = params.currentNav > 0 ? postOrderCash / params.currentNav : 0;
  if (postCashRatio < params.minCashBufferRatio) {
    return {
      approved: false,
      scaledQty,
      reason: `Order violates minimum ${(params.minCashBufferRatio * 100).toFixed(0)}% liquid cash buffer (projected: ${(postCashRatio * 100).toFixed(2)}%)`,
      postCashRatio,
      grossLev: 0,
    };
  }

  // 4. Leverage & Concentration Guard
  const currentGross = Object.values(params.venuePositions).reduce((s, p) => s + Math.abs(p), 0);
  const postGross = currentGross + effectiveNotional;
  const grossLev = params.currentNav > 0 ? postGross / params.currentNav : 0;
  if (grossLev > params.maxGrossLeverage) {
    return {
      approved: false,
      scaledQty,
      reason: `Gross leverage ${grossLev.toFixed(2)}x exceeds maximum ceiling ${params.maxGrossLeverage.toFixed(1)}x`,
      postCashRatio,
      grossLev,
    };
  }

  const currentVenuePos = Math.abs(params.venuePositions[intent.venue] ?? 0);
  const postVenuePos = currentVenuePos + effectiveNotional;
  const venueRatio = postGross > 0 ? postVenuePos / postGross : 0;
  if (postGross > params.currentNav * 0.5 && venueRatio > params.maxSingleVenueConcentration) {
    return {
      approved: false,
      scaledQty,
      reason: `Venue ${intent.venue} concentration ${(venueRatio * 100).toFixed(1)}% exceeds cap ${(params.maxSingleVenueConcentration * 100).toFixed(0)}%`,
      postCashRatio,
      grossLev,
    };
  }

  return { approved: true, scaledQty, postCashRatio, grossLev };
}
