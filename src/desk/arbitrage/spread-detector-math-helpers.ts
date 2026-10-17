/**
 * Spread Detector Pure Math & Fee/Slippage/Scoring Helpers
 * Extracted from spread-detector-calculations.ts for modular fee, slippage, and ML scoring calculation.
 */

import type { ScoringModel } from './spread-detector-types';

/** Default maker/taker fee rates per exchange (fraction, e.g. 0.001 = 0.1%) */
export const FEE_RATES: Record<string, number> = {
  binance: 0.001,
  okx: 0.0008,
  bybit: 0.001,
  default: 0.001,
};

/**
 * Calculate trading fees for both legs of an arbitrage trade.
 */
export function calculateFees(
  buyExchange: string,
  sellExchange: string,
  buyPrice: number,
  sellPrice: number
): { buyFee: number; sellFee: number; netFee: number } {
  const buyFeeRate = FEE_RATES[buyExchange.toLowerCase()] ?? FEE_RATES.default;
  const sellFeeRate = FEE_RATES[sellExchange.toLowerCase()] ?? FEE_RATES.default;

  const buyFee = buyPrice * buyFeeRate;
  const sellFee = sellPrice * sellFeeRate;

  return { buyFee, sellFee, netFee: buyFee + sellFee };
}

/**
 * Estimate slippage based on a simplified model.
 * Can be enhanced with real orderbook depth data.
 */
export function calculateSlippage(
  bestBid: { price: number },
  bestAsk: { price: number }
): { buySlippage: number; sellSlippage: number; totalSlippage: number } {
  const BASE_SLIPPAGE_RATE = 0.0005; // 0.05%

  const buySlippage = bestAsk.price * BASE_SLIPPAGE_RATE;
  const sellSlippage = bestBid.price * BASE_SLIPPAGE_RATE;

  return { buySlippage, sellSlippage, totalSlippage: buySlippage + sellSlippage };
}

/**
 * ML-based opportunity scoring using weighted factors.
 * Returns a score 0-100; higher = better opportunity.
 */
export function calculateOpportunityScore(
  params: {
    spreadPercent: number;
    latency: number;
    fees: { netFee: number };
  },
  model: ScoringModel,
  maxLatencyMs: number
): number {
  const { spreadPercent, latency, fees } = params;

  const spreadScore = Math.min(100, spreadPercent * 100);
  const latencyScore = Math.max(0, 100 - (latency / maxLatencyMs) * 100);
  const feeEfficiency = fees.netFee > 0 ? (spreadPercent * 10) / fees.netFee : 0;
  const feeScore = Math.min(100, feeEfficiency * 50);

  const score =
    spreadScore * model.weights.spreadWeight +
    latencyScore * model.weights.latencyWeight +
    feeScore * model.weights.liquidityWeight;

  return Math.round(score * 10) / 10;
}

/**
 * Create the default ML scoring model weights and thresholds.
 */
export function createDefaultScoringModel(): ScoringModel {
  return {
    weights: {
      spreadWeight: 0.4,    // 40% weight on spread size
      liquidityWeight: 0.25, // 25% weight on liquidity
      latencyWeight: 0.2,    // 20% weight on latency
      volatilityWeight: 0.15, // 15% weight on volatility
    },
    thresholds: {
      minScore: 60,           // Minimum score to consider
      highConfidenceScore: 80, // High confidence threshold
    },
  };
}
