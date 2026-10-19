import type { Bouchaud2006MolassesInput, Bouchaud2006MolassesOutput } from './types';

export class Bouchaud2006Molasses {
  static evaluate(input: Bouchaud2006MolassesInput): Bouchaud2006MolassesOutput {
    const gamma = Math.max(0.05, Math.min(0.95, input.orderSignHurstCorrelationGamma));
    const beta = Math.max(0.01, input.empiricalDecayExponentBeta);
    const gamma0 = Math.max(1e-6, input.impactScaleGamma0);
    const ell0 = Math.max(0.1, input.regularizerLagEll0);
    const ell = Math.max(0, input.evaluationLagTradesEll);

    const criticalPropagatorExponentBeta = (1 - gamma) / 2;
    const exponentDeviationFromCritical = beta - criticalPropagatorExponentBeta;
    const propagatorKernelAtLag = gamma0 * Math.pow(ell0 + ell, -beta);
    const hurstPrice2H = Math.max(0.1, Math.min(1.9, 1 - gamma - 2 * beta + 1));
    const diffusivePriceEfficiencyRatio = hurstPrice2H;
    const molassesStiffnessIndex = gamma0 / Math.max(1e-6, beta);

    const regime =
      Math.abs(exponentDeviationFromCritical) <= 0.025
        ? 'CRITICAL_DIFFUSIVE_BALANCE'
        : exponentDeviationFromCritical < -0.025
          ? 'SUPER_DIFFUSIVE_TRENDING'
          : 'SUB_DIFFUSIVE_MEAN_REVERTING';

    return {
      criticalPropagatorExponentBeta: Number(criticalPropagatorExponentBeta.toFixed(6)),
      exponentDeviationFromCritical: Number(exponentDeviationFromCritical.toFixed(6)),
      propagatorKernelAtLag: Number(propagatorKernelAtLag.toFixed(6)),
      diffusivePriceEfficiencyRatio: Number(diffusivePriceEfficiencyRatio.toFixed(4)),
      molassesStiffnessIndex: Number(molassesStiffnessIndex.toFixed(4)),
      regime,
    };
  }
}
