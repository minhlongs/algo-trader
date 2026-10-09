/**
 * Duffie-Singleton (1999) Defaultable Term Structure Engine
 *
 * Provides analytical evaluation of defaultable yields, spreads, and bond prices.
 *
 * @module desk/duffiesingleton/duffiesingleton-engine
 */

import {
  type DuffieSingletonConfig,
  type DuffieSingletonEstimates,
  type DefaultableCouponPayment,
} from './duffiesingleton-types';
import { DuffieSingletonMath } from './duffiesingleton-math';

export class DuffieSingletonEngine {
  private readonly config: DuffieSingletonConfig;

  constructor(config: DuffieSingletonConfig) {
    this.validateConfig(config);
    this.config = { ...config };
  }

  private validateConfig(cfg: DuffieSingletonConfig): void {
    if (cfg.riskFreeRate < 0) {
      throw new Error(`Risk-free rate cannot be negative: ${cfg.riskFreeRate}`);
    }
    if (cfg.hazardRate < 0) {
      throw new Error(`Hazard rate cannot be negative: ${cfg.hazardRate}`);
    }
    if (cfg.recoveryRate < 0 || cfg.recoveryRate > 1) {
      throw new Error(`Recovery rate must be in [0, 1]: ${cfg.recoveryRate}`);
    }
  }

  /**
   * Generates analytical Duffie-Singleton estimates for a given maturity.
   */
  public evaluate(maturity: number, faceValue: number = 100): DuffieSingletonEstimates {
    if (maturity < 0) {
      throw new Error(`Maturity cannot be negative: ${maturity}`);
    }

    const { riskFreeRate, hazardRate, recoveryRate } = this.config;
    const effectiveRate = DuffieSingletonMath.computeEffectiveRate(riskFreeRate, hazardRate, recoveryRate);
    const lgd = 1.0 - recoveryRate;
    const rfDiscount = DuffieSingletonMath.computeRiskFreeDiscount(riskFreeRate, maturity);
    const defaultableZero = DuffieSingletonMath.computeDefaultableZeroPrice(
      riskFreeRate,
      hazardRate,
      recoveryRate,
      maturity,
      faceValue,
    );
    const spread = DuffieSingletonMath.computeCreditSpread(hazardRate, recoveryRate);
    const survivalProb = Math.exp(-hazardRate * maturity);
    const recoveryComponent = defaultableZero - faceValue * rfDiscount * survivalProb;

    return {
      effectiveDiscountRate: effectiveRate,
      lossGivenDefault: lgd,
      riskFreeDiscount: rfDiscount,
      defaultableZeroPrice: defaultableZero,
      creditSpreadBps: spread * 10000,
      yieldToMaturity: effectiveRate,
      survivalProbability: survivalProb,
      recoveryComponent: Math.max(0, recoveryComponent),
      maturity,
    };
  }

  /**
   * Prices a coupon-bearing bond under Duffie-Singleton RMV.
   */
  public priceCouponBond(
    coupons: DefaultableCouponPayment[],
    maturity: number,
    faceValue: number = 100,
  ): number {
    return DuffieSingletonMath.computeCouponBondPrice(
      this.config.riskFreeRate,
      this.config.hazardRate,
      this.config.recoveryRate,
      coupons,
      maturity,
      faceValue,
    );
  }

  /**
   * Access underlying configuration.
   */
  public getConfig(): Readonly<DuffieSingletonConfig> {
    return this.config;
  }
}
