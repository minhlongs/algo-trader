import type { Almgren2005DirectInput, Almgren2005DirectOutput } from './types';

export class Almgren2005Direct {
  static evaluate(input: Almgren2005DirectInput): Almgren2005DirectOutput {
    const V = Math.max(1, input.averageDailyVolumeV);
    const X = Math.max(0, input.orderSharesX);
    const T = Math.max(1e-4, Math.min(1.0, input.executionDurationFractionT));
    const sigma = Math.max(1e-6, input.dailyVolatilityFractionSigma);
    const gamma = input.permanentGamma ?? 0.314;
    const alpha = input.permanentAlpha ?? 0.891;
    const eta = input.temporaryEta ?? 0.142;
    const beta = input.temporaryBeta ?? 0.6;

    const volumeFractionOrderSize = X / V;
    const participationRateRho = volumeFractionOrderSize / T;

    const permFrac = gamma * sigma * Math.pow(volumeFractionOrderSize, alpha);
    const tempFrac = eta * sigma * Math.pow(participationRateRho, beta);
    const totalShortfallFrac = 0.5 * permFrac + tempFrac;

    const permanentImpactBps = permFrac * 10000;
    const temporaryCostComponentBps = tempFrac * 10000;
    const totalImplementationShortfallBps = totalShortfallFrac * 10000;

    const regime =
      participationRateRho >= 0.15
        ? 'HIGH_PARTICIPATION_URGENCY_SURCHARGE'
        : participationRateRho <= 0.02
          ? 'LOW_FOOTPRINT_PASSIVE'
          : 'CONCAVE_POWER_LAW_EXECUTION';

    return {
      volumeFractionOrderSize: Number(volumeFractionOrderSize.toFixed(6)),
      participationRateRho: Number(participationRateRho.toFixed(6)),
      permanentImpactBps: Number(permanentImpactBps.toFixed(4)),
      temporaryCostComponentBps: Number(temporaryCostComponentBps.toFixed(4)),
      totalImplementationShortfallBps: Number(totalImplementationShortfallBps.toFixed(4)),
      regime,
    };
  }
}
