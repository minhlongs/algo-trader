import type {
  GatheralJaisson2018HawkesInput,
  GatheralJaisson2018HawkesOutput,
} from './types';

export class GatheralJaisson2018Hawkes {
  static evaluate(
    input: GatheralJaisson2018HawkesInput
  ): GatheralJaisson2018HawkesOutput {
    const n = Math.max(0, input.branchingRatioNormN);
    const alphaRaw = input.kernelTailExponentOnePlusAlpha - 1.0;
    const alphaExponent = Math.min(0.99, Math.max(0.51, alphaRaw));
    const impliedRoughHurstH = alphaExponent - 0.5;
    const supercriticalFlashCrashRisk =
      n >= 1.0 || n >= input.criticalBranchingCutoff;
    const denom = Math.max(1e-4, 1.0 - Math.min(0.9999, n));
    const stationaryExpectedIntensity = input.baselineIntensityMu / denom;
    const varianceAmplificationFactor = 1.0 / (denom * denom);

    const regime = supercriticalFlashCrashRisk
      ? 'SUPERCRITICAL_ENDogeneity_TRIP'
      : n >= 0.85
        ? 'NEAR_CRITICAL_ROUGH_SCALING'
        : 'SUBCRITICAL_ERGODIC_HAWKES';

    return {
      alphaExponent: Number(alphaExponent.toFixed(6)),
      impliedRoughHurstH: Number(impliedRoughHurstH.toFixed(6)),
      stationaryExpectedIntensity: Number(stationaryExpectedIntensity.toFixed(4)),
      varianceAmplificationFactor: Number(varianceAmplificationFactor.toFixed(4)),
      supercriticalFlashCrashRisk,
      regime,
    };
  }
}
