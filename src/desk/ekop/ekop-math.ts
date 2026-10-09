import { EkopParameters, DailyTradeCount, DayPosteriorProbabilities } from './ekop-types.js';

export class EkopMath {
  private static logFactorial(n: number): number {
    if (n <= 1) return 0;
    let sum = 0;
    for (let i = 2; i <= n; i++) {
      sum += Math.log(i);
    }
    return sum;
  }

  public static calculatePin(alpha: number, mu: number, epsilon: number): number {
    const informed = alpha * mu;
    const totalFlow = informed + 2 * epsilon;
    if (totalFlow <= 0) return 0;
    return informed / totalFlow;
  }

  public static dayLogLikelihood(
    day: DailyTradeCount,
    params: EkopParameters
  ): { logLikelihood: number; posteriors: DayPosteriorProbabilities } {
    const { buys: B, sells: S } = day;
    const { alpha, delta, mu, epsilon } = params;

    const logFactB = this.logFactorial(B);
    const logFactS = this.logFactorial(S);
    const logFactSum = logFactB + logFactS;

    const logL0 = (alpha < 1)
      ? Math.log(1 - alpha) - 2 * epsilon + (B + S) * Math.log(epsilon) - logFactSum
      : Number.NEGATIVE_INFINITY;

    const logLG = (alpha > 0 && delta < 1)
      ? Math.log(alpha) + Math.log(1 - delta) - (2 * epsilon + mu) +
        B * Math.log(epsilon + mu) + S * Math.log(epsilon) - logFactSum
      : Number.NEGATIVE_INFINITY;

    const logLB = (alpha > 0 && delta > 0)
      ? Math.log(alpha) + Math.log(delta) - (2 * epsilon + mu) +
        B * Math.log(epsilon) + S * Math.log(epsilon + mu) - logFactSum
      : Number.NEGATIVE_INFINITY;

    const maxLog = Math.max(logL0, logLG, logLB);
    const exp0 = logL0 === Number.NEGATIVE_INFINITY ? 0 : Math.exp(logL0 - maxLog);
    const expG = logLG === Number.NEGATIVE_INFINITY ? 0 : Math.exp(logLG - maxLog);
    const expB = logLB === Number.NEGATIVE_INFINITY ? 0 : Math.exp(logLB - maxLog);

    const sumExp = exp0 + expG + expB;
    const logLikelihood = maxLog + Math.log(sumExp);

    const probNoEvent = exp0 / sumExp;
    const probGoodNews = expG / sumExp;
    const probBadNews = expB / sumExp;

    let classifiedState: 'NO_EVENT' | 'GOOD_NEWS' | 'BAD_NEWS' = 'NO_EVENT';
    if (probGoodNews >= probNoEvent && probGoodNews >= probBadNews) {
      classifiedState = 'GOOD_NEWS';
    } else if (probBadNews >= probNoEvent && probBadNews >= probGoodNews) {
      classifiedState = 'BAD_NEWS';
    }

    return {
      logLikelihood,
      posteriors: {
        probNoEvent,
        probGoodNews,
        probBadNews,
        classifiedState,
      },
    };
  }
}
