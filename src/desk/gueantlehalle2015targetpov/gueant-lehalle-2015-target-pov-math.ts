import type {
  GueantLehalle2015TargetPovInput,
  GueantLehalle2015TargetPovOutput,
} from './types';

export class GueantLehalle2015TargetPov {
  static evaluate(
    input: GueantLehalle2015TargetPovInput
  ): GueantLehalle2015TargetPovOutput {
    const q = Math.max(0, input.remainingSharesQ);
    const vMkt = Math.max(1e-6, input.expectedMarketVolumeRateV);
    const tau = Math.max(1, input.remainingHorizonSeconds);
    const phi = Math.max(0.15, input.impactExponentPhi);
    const eta = Math.max(1e-8, input.temporaryImpactEta);
    const gamma = Math.max(1e-8, input.riskAversionGamma);
    const sigma = Math.max(1e-6, input.volatilitySigma);

    const lambda = Math.pow(
      (gamma * sigma * sigma) / (2 * phi * eta * Math.pow(vMkt, 1 - phi)),
      1 / (phi + 1)
    );
    const cothTerm = 1 / Math.tanh(Math.max(1e-4, lambda * tau));
    const rawRate = q * lambda * cothTerm;
    const rawPov = rawRate / vMkt;
    const cappedTargetPovRatio = Math.min(input.maxPovCapRatio, rawPov);
    const povCapActive = rawPov > input.maxPovCapRatio;
    const childOrderRateSharesPerSec = cappedTargetPovRatio * vMkt;

    const regime = povCapActive
      ? 'POV_CAP_THROTTLED'
      : cappedTargetPovRatio >= 0.12
        ? 'ASYMPTOTIC_POWER_LAW_POV'
        : 'PASSIVE_POV_TRACKING';

    return {
      characteristicRateLambda: Number(lambda.toFixed(6)),
      rawOptimalPovRatio: Number(rawPov.toFixed(6)),
      cappedTargetPovRatio: Number(cappedTargetPovRatio.toFixed(6)),
      childOrderRateSharesPerSec: Number(childOrderRateSharesPerSec.toFixed(4)),
      povCapActive,
      regime,
    };
  }
}
