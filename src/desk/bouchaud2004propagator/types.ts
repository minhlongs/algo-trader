/**
 * Wave 297 — Bouchaud, Gefen, Potters & Wyart (2004): Fluctuations and Response in Financial Markets
 * Long-Memory Propagator Exponent & Diffusive Variance Condition
 */

export interface Bouchaud2004PropagatorConfig {
  readonly signAutocorrelationGamma: number;
  readonly bareImpactScaleG0: number;
  readonly evaluationLagSteps: number;
  readonly unconditionalSignVariance: number;
}

export interface Bouchaud2004PropagatorResult {
  readonly criticalPropagatorBeta: number;
  readonly propagatorKernelAtLag: number;
  readonly signCorrelationAtLag: number;
  readonly singleStepDiffusiveVariance: number;
  readonly isPurelyDiffusiveRegime: boolean;
}
