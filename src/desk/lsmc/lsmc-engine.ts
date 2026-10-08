import { LsmcMath } from './lsmc-math';
import { LsmcParams, LsmcResult, OptionType } from './lsmc-types';

export class LsmcEngine {
  /**
   * Generates standard normal random numbers using Box-Muller
   */
  private static boxMuller(): number[] {
    const u1 = Math.max(1e-12, Math.random());
    const u2 = Math.random();
    const r = Math.sqrt(-2.0 * Math.log(u1));
    const theta = 2.0 * Math.PI * u2;
    return [r * Math.cos(theta), r * Math.sin(theta)];
  }

  /**
   * Generates geometric Brownian motion paths
   * Returns matrix: paths[numPaths][numSteps + 1]
   */
  private static generatePaths(
    S0: number,
    r: number,
    q: number,
    vol: number,
    T: number,
    M: number,
    N: number
  ): number[][] {
    const dt = T / M;
    const drift = (r - q - 0.5 * vol * vol) * dt;
    const vSdt = vol * Math.sqrt(dt);

    const paths: number[][] = Array.from({ length: N }, () => new Array(M + 1));
    for (let i = 0; i < N; i++) {
      paths[i]![0] = S0;
    }

    // Antithetic variates partially to smooth? We'll just do standard.
    for (let t = 1; t <= M; t++) {
      for (let i = 0; i < N; i += 2) {
        const z = this.boxMuller();
        // Path 1
        paths[i]![t] = paths[i]![t - 1]! * Math.exp(drift + vSdt * z[0]!);
        // Path 2 (antithetic pairing helps variance)
        if (i + 1 < N) {
          paths[i + 1]![t] = paths[i + 1]![t - 1]! * Math.exp(drift + vSdt * z[1]!);
        }
      }
    }
    return paths;
  }

  /**
   * Intrinsic value payoff
   */
  private static payoff(S: number, K: number, type: OptionType): number {
    return type === OptionType.CALL ? Math.max(0, S - K) : Math.max(0, K - S);
  }

  /**
   * Main entry point for Longstaff-Schwartz Monte Carlo
   */
  public static calculate(params: LsmcParams): LsmcResult {
    const S0 = params.spotPrice;
    const K = params.strikePrice;
    const r = params.riskFreeRate;
    const q = params.dividendYield;
    const vol = params.volatility;
    const T = params.timeToMaturity;
    const type = params.optionType;
    const N = params.numPaths ?? 10000;
    const M = params.numSteps ?? 50;
    const basisTerms = params.basisTerms ?? 3;

    const dt = T / M;
    const df = Math.exp(-r * dt);

    const paths = this.generatePaths(S0, r, q, vol, T, M, N);

    // Track the realized cashflow value for each path
    const cashflows = new Float64Array(N);
    const euroCashflows = new Float64Array(N);

    // Terminal payoff
    for (let i = 0; i < N; i++) {
      const p = this.payoff(paths[i]![M]!, K, type);
      cashflows[i] = p;
      euroCashflows[i] = p;
    }

    // Iterate backwards through time
    for (let t = M - 1; t > 0; t--) {
      // Step 1: Identify In-The-Money (ITM) paths
      const itmIndices: number[] = [];
      for (let i = 0; i < N; i++) {
        if (this.payoff(paths[i]![t]!, K, type) > 0) {
          itmIndices.push(i);
        }
      }

      // If no ITM paths, just discount and continue
      if (itmIndices.length === 0) {
        for (let i = 0; i < N; i++) cashflows[i] *= df;
        continue;
      }

      // Step 2: Prepare regression data (only for ITM paths)
      const X_reg: number[][] = [];
      const Y_reg: number[] = [];

      // Scale X to avoid numerical explosion in polynomial terms
      // Dividing by K normalizes strike-vicinity spots to ~1.0
      for (const idx of itmIndices) {
        const spot = paths[idx]![t]! / K;
        X_reg.push(LsmcMath.laguerrePolynomials(spot, basisTerms));
        Y_reg.push(cashflows[idx]! * df); // discounted cashflow
      }

      // Step 3: Regress Y on X to find conditional expectation (Continuation Value)
      let beta: number[] = new Array(basisTerms).fill(0);
      try {
        beta = LsmcMath.ols(X_reg, Y_reg);
      } catch (e) {
        // Fallback if matrix is singular (rare in large MC, but possible if spots are identical)
        // just keep the zero beta, meaning continuation value = 0 (always exercise if ITM)
      }

      // Step 4: Early exercise decision for all paths
      for (let i = 0; i < N; i++) {
        cashflows[i] *= df; // Discount by default

        const exerciseValue = this.payoff(paths[i]![t]!, K, type);
        if (exerciseValue > 0) {
          const spotScaled = paths[i]![t]! / K;
          const basis = LsmcMath.laguerrePolynomials(spotScaled, basisTerms);
          let continuationValue = 0;
          for (let b = 0; b < basisTerms; b++) continuationValue += beta[b]! * basis[b]!;

          // Compare and overwrite if early exercise is better
          if (exerciseValue > continuationValue) {
            cashflows[i] = exerciseValue;
          }
        }
      }
    }

    // Discount back to t=0
    let totalAmerican = 0;
    let sumSqAmerican = 0;
    let totalEuro = 0;

    for (let i = 0; i < N; i++) {
      const pvAm = cashflows[i]! * df;
      const pvEu = euroCashflows[i]! * Math.exp(-r * T);
      totalAmerican += pvAm;
      sumSqAmerican += pvAm * pvAm;
      totalEuro += pvEu;
    }

    const americanPrice = totalAmerican / N;
    const europeanPrice = totalEuro / N;
    const variance = (sumSqAmerican - N * americanPrice * americanPrice) / (N - 1);

    return {
      americanPrice,
      europeanPrice,
      earlyExercisePremium: Math.max(0, americanPrice - europeanPrice),
      standardError: Math.sqrt(variance / N),
    };
  }
}
