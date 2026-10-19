/**
 * Estimator for High-Frequency Realized Variance, Bipower Variation, and Multi-Horizon HAR Aggregates.
 * Strictly < 150 LOC, zero :any types.
 */

import { DailyRealizedMetrics, HarHorizons, HarObservationRow } from './abdl-types';

export class AbdlHarEstimator {
  private static readonly MU1_INV_SQ = Math.PI / 2.0; // (sqrt(2/pi))^{-2} = pi / 2

  /**
   * Computes daily realized variance, bipower variation, continuous, and jump components.
   */
  public computeDailyMetrics(dateIndex: number, intradayReturns: number[]): DailyRealizedMetrics {
    const M = intradayReturns.length;
    if (M < 2) {
      throw new Error('At least 2 intraday return samples are required for realized metrics');
    }

    let rvSum = 0.0;
    for (let i = 0; i < M; i++) {
      const r = intradayReturns[i]!;
      rvSum += r * r;
    }

    let bvSum = 0.0;
    for (let i = 1; i < M; i++) {
      const rCurr = Math.abs(intradayReturns[i]!);
      const rPrev = Math.abs(intradayReturns[i - 1]!);
      bvSum += rCurr * rPrev;
    }

    // Small-sample correction M / (M - 1)
    const bv = AbdlHarEstimator.MU1_INV_SQ * (M / (M - 1)) * bvSum;
    const jump = Math.max(0.0, rvSum - bv);
    const continuous = rvSum - jump;

    return {
      dateIndex,
      realizedVariance: rvSum,
      bipowerVariation: bv,
      continuousVariance: continuous,
      jumpVariance: jump,
    };
  }

  /**
   * Constructs HAR regression dataset with daily, weekly (5-day), and monthly (22-day) lags.
   */
  public buildHarDataset(
    metrics: DailyRealizedMetrics[],
    horizons: HarHorizons = { dailyLag: 1, weeklyLag: 5, monthlyLag: 22 },
  ): HarObservationRow[] {
    const minHistory = Math.max(horizons.dailyLag, horizons.weeklyLag, horizons.monthlyLag);
    if (metrics.length <= minHistory) {
      throw new Error(`Insufficient days (${metrics.length}). Need > ${minHistory} days for HAR regression.`);
    }

    const rows: HarObservationRow[] = [];

    for (let t = minHistory - 1; t < metrics.length - 1; t++) {
      const targetRv = metrics[t + 1]!.realizedVariance;
      const rvDaily = metrics[t]!.realizedVariance;

      let sumW = 0.0;
      for (let k = 0; k < horizons.weeklyLag; k++) {
        sumW += metrics[t - k]!.realizedVariance;
      }
      const rvWeekly = sumW / horizons.weeklyLag;

      let sumM = 0.0;
      for (let k = 0; k < horizons.monthlyLag; k++) {
        sumM += metrics[t - k]!.realizedVariance;
      }
      const rvMonthly = sumM / horizons.monthlyLag;

      rows.push({
        targetRv,
        rvDaily,
        rvWeekly,
        rvMonthly,
        jumpDaily: metrics[t]!.jumpVariance,
      });
    }

    return rows;
  }
}
