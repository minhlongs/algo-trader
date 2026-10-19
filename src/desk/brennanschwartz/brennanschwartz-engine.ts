/**
 * Brennan-Schwartz (1979) Two-Factor Rate Engine
 * Coupled short-rate r_t and long-rate l_t stochastic term structure
 */

import {
  BrennanSchwartzParams,
  BrennanSchwartzBondResult,
  BrennanSchwartzSimulationResult,
  BrennanSchwartzSimulationStep,
} from './brennanschwartz-types.js';

export class BrennanSchwartzEngine {
  public static validate(params: BrennanSchwartzParams): void {
    if (params.shortRateVol < 0) throw new Error('shortRateVol must be non-negative');
    if (params.longRateVol < 0) throw new Error('longRateVol must be non-negative');
    if (params.rateCorrelation < -1.0 || params.rateCorrelation > 1.0) {
      throw new Error('rateCorrelation must be between -1.0 and 1.0');
    }
  }

  /**
   * Price Zero-Coupon Bond under Brennan-Schwartz two-factor term structure
   * Uses semi-analytical affine approximation with coupled mean-reversion drift
   */
  public static priceZeroCouponBond(
    params: BrennanSchwartzParams,
    maturity: number
  ): BrennanSchwartzBondResult {
    this.validate(params);
    if (maturity <= 0) throw new Error('maturity must be positive');

    const {
      shortRate: r,
      longRate: l,
      shortRateMeanReversion: kr,
      longRateMeanReversion: kl,
      longRateTarget: lBar,
      shortRateVol: sigR,
      longRateVol: sigL,
      rateCorrelation: rho,
      shortRateRiskPremium = 0,
    } = params;

    const B_r = kr !== 0 ? (1.0 - Math.exp(-kr * maturity)) / kr : maturity;
    const B_l = kl !== 0 ? (1.0 - Math.exp(-kl * maturity)) / kl : maturity;

    // Variance & covariance cross-term integration
    const varR = (sigR * sigR * (1.0 - Math.exp(-2 * kr * maturity))) / (2 * Math.max(0.001, kr));
    const varL = (sigL * sigL * (1.0 - Math.exp(-2 * kl * maturity))) / (2 * Math.max(0.001, kl));
    const covRL = (rho * sigR * sigL * (1.0 - Math.exp(-(kr + kl) * maturity))) / Math.max(0.001, kr + kl);

    const driftAdjustment = (lBar - l) * B_l * 0.5 + shortRateRiskPremium * maturity;
    const convexity = 0.5 * (B_r * B_r * varR + B_l * B_l * varL + 2 * B_r * B_l * covRL);

    const logBond = -(r * B_r + l * (maturity - B_r)) - driftAdjustment + convexity;
    const zeroBondPrice = Math.max(0, Math.exp(logBond));
    const yieldToMaturity = -logBond / maturity;
    const instantaneousForwardRate = r * Math.exp(-kr * maturity) + l * (1 - Math.exp(-kr * maturity));
    const curveSlope = l - r;

    return {
      maturity,
      zeroBondPrice,
      yieldToMaturity,
      instantaneousForwardRate,
      curveSlope,
      convexity,
    };
  }

  /**
   * Euler-Maruyama simulation of coupled SDE:
   * dr_t = (kappa_r * (l_t - r_t) + lambda_r) dt + sigma_r * r_t * dW_1
   * dl_t = kappa_l * (bar{l} - l_t) dt + sigma_l * l_t * dW_2, corr(dW_1, dW_2) = rho
   */
  public static simulate(
    params: BrennanSchwartzParams,
    horizon: number,
    numSteps: number = 100
  ): BrennanSchwartzSimulationResult {
    this.validate(params);
    const dt = horizon / numSteps;
    const sqrtDt = Math.sqrt(dt);

    let currentR = params.shortRate;
    let currentL = params.longRate;

    const steps: BrennanSchwartzSimulationStep[] = [
      { time: 0, shortRate: currentR, longRate: currentL, spread: currentL - currentR },
    ];

    let sumR = currentR;
    let sumL = currentL;

    for (let i = 1; i <= numSteps; i++) {
      const z1 = this.boxMullerGaussian();
      const z2 = this.boxMullerGaussian();
      const w1 = z1;
      const w2 = params.rateCorrelation * z1 + Math.sqrt(Math.max(0, 1 - params.rateCorrelation * params.rateCorrelation)) * z2;

      const dr = (params.shortRateMeanReversion * (currentL - currentR) + (params.shortRateRiskPremium ?? 0)) * dt +
        params.shortRateVol * currentR * sqrtDt * w1;
      const dl = params.longRateMeanReversion * (params.longRateTarget - currentL) * dt +
        params.longRateVol * currentL * sqrtDt * w2;

      currentR = Math.max(0.0001, currentR + dr);
      currentL = Math.max(0.0001, currentL + dl);

      sumR += currentR;
      sumL += currentL;

      steps.push({
        time: i * dt,
        shortRate: currentR,
        longRate: currentL,
        spread: currentL - currentR,
      });
    }

    return {
      steps,
      terminalShortRate: currentR,
      terminalLongRate: currentL,
      terminalSpread: currentL - currentR,
      meanShortRate: sumR / (numSteps + 1),
      meanLongRate: sumL / (numSteps + 1),
    };
  }

  private static boxMullerGaussian(): number {
    let u1 = 0;
    let u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }
}
