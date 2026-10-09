export class LelandToftMath {
  public static calculatePowerExponent(r: number, delta: number, sigma: number): number {
    const mu = r - delta - 0.5 * sigma * sigma;
    const discriminant = mu * mu + 2.0 * r * sigma * sigma;
    return (-mu - Math.sqrt(Math.max(1e-12, discriminant))) / (sigma * sigma);
  }

  public static calculateDefaultBoundary(
    coupon: number,
    principal: number,
    r: number,
    taxRate: number,
    x: number
  ): number {
    const effectiveCoupon = (1.0 - taxRate) * (coupon / r);
    const factor = (-x) / (-x + 1.0);
    return Math.max(1e-6, effectiveCoupon * factor);
  }

  public static calculateDefaultDiscountFactor(V: number, VB: number, x: number): number {
    if (V <= VB) return 1.0;
    return Math.min(1.0, Math.pow(V / VB, x));
  }

  public static calculateValuation(
    V: number,
    coupon: number,
    principal: number,
    r: number,
    delta: number,
    sigma: number,
    taxRate: number,
    alpha: number
  ): {
    VB: number;
    pB: number;
    taxShield: number;
    bankruptcyCost: number;
    firmValue: number;
    debtValue: number;
    equityValue: number;
    creditSpreadBps: number;
  } {
    const x = this.calculatePowerExponent(r, delta, sigma);
    const VB = this.calculateDefaultBoundary(coupon, principal, r, taxRate, x);
    const pB = this.calculateDefaultDiscountFactor(V, VB, x);

    const taxShield = taxRate * (coupon / r) * (1.0 - pB);
    const bankruptcyCost = alpha * VB * pB;
    const firmValue = V + taxShield - bankruptcyCost;

    const riskFreeDebt = coupon / r;
    const debtValue = Math.max(1e-6, riskFreeDebt * (1.0 - pB) + (1.0 - alpha) * VB * pB);
    const equityValue = Math.max(0.0, firmValue - debtValue);

    const yieldToMaturity = coupon / debtValue;
    const creditSpreadBps = Math.max(0.0, (yieldToMaturity - r) * 10000.0);

    return {
      VB,
      pB,
      taxShield,
      bankruptcyCost,
      firmValue,
      debtValue,
      equityValue,
      creditSpreadBps,
    };
  }
}
