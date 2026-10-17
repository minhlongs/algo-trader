export interface Bouchaud2006MolassesInput {
  readonly orderSignHurstCorrelationGamma: number;
  readonly empiricalDecayExponentBeta: number;
  readonly impactScaleGamma0: number;
  readonly regularizerLagEll0: number;
  readonly evaluationLagTradesEll: number;
}

export interface Bouchaud2006MolassesOutput {
  readonly criticalPropagatorExponentBeta: number;
  readonly exponentDeviationFromCritical: number;
  readonly propagatorKernelAtLag: number;
  readonly diffusivePriceEfficiencyRatio: number;
  readonly molassesStiffnessIndex: number;
  readonly regime:
    | 'CRITICAL_DIFFUSIVE_BALANCE'
    | 'SUPER_DIFFUSIVE_TRENDING'
    | 'SUB_DIFFUSIVE_MEAN_REVERTING';
}
