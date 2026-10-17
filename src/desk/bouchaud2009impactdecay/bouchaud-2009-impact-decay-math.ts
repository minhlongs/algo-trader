import type {
  Bouchaud2009ImpactDecayInput,
  Bouchaud2009ImpactDecayOutput,
} from './types';

export class Bouchaud2009ImpactDecay {
  /**
   * Bouchaud, Farmer & Lillo (2009) How Markets Slowly Digest Changes in Supply and Demand:
   * Concave square-root peak metaorder impact I_peak = Y * sigma * sqrt(Q / V)
   * followed by power-law post-trade relaxation toward permanent floor gamma * I_peak.
   */
  static evaluate(
    input: Bouchaud2009ImpactDecayInput
  ): Bouchaud2009ImpactDecayOutput {
    const Q = Math.max(0, input.metaorderSharesQ);
    const V = Math.max(1e-6, input.dailyVolumeSharesV);
    const sigma = Math.max(0, input.dailyVolatilityPriceUnitsSigma);
    const Y = Math.max(0, input.impactPrefactorY);
    const T = Math.max(1e-3, input.metaorderDurationSecT);
    const tau = Math.max(0, input.elapsedPostTradeSecTau);
    const beta = Math.max(0.05, input.decayExponentBeta);
    const gamma = Math.min(1, Math.max(0, input.permanentFloorFractionGamma));

    const participationRatio = Q / V;
    const peakSquareRootImpact = Y * sigma * Math.sqrt(participationRatio);
    const permanentAsymptoticImpact = gamma * peakSquareRootImpact;
    const transientComponent =
      (1 - gamma) * peakSquareRootImpact * Math.pow(1 + tau / T, -beta);
    const residualImpactAtTau = permanentAsymptoticImpact + transientComponent;

    const regime =
      tau <= 1e-6
        ? 'PEAK_EXECUTION'
        : residualImpactAtTau <= permanentAsymptoticImpact * 1.15
          ? 'ASYMPTOTIC_FLOOR'
          : 'TRANSIENT_RELAXING';

    return {
      participationRatio: Number(participationRatio.toFixed(6)),
      peakSquareRootImpact: Number(peakSquareRootImpact.toFixed(6)),
      permanentAsymptoticImpact: Number(permanentAsymptoticImpact.toFixed(6)),
      residualImpactAtTau: Number(residualImpactAtTau.toFixed(6)),
      regime,
    };
  }
}
