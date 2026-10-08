import { OrnsteinUhlenbeckParams } from './cointegration-types';

export class OrnsteinUhlenbeckEstimator {
  public estimateParameters(spreadSeries: number[], dtDays = 1.0): OrnsteinUhlenbeckParams {
    const n = spreadSeries.length;
    let sumX = 0;
    let sumY = 0;
    let sumXX = 0;
    let sumXY = 0;

    for (let i = 1; i < n; i++) {
      const x = spreadSeries[i - 1]!;
      const y = spreadSeries[i]!;
      sumX += x;
      sumY += y;
      sumXX += x * x;
      sumXY += x * y;
    }

    const count = n - 1;
    const a = (count * sumXY - sumX * sumY) / Math.max(1e-9, (count * sumXX - sumX * sumX));
    const b = (sumY - a * sumX) / count;

    let ssq = 0;
    for (let i = 1; i < n; i++) {
      const residual = spreadSeries[i]! - (a * spreadSeries[i - 1]! + b);
      ssq += residual * residual;
    }
    const resVar = ssq / count;

    const safeA = Math.min(0.9999, Math.max(0.0001, a));
    const theta = -Math.log(safeA) / dtDays;
    const mu = b / (1.0 - safeA);
    const sigma = Math.sqrt((resVar * 2 * theta) / Math.max(1e-9, (1.0 - safeA * safeA)));
    const halfLife = Math.log(2.0) / Math.max(1e-6, theta);

    const currentSpread = spreadSeries[n - 1]!;
    const unconditionalStd = Math.sqrt(resVar / Math.max(1e-9, (1.0 - safeA * safeA)));
    const zScore = (currentSpread - mu) / Math.max(1e-6, unconditionalStd);

    let signal: 'LONG_SPREAD' | 'SHORT_SPREAD' | 'NEUTRAL' = 'NEUTRAL';
    if (zScore <= -2.0) {
      signal = 'LONG_SPREAD';
    } else if (zScore >= 2.0) {
      signal = 'SHORT_SPREAD';
    }

    return {
      thetaMeanReversionSpeed: Number(theta.toFixed(4)),
      muLongTermMean: Number(mu.toFixed(4)),
      sigmaVolatility: Number(sigma.toFixed(4)),
      halfLifeDays: Number(halfLife.toFixed(2)),
      currentSpread: Number(currentSpread.toFixed(4)),
      currentZScore: Number(zScore.toFixed(2)),
      tradeSignal: signal,
    };
  }
}
