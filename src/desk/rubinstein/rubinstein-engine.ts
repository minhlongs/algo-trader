import { RubinsteinParams, RubinsteinResult, TerminalNode } from './rubinstein-types';
import { RubinsteinMath } from './rubinstein-math';

export class RubinsteinEngine {
  public static calibrate(params: RubinsteinParams): RubinsteinResult {
    this.validate(params);

    const { spotPrice, riskFreeRate, dividendYield, timeToMaturity, steps, marketQuotes, volatilityPrior } =
      params;

    // 1. Generate underlying grid and prior binomial distribution
    const { prices, priorProbs, forward } = RubinsteinMath.calculateBinomialGrid(
      spotPrice,
      riskFreeRate,
      dividendYield,
      timeToMaturity,
      steps,
      volatilityPrior
    );

    // 2. Calibrate implied terminal state probabilities
    const impliedProbs = RubinsteinMath.calibrateImpliedProbabilities(
      prices,
      priorProbs,
      forward,
      riskFreeRate,
      timeToMaturity,
      marketQuotes
    );

    // 3. Assemble terminal nodes
    const terminalNodes: TerminalNode[] = prices.map((price, idx) => ({
      index: idx,
      spotPrice: price,
      priorProb: priorProbs[idx],
      impliedProb: impliedProbs[idx],
    }));

    // 4. Compute fit metrics
    const fitMetrics = RubinsteinMath.evaluateFit(
      prices,
      impliedProbs,
      riskFreeRate,
      timeToMaturity,
      marketQuotes
    );

    const maxAbsFittingError = Math.max(...fitMetrics.map((m) => Math.abs(m.error)), 0.0);

    // 5. Martingale condition check: sum(impliedProb * price) - forward
    const impliedMean = terminalNodes.reduce((acc, n) => acc + n.impliedProb * n.spotPrice, 0.0);
    const martingaleError = Math.abs(impliedMean - forward);

    // 6. Entropy divergence vs prior
    const entropyDivergence = RubinsteinMath.calculateKullbackLeibler(impliedProbs, priorProbs);

    return {
      spotPrice,
      forwardPrice: forward,
      terminalNodes,
      fitMetrics,
      maxAbsFittingError,
      martingaleError,
      entropyDivergence,
    };
  }

  private static validate(params: RubinsteinParams): void {
    if (params.spotPrice <= 0) {
      throw new Error(`Spot price must be positive, got ${params.spotPrice}`);
    }
    if (params.timeToMaturity <= 0) {
      throw new Error(`Time to maturity must be positive, got ${params.timeToMaturity}`);
    }
    if (params.steps < 2 || params.steps > 200) {
      throw new Error(`Binomial steps must be between 2 and 200, got ${params.steps}`);
    }
    if (params.volatilityPrior <= 0) {
      throw new Error(`Prior volatility must be positive, got ${params.volatilityPrior}`);
    }
    if (!params.marketQuotes || params.marketQuotes.length === 0) {
      throw new Error('At least one market option quote is required');
    }
    for (const q of params.marketQuotes) {
      if (q.strike <= 0) {
        throw new Error(`Option strike must be positive, got ${q.strike}`);
      }
      if (q.marketPrice < 0) {
        throw new Error(`Option market price cannot be negative, got ${q.marketPrice}`);
      }
    }
  }
}
