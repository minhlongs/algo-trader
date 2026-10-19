/**
 * Barndorff-Nielsen & Shephard (2004) BPV Engine.
 * Strictly < 180 LOC, zero :any types.
 */

import { evaluateBnsJumpTest } from './bipower-math';
import {
  JumpDecompositionSummary,
  JumpTestResult,
} from './bipower-types';

export class BiPowerVariationEngine {
  public analyzeDay(
    intradayReturns: readonly number[],
    criticalZ = 2.326
  ): JumpTestResult {
    return evaluateBnsJumpTest(intradayReturns, criticalZ);
  }

  public analyzeHistory(
    dailyIntradaySeries: readonly (readonly number[])[],
    criticalZ = 2.326
  ): JumpDecompositionSummary {
    if (dailyIntradaySeries.length === 0) {
      throw new Error('Cannot analyze empty historical intraday series');
    }

    const dailyResults: JumpTestResult[] = [];
    let jumpDaysCount = 0;
    let sumRv = 0;
    let sumCv = 0;
    let sumJv = 0;

    for (const dayReturns of dailyIntradaySeries) {
      const res = this.analyzeDay(dayReturns, criticalZ);
      dailyResults.push(res);
      if (res.isJumpDay) {
        jumpDaysCount++;
      }
      sumRv += res.realizedVariance;
      sumCv += res.continuousVariance;
      sumJv += res.jumpVariance;
    }

    const totalDays = dailyIntradaySeries.length;
    const jumpFrequencyPct = (jumpDaysCount / totalDays) * 100.0;
    const meanRealizedVol = Math.sqrt(Math.max(1e-12, sumRv / totalDays));
    const meanContinuousVol = Math.sqrt(Math.max(1e-12, sumCv / totalDays));
    const meanJumpVol = Math.sqrt(Math.max(1e-12, sumJv / totalDays));

    return {
      totalDays,
      jumpDaysCount,
      jumpFrequencyPct,
      meanRealizedVol,
      meanContinuousVol,
      meanJumpVol,
      dailyResults,
    };
  }

  public extractPureContinuousComponent(
    intradayReturns: readonly number[]
  ): {
    continuousVol: number;
    jumpVol: number;
    jumpDetected: boolean;
  } {
    const res = this.analyzeDay(intradayReturns);
    return {
      continuousVol: Math.sqrt(res.continuousVariance),
      jumpVol: Math.sqrt(res.jumpVariance),
      jumpDetected: res.isJumpDay,
    };
  }
}
