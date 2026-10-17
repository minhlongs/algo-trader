/**
 * Wave 279 — Bouchaud, Farmer & Lillo (2009): How Markets Slowly Digest Changes in Supply and Demand
 * Computes square-root metaorder impact peak and power-law post-trade relaxation profile.
 */
import type {
  BouchaudFarmerLillo2009Config,
  BouchaudFarmerLillo2009Result,
  MetaorderDigestPoint,
} from './types';

export function computeBouchaudFarmerLillo2009Digest(
  cfg: BouchaudFarmerLillo2009Config,
): BouchaudFarmerLillo2009Result {
  const {
    metaorderSizeShares: Q,
    dailyVolumeShares: V,
    dailyVolatility: sigma,
    yConstant: Y,
    executionDurationSteps: N,
    postExecutionSteps: M,
    signAutocorrGamma: gamma,
  } = cfg;

  if (Q <= 0 || V <= 0 || sigma <= 0 || Y <= 0 || N <= 0 || M <= 0 || gamma <= 0 || gamma >= 1) {
    throw new Error('Invalid BouchaudFarmerLillo2009Config: parameters outside valid scaling regime');
  }

  const beta = (1 - gamma) / 2;
  const peakImpact = Y * sigma * Math.sqrt(Q / V);
  const profile: MetaorderDigestPoint[] = [];

  for (let t = 1; t <= N; t++) {
    const frac = t / N;
    const impact = peakImpact * Math.pow(frac, 1 - beta);
    profile.push({
      step: t,
      phase: 'DURING_METAORDER',
      expectedImpactPct: impact,
    });
  }

  for (let s = 1; s <= M; s++) {
    const ratio = (N + s) / N;
    const decayFactor = Math.pow(ratio, 1 - beta) - Math.pow(ratio - 1, 1 - beta);
    const postImpact = peakImpact * Math.max(0.15, decayFactor);
    profile.push({
      step: N + s,
      phase: 'POST_METAORDER_RELAXATION',
      expectedImpactPct: postImpact,
    });
  }

  const terminalImpact = profile[profile.length - 1].expectedImpactPct;

  return {
    peakImpactPct: peakImpact,
    permanentPlateauImpactPct: terminalImpact,
    relaxationRatio: terminalImpact / Math.max(1e-9, peakImpact),
    profile,
  };
}
