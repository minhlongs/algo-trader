/**
 * Wave 210: Bekaert, Hoerova & Lo Duca (2013) VIX Decomposition Types.
 * Separates physical economic uncertainty from market risk aversion (variance risk premium).
 * Strictly < 180 LOC, zero :any.
 */

export interface BekaertConfig {
  annualizationFactor: number;
  unconditionalVarianceScale?: number;
}

export interface BekaertResult {
  vixSquaredAnnualized: number;
  expectedRealizedVarianceAnnualized: number;
  economicUncertainty: number; // sqrt(E[RV])
  varianceRiskPremium: number; // VIX^2 - E[RV]
  riskAversionIndex: number;   // Normalized proxy for risk aversion
  uncertaintySharePct: number; // E[RV] / VIX^2 * 100
  vrpSharePct: number;         // VRP / VIX^2 * 100
  marketSentiment: 'RISK_SEEKING' | 'EQUILIBRIUM' | 'ELEVATED_RISK_AVERSION' | 'PANIC_SPREAD';
}
