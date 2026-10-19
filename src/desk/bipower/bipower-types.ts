/**
 * Barndorff-Nielsen & Shephard (2004) Bi-Power Variation (BPV) & Jump Types.
 * Strictly < 180 LOC, zero :any types.
 */

export interface IntradayReturnPoint {
  readonly index: number;
  readonly returnVal: number;
}

export interface JumpTestResult {
  readonly sampleCount: number;
  readonly realizedVariance: number;      // Total Quadratic Variation (RV)
  readonly bipowerVariation: number;       // Continuous Integrated Variance (BV)
  readonly continuousVariance: number;     // min(RV, BV)
  readonly jumpVariance: number;           // max(0, RV - BV)
  readonly jumpProportion: number;         // jumpVariance / realizedVariance
  readonly tripowerQuarticity: number;     // TPQ (integrated quarticity proxy)
  readonly zStatistic: number;             // Asymptotic Gaussian jump test Z-score
  readonly isJumpDay: boolean;             // True if Z exceeds critical threshold
  readonly criticalValue: number;          // Critical Z-score (e.g. 2.326 for 99%)
  readonly pValue: number;                 // One-sided p-value against null of no jumps
}

export interface JumpDecompositionSummary {
  readonly totalDays: number;
  readonly jumpDaysCount: number;
  readonly jumpFrequencyPct: number;
  readonly meanRealizedVol: number;
  readonly meanContinuousVol: number;
  readonly meanJumpVol: number;
  readonly dailyResults: readonly JumpTestResult[];
}
