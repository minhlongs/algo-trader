/**
 * Wave 274 — Gatheral, Jaisson & Rosenbaum (2018): Volatility is Rough
 * Estimates Hurst exponent H via q-th moment scaling and computes fractional kernel forecast.
 */
import type {
  GatheralJaisson2018Config,
  GatheralJaisson2018Result,
  ScalingMomentPoint,
} from './types';

export function computeGatheralJaisson2018RoughVol(
  cfg: GatheralJaisson2018Config,
): GatheralJaisson2018Result {
  const {
    logVolatilitySeries: series,
    lagSteps: lags,
    momentOrderQ: q,
    forecastHorizonSteps: deltaForecast,
  } = cfg;

  if (series.length < 6 || lags.length < 2 || q <= 0 || deltaForecast <= 0) {
    throw new Error('Invalid GatheralJaisson2018Config: insufficient series length or invalid parameters');
  }

  const scalingPoints: ScalingMomentPoint[] = [];
  for (const delta of lags) {
    if (delta <= 0 || delta >= series.length) {
      throw new Error('Invalid lag step in GatheralJaisson2018Config');
    }
    let sumAbsQ = 0;
    const count = series.length - delta;
    for (let i = 0; i < count; i++) {
      const diff = Math.abs(series[i + delta] - series[i]);
      sumAbsQ += Math.pow(Math.max(1e-8, diff), q);
    }
    const mq = sumAbsQ / count;
    scalingPoints.push({
      lagDelta: delta,
      logDelta: Math.log(delta),
      absoluteMomentMq: mq,
      logMq: Math.log(Math.max(1e-12, mq)),
    });
  }

  const nPts = scalingPoints.length;
  const meanX = scalingPoints.reduce((acc, p) => acc + p.logDelta, 0) / nPts;
  const meanY = scalingPoints.reduce((acc, p) => acc + p.logMq, 0) / nPts;
  let num = 0;
  let den = 0;
  for (const p of scalingPoints) {
    num += (p.logDelta - meanX) * (p.logMq - meanY);
    den += (p.logDelta - meanX) * (p.logDelta - meanX);
  }
  const slope = den > 1e-9 ? num / den : 0.1 * q;
  const rawH = slope / q;
  const estimatedH = Math.max(0.02, Math.min(0.95, rawH));

  let weightedLogVol = 0;
  let weightSum = 0;
  const N = series.length;
  for (let i = 0; i < N; i++) {
    const lagBack = N - i;
    const w = Math.pow(lagBack + deltaForecast, -estimatedH - 0.5) * Math.pow(lagBack, estimatedH - 0.5);
    weightedLogVol += w * series[i];
    weightSum += w;
  }
  const forecastLogVol = weightSum > 0 ? weightedLogVol / weightSum : series[N - 1];

  return {
    estimatedHurstExponent: estimatedH,
    scalingPoints,
    isRoughRegime: estimatedH < 0.25,
    forecastedVolatility: Math.exp(forecastLogVol),
  };
}
