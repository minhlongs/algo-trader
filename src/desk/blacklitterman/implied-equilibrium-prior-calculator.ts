import { MarketPriorInputs } from './black-litterman-types';

export class ImpliedEquilibriumPriorCalculator {
  /**
   * Reverse optimization: Implied excess returns Pi = lambda * Sigma * w_mkt
   */
  public computeImpliedEquilibrium(inputs: MarketPriorInputs): {
    marketWeights: number[];
    impliedPriorReturns: number[];
  } {
    const { marketCapsUsd, covarianceMatrix, riskAversionLambda } = inputs;
    const N = marketCapsUsd.length;

    const totalCap = marketCapsUsd.reduce((a, b) => a + b, 0);
    if (totalCap <= 0) throw new Error('Total market cap must be positive');

    const wMkt = marketCapsUsd.map((cap) => cap / totalCap);

    // Pi = lambda * Sigma * w_mkt
    const pi: number[] = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let j = 0; j < N; j++) {
        sum += covarianceMatrix[i]![j]! * wMkt[j]!;
      }
      pi[i] = Number((riskAversionLambda * sum).toFixed(6));
    }

    return {
      marketWeights: wMkt.map((w) => Number(w.toFixed(6))),
      impliedPriorReturns: pi,
    };
  }
}
