import { OuCalibratedParameters, OuStoppingBands } from './ou-types';

export class OuStoppingEngine {
  public fitContinuousOu(timeSeries: number[], dtDays = 1.0): OuCalibratedParameters {
    const n = timeSeries.length;
    if (n < 10) throw new Error('At least 10 observations required to fit OU process');
    if (dtDays <= 0) throw new Error('dtDays must be positive');

    // AR(1) discrete representation: X_{t+1} = a * X_t + b + eps
    // where a = exp(-theta * dt), b = mu * (1 - a)
    let sumX = 0;
    let sumY = 0;
    let sumXX = 0;
    let sumXY = 0;

    for (let i = 0; i < n - 1; i++) {
      const x = timeSeries[i]!;
      const y = timeSeries[i + 1]!;
      sumX += x;
      sumY += y;
      sumXX += x * x;
      sumXY += x * y;
    }

    const m = n - 1;
    const denom = m * sumXX - sumX * sumX;
    if (Math.abs(denom) < 1e-12) throw new Error('Degenerate time series with zero variance');

    const a = (m * sumXY - sumX * sumY) / denom;
    const b = (sumY - a * sumX) / m;

    const clampedA = Math.max(0.0001, Math.min(0.9999, a));
    const theta = -Math.log(clampedA) / dtDays;
    const mu = b / (1.0 - clampedA);

    // Residual variance estimation
    let sse = 0;
    for (let i = 0; i < m; i++) {
      const res = timeSeries[i + 1]! - (a * timeSeries[i]! + b);
      sse += res * res;
    }
    const varEps = sse / m;
    const sigma = Math.sqrt((varEps * 2.0 * theta) / (1.0 - Math.pow(clampedA, 2.0)));
    const halfLife = Math.log(2.0) / theta;
    const stationaryVar = (sigma * sigma) / (2.0 * theta);

    return {
      speedOfMeanReversionTheta: Number(theta.toFixed(6)),
      longTermMeanMu: Number(mu.toFixed(4)),
      volatilitySigma: Number(sigma.toFixed(6)),
      halfLifeDays: Number(halfLife.toFixed(2)),
      stationaryVariance: Number(stationaryVar.toFixed(6)),
    };
  }

  public computeStoppingBands(
    currentSpread: number,
    params: OuCalibratedParameters,
    entryZ = 2.0,
    exitZ = 0.5
  ): OuStoppingBands {
    const { longTermMeanMu: mu, stationaryVariance } = params;
    const stdDev = Math.sqrt(Math.max(1e-8, stationaryVariance));
    const zScore = (currentSpread - mu) / stdDev;

    const upperThreshold = mu + entryZ * stdDev;
    const lowerThreshold = mu - entryZ * stdDev;

    let tradeSignal: 'ENTER_LONG' | 'ENTER_SHORT' | 'EXIT_SPREAD' | 'HOLD' = 'HOLD';

    if (zScore <= -entryZ) {
      tradeSignal = 'ENTER_LONG';
    } else if (zScore >= entryZ) {
      tradeSignal = 'ENTER_SHORT';
    } else if (Math.abs(zScore) <= exitZ) {
      tradeSignal = 'EXIT_SPREAD';
    }

    return {
      upperExitLevel: Number(upperThreshold.toFixed(4)),
      lowerExitLevel: Number(lowerThreshold.toFixed(4)),
      entryThresholdStdDev: entryZ,
      zScoreCurrent: Number(zScore.toFixed(4)),
      tradeSignal,
    };
  }
}
