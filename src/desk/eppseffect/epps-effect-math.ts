/**
 * Epps (1979) High-Frequency Asynchronous Correlation Decay Mathematics
 *
 * @module desk/eppseffect/epps-effect-math
 */

import type { TickRecord, EppsSamplingPoint } from './epps-effect-types';

export class EppsEffectMath {
  public static computeSynchronizedReturns(
    ticksA: TickRecord[],
    ticksB: TickRecord[],
    intervalMs: number,
    lagMs = 0,
  ): { returnsA: number[]; returnsB: number[] } {
    if (ticksA.length < 2 || ticksB.length < 2) return { returnsA: [], returnsB: [] };
    const tMin = Math.max(ticksA[0]!.timestamp, ticksB[0]!.timestamp - lagMs);
    const tMax = Math.min(ticksA[ticksA.length - 1]!.timestamp, ticksB[ticksB.length - 1]!.timestamp - lagMs);
    if (tMax - tMin < intervalMs) return { returnsA: [], returnsB: [] };

    const gridTimes: number[] = [];
    for (let t = tMin; t <= tMax; t += intervalMs) gridTimes.push(t);

    const pricesA = this.samplePreviousTicks(ticksA, gridTimes, 0);
    const pricesB = this.samplePreviousTicks(ticksB, gridTimes, lagMs);

    const returnsA: number[] = [];
    const returnsB: number[] = [];
    for (let i = 1; i < gridTimes.length; i++) {
      const pA0 = pricesA[i - 1]!;
      const pA1 = pricesA[i]!;
      const pB0 = pricesB[i - 1]!;
      const pB1 = pricesB[i]!;
      if (pA0 > 0 && pA1 > 0 && pB0 > 0 && pB1 > 0) {
        returnsA.push(Math.log(pA1 / pA0));
        returnsB.push(Math.log(pB1 / pB0));
      }
    }
    return { returnsA, returnsB };
  }

  public static pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 3) return 0;
    let sumX = 0, sumY = 0;
    for (let i = 0; i < n; i++) { sumX += x[i]!; sumY += y[i]!; }
    const meanX = sumX / n, meanY = sumY / n;

    let cov = 0, varX = 0, varY = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i]! - meanX;
      const dy = y[i]! - meanY;
      cov += dx * dy;
      varX += dx * dx;
      varY += dy * dy;
    }
    if (varX <= 1e-12 || varY <= 1e-12) return 0;
    return Math.max(-1, Math.min(1, cov / (Math.sqrt(varX) * Math.sqrt(varY))));
  }

  public static fitEppsDecayModel(points: EppsSamplingPoint[]): {
    rhoInf: number;
    tauMs: number;
    rmse: number;
  } {
    if (points.length === 0) return { rhoInf: 0, tauMs: 1000, rmse: 0 };
    // rho(dt) = rhoInf * (1 - exp(-dt / tau))
    const rhoInfCandidate = points[points.length - 1]!.correlation;
    const rhoInf = Math.max(0.01, rhoInfCandidate);

    let bestTau = 1000;
    let minRmse = Infinity;

    // Grid search for characteristic decay tau
    const candidateTaus = [100, 250, 500, 1000, 2500, 5000, 10000, 20000, 60000];
    for (const tau of candidateTaus) {
      let sse = 0;
      for (const p of points) {
        const pred = rhoInf * (1 - Math.exp(-p.samplingIntervalMs / tau));
        const diff = p.correlation - pred;
        sse += diff * diff;
      }
      const rmse = Math.sqrt(sse / points.length);
      if (rmse < minRmse) {
        minRmse = rmse;
        bestTau = tau;
      }
    }
    return { rhoInf, tauMs: bestTau, rmse: minRmse };
  }

  private static samplePreviousTicks(ticks: TickRecord[], grid: number[], lagOffset: number): number[] {
    const sampled: number[] = [];
    let tickIdx = 0;
    let currentPrice = ticks[0]!.price;

    for (const t of grid) {
      const targetTime = t + lagOffset;
      while (tickIdx < ticks.length && ticks[tickIdx]!.timestamp <= targetTime) {
        currentPrice = ticks[tickIdx]!.price;
        tickIdx++;
      }
      sampled.push(currentPrice);
    }
    return sampled;
  }
}
