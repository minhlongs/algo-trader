/**
 * Wave 231: Jaisson & Rosenbaum (2016) Microstructural High-Frequency Hawkes Rough Heston Types.
 * Strictly < 200 LOC, zero :any.
 */

export interface HawkesRoughHestonConfig {
  readonly baselineIntensityLambda0: number;
  readonly branchingRatioEta: number; // close to 1 for nearly unstable markets, e.g. 0.95 - 0.99
  readonly memoryKernelAlpha: number; // alpha in (0.5, 1.0) -> H = alpha - 0.5 in (0, 0.5)
}

export interface HighFrequencyArrivalSnapshot {
  readonly pastArrivalTimesSec: readonly number[];
  readonly currentEvaluationTimeSec: number;
}

export interface HawkesMicrostructureAssessment {
  readonly instantaneousIntensity: number;
  readonly impliedHurstExponentH: number;
  readonly isNearlyUnstable: boolean;
  readonly stationaryMeanIntensity: number;
}
