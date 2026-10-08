import { PinDailyTradeData, PinParameters, PinRegimeProbabilities } from './pin-types';

export class PinLikelihood {
  /**
   * Log-gamma Stirling approximation for log(n!) = log(Gamma(n+1))
   */
  public static logFactorial(n: number): number {
    if (n <= 1) return 0.0;
    // Ramanujan's formula or Stirling
    let sum = 0;
    if (n < 20) {
      for (let i = 2; i <= n; i++) sum += Math.log(i);
      return sum;
    }
    return n * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI * n) + 1.0 / (12.0 * n);
  }

  /**
   * Numerically stable log-sum-exp: log(sum(exp(x_i)))
   */
  public static logSumExp(values: number[]): number {
    const maxVal = Math.max(...values);
    if (!Number.isFinite(maxVal)) return -Infinity;
    let sum = 0;
    for (const v of values) {
      sum += Math.exp(v - maxVal);
    }
    return maxVal + Math.log(sum);
  }

  /**
   * Daily log-likelihood for observed buys and sells under EKOP (1996)
   */
  public static calculateDailyLogLikelihood(
    trade: PinDailyTradeData,
    params: PinParameters
  ): number {
    const { B, S } = { B: trade.buys, S: trade.sells };
    const { alpha, delta, mu, epsilonBuy: eb, epsilonSell: es } = params;

    // Component 1: No news
    // (1 - alpha) * Poisson(B, eb) * Poisson(S, es)
    const logNoNews =
      Math.log(Math.max(1e-12, 1.0 - alpha)) -
      eb +
      B * Math.log(eb) -
      this.logFactorial(B) -
      es +
      S * Math.log(es) -
      this.logFactorial(S);

    // Component 2: Bad news (informed sell)
    // alpha * delta * Poisson(B, eb) * Poisson(S, es + mu)
    const logBadNews =
      Math.log(Math.max(1e-12, alpha * delta)) -
      eb +
      B * Math.log(eb) -
      this.logFactorial(B) -
      (es + mu) +
      S * Math.log(es + mu) -
      this.logFactorial(S);

    // Component 3: Good news (informed buy)
    // alpha * (1 - delta) * Poisson(B, eb + mu) * Poisson(S, es)
    const logGoodNews =
      Math.log(Math.max(1e-12, alpha * (1.0 - delta))) -
      (eb + mu) +
      B * Math.log(eb + mu) -
      this.logFactorial(B) -
      es +
      S * Math.log(es) -
      this.logFactorial(S);

    return this.logSumExp([logNoNews, logBadNews, logGoodNews]);
  }

  /**
   * Total sample log-likelihood across all trading days
   */
  public static calculateTotalLogLikelihood(
    data: PinDailyTradeData[],
    params: PinParameters
  ): number {
    let total = 0;
    for (const trade of data) {
      total += this.calculateDailyLogLikelihood(trade, params);
    }
    return total;
  }

  /**
   * Posterior regime probabilities for a given day (E-step posterior weights)
   */
  public static calculatePosteriorRegimes(
    trade: PinDailyTradeData,
    params: PinParameters
  ): PinRegimeProbabilities {
    const { B, S } = { B: trade.buys, S: trade.sells };
    const { alpha, delta, mu, epsilonBuy: eb, epsilonSell: es } = params;

    const logNoNews =
      Math.log(Math.max(1e-12, 1.0 - alpha)) - eb + B * Math.log(eb) - es + S * Math.log(es);

    const logBadNews =
      Math.log(Math.max(1e-12, alpha * delta)) -
      eb +
      B * Math.log(eb) -
      (es + mu) +
      S * Math.log(es + mu);

    const logGoodNews =
      Math.log(Math.max(1e-12, alpha * (1.0 - delta))) -
      (eb + mu) +
      B * Math.log(eb + mu) -
      es +
      S * Math.log(es);

    const logTotal = this.logSumExp([logNoNews, logBadNews, logGoodNews]);

    return {
      probNoEvent: Math.exp(logNoNews - logTotal),
      probBadNews: Math.exp(logBadNews - logTotal),
      probGoodNews: Math.exp(logGoodNews - logTotal),
    };
  }
}
