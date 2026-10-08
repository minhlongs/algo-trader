import { VolatilitySeriesInput, HurstEstimationResult } from './roughvol-types';

export class HurstParameterEstimator {
  public estimateHurst(input: VolatilitySeriesInput, maxLag = 10): HurstEstimationResult {
    const { dailyVolatilityEstimates } = input;
    const logVols = dailyVolatilityEstimates.map(v => Math.log(Math.max(1e-4, v)));
    const n = logVols.length;

    const lagMoments: { lagDelta: number; secondMoment: number }[] = [];
    const logLags: number[] = [];
    const logMoments: number[] = [];

    for (let delta = 1; delta <= Math.min(maxLag, Math.floor(n / 4)); delta++) {
      let sumSqDiff = 0;
      let count = 0;
      for (let t = 0; t < n - delta; t++) {
        const diff = logVols[t + delta]! - logVols[t]!;
        sumSqDiff += diff * diff;
        count++;
      }
      if (count > 0) {
        const m2 = sumSqDiff / count;
        lagMoments.push({ lagDelta: delta, secondMoment: Number(m2.toFixed(6)) });
        logLags.push(Math.log(delta));
        logMoments.push(Math.log(Math.max(1e-8, m2)));
      }
    }

    const numPoints = logLags.length;
    let meanX = 0;
    let meanY = 0;
    for (let i = 0; i < numPoints; i++) {
      meanX += logLags[i]!;
      meanY += logMoments[i]!;
    }
    meanX /= numPoints;
    meanY /= numPoints;

    let covXY = 0;
    let varX = 0;
    let varY = 0;
    for (let i = 0; i < numPoints; i++) {
      const dx = logLags[i]! - meanX;
      const dy = logMoments[i]! - meanY;
      covXY += dx * dy;
      varX += dx * dx;
      varY += dy * dy;
    }

    const slope = varX > 1e-9 ? covXY / varX : 0.30;
    const rSquared = (varX > 1e-9 && varY > 1e-9) ? (covXY * covXY) / (varX * varY) : 0;
    const hurstH = Math.max(0.01, Math.min(0.99, slope / 2.0));

    return {
      hurstParameterH: Number(hurstH.toFixed(4)),
      isRoughRegime: hurstH < 0.50,
      rSquared: Number(rSquared.toFixed(4)),
      lagMoments,
    };
  }
}
