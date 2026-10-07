/**
 * Binary Risk Parity Optimizer Types
 *
 * Types for portfolio allocation, risk parity budgeting, and CVaR estimation
 * under bounded [0, 1] binary outcome contracts.
 *
 * @module desk/portfolio/binary-risk-parity-types
 */

export interface AssetRiskProfile {
  readonly symbol: string;
  readonly currentPrice: number;
  readonly expectedReturnBps: number;
  readonly estimatedVolatility: number;
  readonly maxWeightLimit?: number;
}

export interface RiskParityConstraints {
  readonly maxPortfolioVolatility: number;
  readonly targetReturnBps?: number;
  readonly cvarConfidenceLevel: number; // e.g. 0.95
  readonly maxSingleAssetWeight: number;
}

export interface OptimizedPortfolioAllocation {
  readonly weights: Record<string, number>;
  readonly expectedPortfolioReturnBps: number;
  readonly portfolioVolatility: number;
  readonly parametricVaR95Usd: number;
  readonly cvar95Usd: number;
  readonly diversificationRatio: number;
  readonly totalCapitalUsd: number;
}
