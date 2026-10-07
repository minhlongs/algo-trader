/**
 * Live StatArb Risk Cockpit Type Definitions
 *
 * @module desk/risk/live-statarb-risk-types
 */

export type RiskCockpitStatus = 'NORMAL' | 'ELEVATED' | 'CRITICAL' | 'UNWINDING';

export interface RiskCockpitConfig {
  portfolioNav: number;
  maxVaRThreshold?: number; // Maximum allowed Cornish-Fisher VaR in USD
  maxCVaRThreshold?: number; // Maximum allowed Expected Shortfall in USD
  confidence?: 0.95 | 0.99;
  horizonDays?: number;
  autoUnwindOnBreach?: boolean;
}

export interface CandidateOrder {
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  expectedReturn?: number;
}

export interface PreTradeRiskEvaluation {
  orderId: string;
  allowed: boolean;
  reason: string;
  currentVaR: number;
  currentCVaR: number;
  marginalVaR: number;
  marginalCVaR: number;
  projectedCVaR: number;
  cockpitStatus: RiskCockpitStatus;
  unwindTriggered: boolean;
}

export interface RiskCockpitSnapshot {
  portfolioNav: number;
  status: RiskCockpitStatus;
  cornishFisherVaR: number;
  expectedShortfall: number;
  returnsCount: number;
  maxVaRThreshold: number;
  maxCVaRThreshold: number;
  evaluatedAt: number;
}
