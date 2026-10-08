import { PricePairSeries, CointegrationResult } from './cointegration-types';

export class EngleGrangerAnalyzer {
  public analyzePair(pair: PricePairSeries): CointegrationResult {
    const { pricesY, pricesX } = pair;
    const n = Math.min(pricesY.length, pricesX.length);

    let meanX = 0;
    let meanY = 0;
    for (let i = 0; i < n; i++) {
      meanX += pricesX[i]!;
      meanY += pricesY[i]!;
    }
    meanX /= n;
    meanY /= n;

    let covXY = 0;
    let varX = 0;
    let varY = 0;
    for (let i = 0; i < n; i++) {
      const dx = pricesX[i]! - meanX;
      const dy = pricesY[i]! - meanY;
      covXY += dx * dy;
      varX += dx * dx;
      varY += dy * dy;
    }

    const beta = varX > 1e-9 ? covXY / varX : 1.0;
    const alpha = meanY - beta * meanX;
    const rSquared = (varX > 1e-9 && varY > 1e-9) ? (covXY * covXY) / (varX * varY) : 0;

    const residuals: number[] = [];
    for (let i = 0; i < n; i++) {
      residuals.push(pricesY[i]! - (alpha + beta * pricesX[i]!));
    }

    // Dickey-Fuller regression on residuals: delta e_t = gamma * e_{t-1} + error
    let sumResLagSq = 0;
    let sumResLagDelta = 0;
    for (let i = 1; i < n; i++) {
      const lag = residuals[i - 1]!;
      const delta = residuals[i]! - lag;
      sumResLagSq += lag * lag;
      sumResLagDelta += lag * delta;
    }

    const gamma = sumResLagSq > 1e-9 ? sumResLagDelta / sumResLagSq : 0;
    let ssqErrors = 0;
    for (let i = 1; i < n; i++) {
      const err = (residuals[i]! - residuals[i - 1]!) - gamma * residuals[i - 1]!;
      ssqErrors += err * err;
    }
    const seGamma = Math.sqrt(Math.max(1e-9, (ssqErrors / Math.max(1, n - 2)) / Math.max(1e-9, sumResLagSq)));
    const adfStat = gamma / seGamma;

    // MacKinnon critical value at 5% significance for n ~ 50-100 is approx -2.90
    const isCointegrated = adfStat < -2.85;

    return {
      hedgeRatioBeta: Number(beta.toFixed(4)),
      interceptAlpha: Number(alpha.toFixed(4)),
      rSquared: Number(rSquared.toFixed(4)),
      adfTestStatistic: Number(adfStat.toFixed(4)),
      isCointegrated,
      residuals,
    };
  }
}
