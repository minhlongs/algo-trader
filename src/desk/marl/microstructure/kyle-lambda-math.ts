/**
 * Pure OLS regression and EMA baseline math for Kyle's Lambda Price Impact Calculator.
 */

export interface TradeSample {
  deltaP: number;
  signedVolume: number;
  timestamp: number;
}

export interface KyleLambdaMetrics {
  lambda: number;
  baselineLambda: number;
  lambdaRatio: number;
  sampleCount: number;
  isIlliquid: boolean;
  tStat: number;
  varQ: number;
  rSquared: number;
}

export function computeEffectiveSignedVolume(
  quantity: number,
  signedVolume: number,
  deltaP: number,
): number {
  if (signedVolume !== 0) return signedVolume;
  if (deltaP > 0) return quantity;
  if (deltaP < 0) return -quantity;
  return 0;
}

export function computeRollingOlsMetrics(
  samples: TradeSample[],
  currentBaseline: number,
  minSamples: number,
  illiquidRatioThreshold: number,
): KyleLambdaMetrics {
  const n = samples.length;
  if (n < minSamples) {
    return {
      lambda: currentBaseline,
      baselineLambda: currentBaseline,
      lambdaRatio: 1.0,
      sampleCount: n,
      isIlliquid: false,
      tStat: 0,
      varQ: 0,
      rSquared: 0,
    };
  }

  let sumP = 0;
  let sumQ = 0;
  for (let i = 0; i < n; i++) {
    sumP += samples[i].deltaP;
    sumQ += samples[i].signedVolume;
  }
  const meanP = sumP / n;
  const meanQ = sumQ / n;

  let covPQ = 0;
  let varQ = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    const qDev = samples[i].signedVolume - meanQ;
    const pDev = samples[i].deltaP - meanP;
    covPQ += pDev * qDev;
    varQ += qDev * qDev;
    sst += pDev * pDev;
  }

  if (varQ < 1e-12) {
    return {
      lambda: currentBaseline,
      baselineLambda: currentBaseline,
      lambdaRatio: 1.0,
      sampleCount: n,
      isIlliquid: false,
      tStat: 0,
      varQ: 0,
      rSquared: 0,
    };
  }

  const rawLambda = covPQ / varQ;
  const lambda = Math.max(0, rawLambda);
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const pred = rawLambda * samples[i].signedVolume;
    sse += Math.pow(samples[i].deltaP - pred, 2);
  }

  const df = Math.max(1, n - 2);
  const se = Math.sqrt(sse / Math.max(1e-12, df * varQ));
  const tStat = se > 1e-12 ? lambda / se : lambda > 0 ? 999.0 : 0;
  const rSquared = sst > 1e-12 ? Math.max(0, Math.min(1, 1 - sse / sst)) : 0;
  const lambdaRatio = lambda / Math.max(1e-9, currentBaseline);
  const isIlliquid = lambdaRatio >= illiquidRatioThreshold;

  return {
    lambda,
    baselineLambda: currentBaseline,
    lambdaRatio,
    sampleCount: n,
    isIlliquid,
    tStat,
    varQ,
    rSquared,
  };
}

export function computeUpdatedEmaBaseline(
  samples: TradeSample[],
  currentBaseline: number,
  emaAlpha: number,
): number {
  const n = samples.length;
  let sumP = 0;
  let sumQ = 0;
  for (let i = 0; i < n; i++) {
    sumP += samples[i].deltaP;
    sumQ += samples[i].signedVolume;
  }
  const meanP = sumP / n;
  const meanQ = sumQ / n;
  let cov = 0;
  let vq = 0;
  for (let i = 0; i < n; i++) {
    const qd = samples[i].signedVolume - meanQ;
    cov += (samples[i].deltaP - meanP) * qd;
    vq += qd * qd;
  }
  if (vq < 1e-12) return currentBaseline;
  const estLambda = Math.max(0, cov / vq);
  return (1 - emaAlpha) * currentBaseline + emaAlpha * estLambda;
}
