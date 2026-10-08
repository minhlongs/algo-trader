/**
 * XVA Counterparty Risk Valuation Types
 * Contracts, exposure profiles, hazard rate curves, and valuation adjustments.
 *
 * @module desk/xva/xva-types
 */

export interface ExposureProfilePoint {
  timeYears: number;
  expectedExposureUsd: number; // Positive exposure E(max(V, 0))
  expectedNegativeExposureUsd: number; // Negative exposure E(min(V, 0))
  discountFactor: number;
}

export interface HazardRatePoint {
  timeYears: number;
  hazardRate: number; // Annualized continuous default intensity lambda
}

export interface CvaDvaParameters {
  exposureProfile: ExposureProfilePoint[];
  counterpartyRecoveryRate: number; // e.g. 0.40 for 40%
  bankRecoveryRate: number; // Bank's own recovery rate e.g. 0.40
  counterpartyHazardRates: HazardRatePoint[];
  bankHazardRates: HazardRatePoint[];
}

export interface CvaDvaResult {
  cvaUsd: number;
  dvaUsd: number;
  netBilateralCreditAdjustmentUsd: number; // DVA - CVA
  totalDefaultProbabilityPct: number;
}

export interface FvaParameters {
  exposureProfile: ExposureProfilePoint[];
  fundingBorrowSpreadBps: number; // Bank funding spread for uncollateralized positive exposure
  fundingLendingSpreadBps: number; // Spread earned on excess cash posted
}

export interface FvaResult {
  fcaUsd: number; // Funding Cost Adjustment
  fbaUsd: number; // Funding Benefit Adjustment
  netFvaUsd: number; // FCA - FBA
}

export interface TradePosition {
  tradeId: string;
  mtmValueUsd: number;
  assetClass: 'RATES' | 'FX' | 'CREDIT' | 'EQUITY' | 'COMMODITY';
}

export interface NettingSetParameters {
  nettingSetId: string;
  isdaMasterActive: boolean;
  trades: TradePosition[];
  postedCollateralUsd: number;
  thresholdUsd: number;
  minimumTransferAmountUsd: number;
}

export interface NettingSetResult {
  nettingSetId: string;
  grossPositiveExposureUsd: number;
  nettedExposureUsd: number;
  nettingFactor: number; // Ratio of netted to gross
  marginCallRequiredUsd: number;
}
