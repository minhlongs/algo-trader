/**
 * Epps (1979) High-Frequency Asynchronous Correlation Decay Engine
 *
 * @module desk/eppseffect/epps-effect-engine
 */

import type {
  TickRecord,
  EppsSamplingPoint,
  EppsDecayCurve,
  LeadLagEstimate,
  EppsAnalysisResult,
} from './epps-effect-types';
import { EppsEffectMath } from './epps-effect-math';

export class EppsEffectEngine {
  public analyze(
    assetA: string,
    ticksA: TickRecord[],
    assetB: string,
    ticksB: TickRecord[],
    samplingIntervalsMs: number[] = [100, 250, 500, 1000, 2500, 5000, 10000, 30000],
    lagsMs: number[] = [-5000, -2500, -1000, -500, 0, 500, 1000, 2500, 5000],
  ): EppsAnalysisResult {
    this.validateTicks(ticksA, assetA);
    this.validateTicks(ticksB, assetB);

    const decayCurve = this.computeDecayCurve(ticksA, ticksB, samplingIntervalsMs);
    const leadLag = this.estimateLeadLag(ticksA, ticksB, lagsMs);

    const isEppsEffectPresent =
      decayCurve.points.length >= 2 &&
      decayCurve.points[0]!.correlation < decayCurve.points[decayCurve.points.length - 1]!.correlation * 0.7;

    return {
      assetA,
      assetB,
      decayCurve,
      leadLag,
      isEppsEffectPresent,
    };
  }

  public computeDecayCurve(
    ticksA: TickRecord[],
    ticksB: TickRecord[],
    intervalsMs: number[],
  ): EppsDecayCurve {
    const points: EppsSamplingPoint[] = [];

    for (const dt of intervalsMs) {
      const { returnsA, returnsB } = EppsEffectMath.computeSynchronizedReturns(ticksA, ticksB, dt, 0);
      const corr = EppsEffectMath.pearsonCorrelation(returnsA, returnsB);
      points.push({
        samplingIntervalMs: dt,
        correlation: corr,
        sampleCount: returnsA.length,
      });
    }

    const { rhoInf, tauMs, rmse } = EppsEffectMath.fitEppsDecayModel(points);
    return {
      asymptoticCorrelation: rhoInf,
      tauDecayMs: tauMs,
      fitRmse: rmse,
      points,
    };
  }

  public estimateLeadLag(
    ticksA: TickRecord[],
    ticksB: TickRecord[],
    lagsMs: number[],
    evaluationDtMs = 1000,
  ): LeadLagEstimate {
    const lagGrid: Array<{ lagMs: number; correlation: number }> = [];
    let bestLag = 0;
    let maxCorr = -Infinity;
    let zeroLagCorr = 0;

    for (const lag of lagsMs) {
      const { returnsA, returnsB } = EppsEffectMath.computeSynchronizedReturns(
        ticksA,
        ticksB,
        evaluationDtMs,
        lag,
      );
      const corr = EppsEffectMath.pearsonCorrelation(returnsA, returnsB);
      lagGrid.push({ lagMs: lag, correlation: corr });

      if (lag === 0) zeroLagCorr = corr;
      if (corr > maxCorr) {
        maxCorr = corr;
        bestLag = lag;
      }
    }

    const denom = Math.abs(zeroLagCorr) > 1e-4 ? Math.abs(zeroLagCorr) : 1e-4;
    const asymmetryRatio = maxCorr / denom;

    return {
      optimalLagMs: bestLag,
      peakCorrelation: maxCorr,
      zeroLagCorrelation: zeroLagCorr,
      asymmetryRatio,
      lagGrid,
    };
  }

  private validateTicks(ticks: TickRecord[], assetName: string): void {
    if (ticks.length < 5) {
      throw new Error(`Insufficient ticks for ${assetName}: expected >= 5, got ${ticks.length}`);
    }
  }
}
