import { MarketOptionQuote, OptionFitMetric, TerminalNode } from './rubinstein-types';

export class RubinsteinMath {
  public static calculateBinomialGrid(
    s0: number,
    r: number,
    q: number,
    t: number,
    n: number,
    sigma: number
  ): { prices: number[]; priorProbs: number[]; forward: number } {
    const dt = t / n;
    const u = Math.exp(sigma * Math.sqrt(dt));
    const d = 1.0 / u;
    const drift = Math.exp((r - q) * dt);
    const p = Math.max(0.01, Math.min(0.99, (drift - d) / (u - d)));
    const forward = s0 * Math.exp((r - q) * t);

    const prices: number[] = new Array(n + 1);
    const priorProbs: number[] = new Array(n + 1);

    for (let j = 0; j <= n; j++) {
      prices[j] = s0 * Math.pow(u, j) * Math.pow(d, n - j);
      priorProbs[j] = this.binomialPmf(n, j, p);
    }

    return { prices, priorProbs, forward };
  }

  public static binomialPmf(n: number, k: number, p: number): number {
    if (k < 0 || k > n) return 0.0;
    let logCoeff = 0.0;
    for (let i = 1; i <= k; i++) {
      logCoeff += Math.log((n - (k - i)) / i);
    }
    const logProb = logCoeff + k * Math.log(p) + (n - k) * Math.log(1.0 - p);
    return Math.exp(logProb);
  }

  public static calibrateImpliedProbabilities(
    prices: number[],
    priorProbs: number[],
    forward: number,
    r: number,
    t: number,
    quotes: MarketOptionQuote[]
  ): number[] {
    const nNodes = prices.length;
    const probs = [...priorProbs];
    const discount = Math.exp(-r * t);

    // Iterative Bregman / Dykstra projection fitting linear constraints
    const maxIters = 120;
    for (let iter = 0; iter < maxIters; iter++) {
      // 1. Total probability constraint: sum(P_j) = 1
      let sumP = probs.reduce((acc, v) => acc + v, 0);
      if (sumP > 0) {
        for (let j = 0; j < nNodes; j++) probs[j] /= sumP;
      }

      // 2. Martingale forward constraint: sum(P_j * S_j) = Forward
      let meanS = 0.0;
      for (let j = 0; j < nNodes; j++) meanS += probs[j] * prices[j];
      const forwardDiff = forward - meanS;
      let varS = 0.0;
      for (let j = 0; j < nNodes; j++) varS += probs[j] * Math.pow(prices[j] - forward, 2);
      if (varS > 1e-12) {
        for (let j = 0; j < nNodes; j++) {
          probs[j] += probs[j] * ((prices[j] - forward) / varS) * forwardDiff * 0.5;
          probs[j] = Math.max(1e-10, probs[j]);
        }
      }

      // 3. Option pricing constraints: discount * sum(P_j * payoff(S_j, K)) = marketPrice
      for (const quote of quotes) {
        let modelPrice = 0.0;
        const payoffs = new Array(nNodes);
        for (let j = 0; j < nNodes; j++) {
          const payoff =
            quote.optionType === 'call'
              ? Math.max(0, prices[j] - quote.strike)
              : Math.max(0, quote.strike - prices[j]);
          payoffs[j] = payoff;
          modelPrice += discount * probs[j] * payoff;
        }

        const priceErr = quote.marketPrice - modelPrice;
        let denom = 0.0;
        for (let j = 0; j < nNodes; j++) {
          denom += probs[j] * payoffs[j] * payoffs[j];
        }

        if (denom > 1e-12 && Math.abs(priceErr) > 1e-7) {
          const lambda = (priceErr / (discount * denom)) * 0.4;
          for (let j = 0; j < nNodes; j++) {
            probs[j] += probs[j] * lambda * payoffs[j];
            probs[j] = Math.max(1e-10, probs[j]);
          }
        }
      }
    }

    // Final normalization
    const finalSum = probs.reduce((acc, v) => acc + v, 0);
    return probs.map((p) => p / finalSum);
  }

  public static evaluateFit(
    prices: number[],
    impliedProbs: number[],
    r: number,
    t: number,
    quotes: MarketOptionQuote[]
  ): OptionFitMetric[] {
    const discount = Math.exp(-r * t);
    return quotes.map((q) => {
      let modelPrice = 0.0;
      for (let j = 0; j < prices.length; j++) {
        const payoff =
          q.optionType === 'call'
            ? Math.max(0, prices[j] - q.strike)
            : Math.max(0, q.strike - prices[j]);
        modelPrice += discount * impliedProbs[j] * payoff;
      }
      return {
        strike: q.strike,
        optionType: q.optionType,
        marketPrice: q.marketPrice,
        modelPrice,
        error: modelPrice - q.marketPrice,
      };
    });
  }

  public static calculateKullbackLeibler(p: number[], q: number[]): number {
    let kl = 0.0;
    for (let i = 0; i < p.length; i++) {
      if (p[i] > 1e-12 && q[i] > 1e-12) {
        kl += p[i] * Math.log(p[i] / q[i]);
      }
    }
    return Math.max(0.0, kl);
  }
}
