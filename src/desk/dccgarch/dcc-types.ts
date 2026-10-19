/**
 * Robert F. Engle (2002) Dynamic Conditional Correlation (DCC-GARCH) Types.
 * Strictly < 180 LOC, zero :any types.
 */

export interface DccParams {
  readonly alpha: number; // News impact on correlation
  readonly beta: number;  // Persistence of dynamic correlation
}

export interface DccStepPoint {
  readonly t: number;
  readonly correlationMatrix: readonly (readonly number[])[];
  readonly covarianceMatrix: readonly (readonly number[])[];
  readonly pairCorrelations: readonly {
    readonly assetI: number;
    readonly assetJ: number;
    readonly correlation: number;
  }[];
  readonly dynamicHedgeRatio12: number; // H_12 / H_22 (optimal hedge ratio asset 1 with asset 2)
}

export interface DccFitResult {
  readonly params: DccParams;
  readonly unconditionalCorrelation: readonly (readonly number[])[];
  readonly logLikelihood: number;
  readonly persistence: number; // alpha + beta
  readonly series: readonly DccStepPoint[];
  readonly averageCorrelation12: number;
}
