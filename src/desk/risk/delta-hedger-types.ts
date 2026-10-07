/**
 * Prediction Market Delta Hedger Type Definitions
 *
 * @module desk/risk/delta-hedger-types
 */

export interface MarketPosition {
  symbol: string;
  marketId: string;
  side: 'YES' | 'NO';
  quantity: number;
  currentPrice: number;
  impliedProbability: number;
}

export interface DeltaExposureSummary {
  netDelta: number; // Sum of directed probabilities (YES = +P, NO = -(1-P))
  grossNotional: number;
  toleranceThreshold: number;
  isNeutral: boolean;
  requiredHedgeQuantity: number;
  recommendedHedgeSide: 'BUY_YES' | 'SELL_YES' | 'BUY_NO' | 'SELL_NO' | 'NONE';
}

export interface HedgeOrderAction {
  actionId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  outcome: 'YES' | 'NO';
  targetQuantity: number;
  limitPrice: number;
  urgency: 'IMMEDIATE' | 'PASSIVE';
}
