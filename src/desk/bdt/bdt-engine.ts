/**
 * Black-Derman-Toy (1990) Log-Normal Short-Rate Engine
 * Calibrates binomial short-rate lattice and prices bond derivatives via backward induction.
 */

import {
  BDTModelParams,
  BDTTetherLattice,
  EuropeanBDTBondOptionParams,
  BDTBondOptionResult,
} from './bdt-types.js';
import { BDTMath } from './bdt-math.js';

export class BDTEngine {
  public static validateParams(params: BDTModelParams): void {
    if (!params.yieldCurve || params.yieldCurve.length === 0) {
      throw new Error('yieldCurve must have at least one maturity');
    }
    if (!params.volatilities || params.volatilities.length === 0) {
      throw new Error('volatilities must have at least one element');
    }
    for (const y of params.yieldCurve) {
      if (y <= 0) throw new Error('yieldCurve rates must be strictly positive');
    }
    for (const v of params.volatilities) {
      if (v <= 0) throw new Error('volatilities must be strictly positive');
    }
  }

  /**
   * Calibrate the BDT tree to the input zero-coupon yield curve and term structure of volatilities
   */
  public static calibrateLattice(params: BDTModelParams): BDTTetherLattice {
    this.validateParams(params);
    const dt = params.timeStep ?? 1.0;
    const steps = Math.min(params.yieldCurve.length, params.volatilities.length);

    const discountFactors: number[] = params.yieldCurve
      .slice(0, steps)
      .map((y, idx) => Math.exp(-y * (idx + 1) * dt));

    const rates: number[][] = [];

    // Step 0: root node rate r_00 is determined directly by P(0, 1) = 1 / (1 + r00 * dt)
    const r00 = (1.0 / discountFactors[0] - 1.0) / dt;
    rates.push([r00]);

    let currentQ = [1.0];
    let prevRates = [r00];

    // Inductively calibrate step 1 to steps - 1
    for (let step = 1; step < steps; step++) {
      const targetDiscount = discountFactors[step];
      const sigma = params.volatilities[step];
      const { rates: stepRates, nextQ } = BDTMath.solveBaseRate(
        targetDiscount,
        currentQ,
        prevRates,
        sigma,
        dt,
        step
      );

      rates.push(stepRates);
      currentQ = nextQ;
      prevRates = stepRates;
    }

    return { steps, rates, discountFactors };
  }

  /**
   * Price a Zero Coupon Bond maturing at step `maturityStep`
   */
  public static priceZCB(lattice: BDTTetherLattice, maturityStep: number, dt: number = 1.0): number {
    if (maturityStep <= 0 || maturityStep > lattice.steps) {
      throw new Error(`maturityStep must be between 1 and ${lattice.steps}`);
    }

    // At maturityStep, payoff is 1.0 at all states
    let values = new Array(maturityStep + 1).fill(1.0);

    for (let step = maturityStep - 1; step >= 0; step--) {
      const nextValues: number[] = [];
      for (let j = 0; j <= step; j++) {
        const rate = lattice.rates[step][j];
        const val = 0.5 * (values[j] + values[j + 1]) / (1.0 + rate * dt);
        nextValues.push(val);
      }
      values = nextValues;
    }

    return values[0];
  }

  /**
   * Price European Call or Put Option on Zero Coupon Bond via backward induction
   */
  public static priceBondOption(
    lattice: BDTTetherLattice,
    params: EuropeanBDTBondOptionParams,
    dt: number = 1.0
  ): BDTBondOptionResult {
    const { optionMaturityStep: T_opt, bondMaturityStep: T_bnd, strikePrice: K, isCall } = params;

    if (T_opt <= 0 || T_bnd <= T_opt || T_bnd > lattice.steps) {
      throw new Error('Invalid option or bond maturity step');
    }

    // Step 1: Compute bond prices at option maturity across all states j
    let bondValues = new Array(T_bnd + 1).fill(1.0);
    for (let step = T_bnd - 1; step >= T_opt; step--) {
      const nextValues: number[] = [];
      for (let j = 0; j <= step; j++) {
        const rate = lattice.rates[step][j];
        const val = 0.5 * (bondValues[j] + bondValues[j + 1]) / (1.0 + rate * dt);
        nextValues.push(val);
      }
      bondValues = nextValues;
    }

    // Step 2: Option payoff at T_opt
    let optionValues: number[] = [];
    for (let j = 0; j <= T_opt; j++) {
      const bPrice = bondValues[j];
      const payoff = isCall ? Math.max(0, bPrice - K) : Math.max(0, K - bPrice);
      optionValues.push(payoff);
    }

    // Step 3: Roll backward from T_opt to 0
    for (let step = T_opt - 1; step >= 0; step--) {
      const nextValues: number[] = [];
      for (let j = 0; j <= step; j++) {
        const rate = lattice.rates[step][j];
        const val = 0.5 * (optionValues[j] + optionValues[j + 1]) / (1.0 + rate * dt);
        nextValues.push(val);
      }
      optionValues = nextValues;
    }

    const underlyingBondPrice = this.priceZCB(lattice, T_bnd, dt);
    const intrinsicValue = isCall
      ? Math.max(0, underlyingBondPrice - K)
      : Math.max(0, K - underlyingBondPrice);

    return {
      optionPrice: optionValues[0],
      underlyingBondPrice,
      latticeDepth: lattice.steps,
      intrinsicValue,
    };
  }
}
