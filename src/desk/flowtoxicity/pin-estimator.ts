import { PinDailyTradeData, PinEstimationResult, PinParameters } from './pin-types';
import { PinLikelihood } from './pin-likelihood';

export class PinEstimator {
  /**
   * Calculates Probability of Informed Trading (PIN)
   * PIN = (alpha * mu) / (alpha * mu + epsilonBuy + epsilonSell)
   */
  public static calculatePin(params: PinParameters): number {
    const informedRate = params.alpha * params.mu;
    const totalOrderRate = informedRate + params.epsilonBuy + params.epsilonSell;
    if (totalOrderRate <= 0) return 0.0;
    return informedRate / totalOrderRate;
  }

  /**
   * Initializes baseline parameters from sample order flow moments
   */
  public static initializeParameters(data: PinDailyTradeData[]): PinParameters {
    if (data.length === 0) {
      throw new Error('Trade data array cannot be empty');
    }

    let sumB = 0;
    let sumS = 0;
    let sumAbsImbalance = 0;

    for (const d of data) {
      sumB += d.buys;
      sumS += d.sells;
      sumAbsImbalance += Math.abs(d.buys - d.sells);
    }

    const n = data.length;
    const meanB = sumB / n;
    const meanS = sumS / n;
    const meanImbalance = sumAbsImbalance / n;

    const alpha = 0.35;
    const delta = 0.5;
    const mu = Math.max(10, meanImbalance / Math.max(0.1, alpha));
    const epsilonBuy = Math.max(5, meanB - (1 - delta) * alpha * mu);
    const epsilonSell = Math.max(5, meanS - delta * alpha * mu);

    return { alpha, delta, mu, epsilonBuy, epsilonSell };
  }

  /**
   * Expectation-Maximization (EM) estimation for EKOP PIN model parameters
   */
  public static estimateViaEM(
    data: PinDailyTradeData[],
    maxIterations = 200,
    tolerance = 1e-5,
    initialGuess?: PinParameters
  ): PinEstimationResult {
    if (data.length === 0) {
      throw new Error('Trade data array cannot be empty');
    }

    let params = initialGuess ?? this.initializeParameters(data);
    let prevLogLikelihood = PinLikelihood.calculateTotalLogLikelihood(data, params);
    const n = data.length;

    let converged = false;
    let iter = 0;

    for (; iter < maxIterations; iter++) {
      // E-step: compute posterior regime probabilities
      const posteriors = data.map((d) => PinLikelihood.calculatePosteriorRegimes(d, params));

      let sumNoEvent = 0;
      let sumBadNews = 0;
      let sumGoodNews = 0;
      let sumB = 0;
      let sumS = 0;

      for (let i = 0; i < n; i++) {
        const p = posteriors[i]!;
        const d = data[i]!;
        sumNoEvent += p.probNoEvent;
        sumBadNews += p.probBadNews;
        sumGoodNews += p.probGoodNews;
        sumB += d.buys;
        sumS += d.sells;
      }

      const sumEvents = sumBadNews + sumGoodNews;

      // M-step: parameter updates
      const nextAlpha = Math.min(0.999, Math.max(0.001, sumEvents / n));
      const nextDelta =
        sumEvents > 1e-9 ? Math.min(0.999, Math.max(0.001, sumBadNews / sumEvents)) : 0.5;

      // mu update
      let informedTrades = 0;
      for (let i = 0; i < n; i++) {
        const p = posteriors[i]!;
        const d = data[i]!;
        informedTrades += p.probGoodNews * (d.buys - params.epsilonBuy);
        informedTrades += p.probBadNews * (d.sells - params.epsilonSell);
      }
      const nextMu = Math.max(1.0, informedTrades / Math.max(1e-6, sumEvents));

      // noise rate updates
      const nextEpsilonBuy = Math.max(1.0, (sumB - nextMu * sumGoodNews) / n);
      const nextEpsilonSell = Math.max(1.0, (sumS - nextMu * sumBadNews) / n);

      params = {
        alpha: nextAlpha,
        delta: nextDelta,
        mu: nextMu,
        epsilonBuy: nextEpsilonBuy,
        epsilonSell: nextEpsilonSell,
      };

      const currLogLikelihood = PinLikelihood.calculateTotalLogLikelihood(data, params);
      if (Math.abs(currLogLikelihood - prevLogLikelihood) < tolerance) {
        converged = true;
        prevLogLikelihood = currLogLikelihood;
        break;
      }
      prevLogLikelihood = currLogLikelihood;
    }

    const pin = this.calculatePin(params);

    return {
      parameters: params,
      pin,
      logLikelihood: prevLogLikelihood,
      iterations: iter + 1,
      converged,
    };
  }
}
