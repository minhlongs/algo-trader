/**
 * Wave 273 — Bouchaud, Gefen, Potters & Wyart (2004): Fluctuations and Response in Financial Markets
 * Computes bare propagator kernel G0(l), sign autocorrelation C(l), and price response R(l).
 */
import type {
  Bouchaud2004ResponseConfig,
  Bouchaud2004ResponseResult,
  LagResponsePoint,
} from './types';

export function computeBouchaud2004ResponseCurve(
  cfg: Bouchaud2004ResponseConfig,
): Bouchaud2004ResponseResult {
  const {
    maxLag: L,
    bareImpactGamma0: gamma0,
    lagOffsetL0: l0,
    propagatorDecayBeta: beta,
    signAutocorrC0: c0,
    signDecayGamma: gamma,
    uncorrNoiseSigma2: sigma2,
  } = cfg;

  if (L <= 0 || gamma0 <= 0 || l0 <= 0 || beta <= 0 || c0 <= 0 || c0 >= 1 || gamma <= 0 || gamma >= 1) {
    throw new Error('Invalid Bouchaud2004ResponseConfig: parameters outside scaling regime');
  }

  const criticalBeta = (1 - gamma) / 2;
  const isBalanced = Math.abs(beta - criticalBeta) <= 0.08;
  const curve: LagResponsePoint[] = [];

  for (let lag = 1; lag <= L; lag++) {
    const g0 = gamma0 * Math.pow(lag + l0, -beta);
    const cLag = c0 * Math.pow(lag, -gamma);

    let inducedSum = 0;
    for (let n = 1; n < lag; n++) {
      const gDiff = gamma0 * Math.pow(lag - n + l0, -beta);
      const cN = c0 * Math.pow(n, -gamma);
      inducedSum += gDiff * cN;
    }

    const rLag = g0 + inducedSum;
    const dLag = g0 * g0 + sigma2 + 0.5 * inducedSum * g0;

    curve.push({
      lag,
      barePropagatorG0: g0,
      signAutocorrelationC: cLag,
      priceResponseR: rLag,
      lagDiffusivityD: dLag,
    });
  }

  const r1 = curve[0].priceResponseR;
  const rLast = curve[curve.length - 1].priceResponseR;

  return {
    curve,
    criticalBetaExponent: criticalBeta,
    isDiffusiveBalanced: isBalanced,
    terminalResponseRatio: rLast / Math.max(1e-9, r1),
  };
}
