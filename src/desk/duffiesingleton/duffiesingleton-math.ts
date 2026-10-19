/**
 * Duffie-Singleton (1999) Defaultable Term Structure Mathematical Engine
 *
 * Implements Recovery of Market Value (RMV) discount formulations:
 * R = r + h * (1 - delta)
 * V(0, T) = exp(-R * T)
 *
 * @module desk/duffiesingleton/duffiesingleton-math
 */

import type { DefaultableCouponPayment } from './duffiesingleton-types';

export class DuffieSingletonMath {
  /**
   * Computes the default-adjusted effective discount rate R.
   * R = r + h * (1 - delta)
   */
  public static computeEffectiveRate(r: number, h: number, delta: number): number {
    const lgd = 1.0 - delta;
    return r + h * lgd;
  }

  /**
   * Computes risk-free discount factor P_0(T) = exp(-r * T).
   */
  public static computeRiskFreeDiscount(r: number, maturity: number): number {
    if (maturity <= 0) return 1.0;
    return Math.exp(-r * maturity);
  }

  /**
   * Computes the price of a defaultable zero-coupon bond with face value F.
   * V(0, T) = F * exp(-(r + h * (1 - delta)) * T)
   */
  public static computeDefaultableZeroPrice(
    r: number,
    h: number,
    delta: number,
    maturity: number,
    faceValue: number = 100,
  ): number {
    if (maturity <= 0) return faceValue;
    const effectiveRate = this.computeEffectiveRate(r, h, delta);
    return faceValue * Math.exp(-effectiveRate * maturity);
  }

  /**
   * Computes continuous credit spread in decimal (e.g. 0.015 = 150 bps).
   * s = h * (1 - delta)
   */
  public static computeCreditSpread(h: number, delta: number): number {
    return h * (1.0 - delta);
  }

  /**
   * Prices a coupon-bearing defaultable bond with discrete cash flows.
   */
  public static computeCouponBondPrice(
    r: number,
    h: number,
    delta: number,
    coupons: DefaultableCouponPayment[],
    maturity: number,
    faceValue: number = 100,
  ): number {
    const effectiveRate = this.computeEffectiveRate(r, h, delta);
    let price = 0;

    for (const c of coupons) {
      if (c.timeToPayment > 0) {
        price += c.amount * Math.exp(-effectiveRate * c.timeToPayment);
      }
    }

    if (maturity > 0) {
      price += faceValue * Math.exp(-effectiveRate * maturity);
    } else {
      price += faceValue;
    }

    return price;
  }

  /**
   * Calibrates implied hazard rate from observed market credit spread and recovery rate.
   * h = spread / (1 - delta)
   */
  public static calibrateHazardRate(creditSpread: number, delta: number): number {
    const lgd = 1.0 - delta;
    if (lgd <= 0) return 0;
    return creditSpread / lgd;
  }
}
