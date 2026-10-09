import {
  EkopParameters,
  DailyTradeCount,
  EkopAnalysisResult,
  DayPosteriorProbabilities,
} from './ekop-types.js';
import { EkopMath } from './ekop-math.js';

export class EkopEngine {
  public static validate(params: EkopParameters): void {
    if (params.alpha < 0 || params.alpha > 1) {
      throw new Error('Event probability alpha must be in [0, 1].');
    }
    if (params.delta < 0 || params.delta > 1) {
      throw new Error('Bad news probability delta must be in [0, 1].');
    }
    if (params.mu <= 0) {
      throw new Error('Informed trade rate mu must be strictly positive.');
    }
    if (params.epsilon <= 0) {
      throw new Error('Uninformed trade rate epsilon must be strictly positive.');
    }
  }

  public static analyze(
    days: DailyTradeCount[],
    params: EkopParameters,
    valueDispersion: number = 1.0
  ): EkopAnalysisResult {
    this.validate(params);
    if (days.length === 0) {
      throw new Error('Trading days dataset cannot be empty.');
    }

    let totalLogLikelihood = 0;
    const posteriors: DayPosteriorProbabilities[] = [];

    for (const day of days) {
      if (day.buys < 0 || day.sells < 0) {
        throw new Error('Trade counts cannot be negative.');
      }
      const dayResult = EkopMath.dayLogLikelihood(day, params);
      totalLogLikelihood += dayResult.logLikelihood;
      posteriors.push(dayResult.posteriors);
    }

    const pin = EkopMath.calculatePin(params.alpha, params.mu, params.epsilon);
    const adverseSelectionSpread = pin * valueDispersion;
    const expectedDailyVolume = params.alpha * params.mu + 2 * params.epsilon;
    const expectedInformedRatio = pin;

    return {
      pin,
      parameters: { ...params },
      logLikelihood: totalLogLikelihood,
      adverseSelectionSpread,
      posteriors,
      expectedDailyVolume,
      expectedInformedRatio,
    };
  }

  public static estimateMoments(days: DailyTradeCount[]): EkopParameters {
    if (days.length === 0) {
      throw new Error('Cannot estimate moments from empty trade days.');
    }
    let sumBuys = 0;
    let sumSells = 0;
    let sumImbalance = 0;

    for (const d of days) {
      sumBuys += d.buys;
      sumSells += d.sells;
      sumImbalance += Math.abs(d.buys - d.sells);
    }

    const n = days.length;
    const meanBuys = sumBuys / n;
    const meanSells = sumSells / n;
    const meanImbalance = sumImbalance / n;

    const epsilon = Math.max(1, Math.min(meanBuys, meanSells));
    const alpha = 0.3;
    const mu = Math.max(1, meanImbalance / alpha);
    const delta = meanSells > meanBuys ? 0.6 : 0.4;

    return { alpha, delta, mu, epsilon };
  }
}
