import {
  ENGINE_IDS,
  EngineId,
  CovarianceMatrix,
} from './types';

export interface RollingCovarianceOptions {
  readonly windowSize?: number;
  readonly coldStartWindow?: number;
  readonly ridgeEpsilon?: number;
  readonly baselineVariance?: number;
}

export class RollingCovarianceEstimator {
  private readonly windowSize: number;
  private readonly coldStartWindow: number;
  private ridgeEpsilon: number;
  private readonly baselineVariance: number;
  private history: { timestamp: number; returns: number[] }[] = [];

  constructor(options: RollingCovarianceOptions = {}) {
    this.windowSize = options.windowSize ?? 60;
    this.coldStartWindow = options.coldStartWindow ?? 20;
    this.ridgeEpsilon = options.ridgeEpsilon ?? 1e-7;
    this.baselineVariance = options.baselineVariance ?? 0.0004;
  }

  public addObservation(returns: Record<EngineId, number>, timestamp = Date.now()): CovarianceMatrix {
    const vector = ENGINE_IDS.map((id) => {
      const val = returns[id];
      return Number.isFinite(val) ? val : 0;
    });

    this.history.push({ timestamp, returns: vector });
    if (this.history.length > this.windowSize) {
      this.history.shift();
    }

    return this.getCovarianceMatrix();
  }

  public getObservationCount(): number {
    return this.history.length;
  }

  public getCovarianceMatrix(): CovarianceMatrix {
    const n = this.history.length;
    const k = ENGINE_IDS.length;
    const lastUpdated = n > 0 ? this.history[n - 1].timestamp : Date.now();

    if (n < 2) {
      const matrix: number[][] = Array.from({ length: k }, (_, i) =>
        Array.from({ length: k }, (_, j) => (i === j ? this.baselineVariance + this.ridgeEpsilon : 0))
      );
      return { engines: [...ENGINE_IDS], matrix, observations: n, lastUpdated, isConditioned: true };
    }

    // Welford two-pass or one-pass online covariance on window
    const mean: number[] = new Array(k).fill(0);
    const m2: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));

    for (let step = 0; step < n; step++) {
      const x = this.history[step].returns;
      const count = step + 1;
      const delta: number[] = new Array(k);
      for (let i = 0; i < k; i++) {
        delta[i] = x[i] - mean[i];
        mean[i] += delta[i] / count;
      }
      for (let i = 0; i < k; i++) {
        const delta2I = x[i] - mean[i];
        for (let j = 0; j < k; j++) {
          m2[i][j] += delta[j] * delta2I;
        }
      }
    }

    const sampleCov: number[][] = Array.from({ length: k }, (_, i) =>
      Array.from({ length: k }, (_, j) => m2[i][j] / (n - 1))
    );

    // Apply cold start conditioning if n < coldStartWindow
    const conditioned: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
    const alpha = n < this.coldStartWindow ? n / this.coldStartWindow : 1.0;

    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        const sampleVal = sampleCov[i][j];
        if (i === j) {
          const varVal = Math.max(sampleVal, 1e-6);
          conditioned[i][j] = varVal + this.ridgeEpsilon;
        } else {
          conditioned[i][j] = alpha * sampleVal;
        }
      }
    }

    return {
      engines: [...ENGINE_IDS],
      matrix: conditioned,
      observations: n,
      lastUpdated,
      isConditioned: true,
    };
  }

  public getVolatilities(): Record<EngineId, number> {
    const cov = this.getCovarianceMatrix().matrix;
    const result: Partial<Record<EngineId, number>> = {};
    ENGINE_IDS.forEach((id, idx) => {
      result[id] = Math.sqrt(Math.max(cov[idx][idx], 0));
    });
    return result as Record<EngineId, number>;
  }

  public getCorrelations(): Record<EngineId, Record<EngineId, number>> {
    const cov = this.getCovarianceMatrix().matrix;
    const k = ENGINE_IDS.length;
    const stds = ENGINE_IDS.map((_, i) => Math.sqrt(Math.max(cov[i][i], 1e-12)));
    const corr: Partial<Record<EngineId, Record<EngineId, number>>> = {};

    ENGINE_IDS.forEach((rowId, i) => {
      const row: Partial<Record<EngineId, number>> = {};
      ENGINE_IDS.forEach((colId, j) => {
        if (i === j) {
          row[colId] = 1.0;
        } else {
          const raw = cov[i][j] / (stds[i] * stds[j]);
          row[colId] = Math.max(-1.0, Math.min(1.0, raw));
        }
      });
      corr[rowId] = row as Record<EngineId, number>;
    });

    return corr as Record<EngineId, Record<EngineId, number>>;
  }

  public reset(): void {
    this.history = [];
  }

  public setRidgeEpsilon(eps: number): void {
    if (eps > 0 && Number.isFinite(eps)) {
      this.ridgeEpsilon = eps;
    }
  }
}
