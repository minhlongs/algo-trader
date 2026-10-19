/**
 * Wave 207: Bollerslev, Gibson & Zhou (2011) Variance Risk Premium (VRP) Types.
 * Quantifies options implied vs physical expected variance & excess returns.
 * Strictly < 180 LOC, zero :any.
 */

export interface OptionQuote {
  strike: number;
  optionType: 'CALL' | 'PUT';
  price: number;
  impliedVol?: number;
}

export interface VrpConfig {
  riskFreeRate: number;
  timeToMaturityYears: number;
  underlyingPrice: number;
  forecastHorizonMonths: number;
  annualizationFactor: number;
}

export interface VrpResult {
  impliedVarianceAnnualized: number;
  expectedRealizedVarianceAnnualized: number;
  varianceRiskPremium: number;
  vrpPercent: number;
  forecastHorizonMonths: number;
  predictedExcessReturnPct: number;
  tStatistic: number;
  riskPremiumRegime: 'COMPRESSED' | 'NORMAL' | 'ELEVATED' | 'EXTREME_STRESS';
  optionQuotesCount: number;
}
