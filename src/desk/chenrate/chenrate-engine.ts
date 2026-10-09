import { ChenRateParams, ChenRateResult } from './chenrate-types.js';
import { ChenRateMath } from './chenrate-math.js';

export class ChenRateEngine {
  public static validate(params: ChenRateParams, maturity: number): void {
    if (maturity <= 0) throw new Error('Maturity must be positive');
    if (params.rateMeanReversion <= 0) throw new Error('Rate mean reversion must be positive');
    if (params.meanReversionOfMean <= 0) throw new Error('Mean reversion of theta must be positive');
    if (params.meanReversionOfVar <= 0) throw new Error('Mean reversion of sigma must be positive');
    if (params.currentVariance < 0 || params.longTermVar < 0) {
      throw new Error('Variance parameters must be non-negative');
    }
  }

  /**
   * Evaluates term structure dynamics under Chen (1996) 3-factor model at maturity T
   */
  public static evaluateTermStructure(params: ChenRateParams, maturity: number): ChenRateResult {
    this.validate(params, maturity);
    const {
      currentRate: r0,
      currentMean: theta0,
      currentVariance: sigma0,
      rateMeanReversion: k,
      meanReversionOfMean: alpha,
      meanReversionOfVar: beta,
      longTermMean: thetaBar,
      longTermVar: sigmaBar,
    } = params;

    const expectedR = ChenRateMath.expectedRate(r0, theta0, thetaBar, k, alpha, maturity);
    const expectedTheta = ChenRateMath.expectedMean(theta0, thetaBar, alpha, maturity);
    const expectedSigma = ChenRateMath.expectedVariance(sigma0, sigmaBar, beta, maturity);

    // Asymptotic rate as maturity -> infinity
    const asymptoticRate = thetaBar;

    // Approximate integrated yield via Gauss-Legendre or Simpson average
    const midRate = ChenRateMath.expectedRate(r0, theta0, thetaBar, k, alpha, 0.5 * maturity);
    const avgRate = (r0 + 4.0 * midRate + expectedR) / 6.0;

    // Zero bond price P(0, T) = exp(-integral_0^T E[r_s] ds + 0.5 * Var)
    // Convexity adjustment from stochastic variance:
    const varAdj = 0.5 * avgRate * expectedSigma * maturity * maturity * 0.1;
    const zeroBondPrice = Math.exp(-avgRate * maturity + varAdj);
    const zeroYield = -Math.log(Math.max(1e-12, zeroBondPrice)) / maturity;
    const instantaneousForwardRate = expectedR;

    return {
      expectedRate: expectedR,
      expectedMean: expectedTheta,
      expectedVariance: expectedSigma,
      asymptoticRate,
      zeroBondPrice: Math.min(1.0, Math.max(0, zeroBondPrice)),
      zeroYield,
      instantaneousForwardRate,
    };
  }
}
