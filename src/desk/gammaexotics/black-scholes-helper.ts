export class BlackScholesHelper {
  public static normalCdf(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const t = 1.0 / (1.0 + (p * Math.abs(x)) / Math.SQRT2);
    const y =
      1.0 -
      ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
        t *
        Math.exp((-x * x) / 2.0);
    return 0.5 * (1.0 + sign * y);
  }

  public static price(
    spot: number,
    strike: number,
    rate: number,
    dividend: number,
    vol: number,
    expiry: number,
    isCall: boolean
  ): number {
    if (expiry <= 0 || vol <= 0) {
      const forward = spot * Math.exp((rate - dividend) * expiry);
      return isCall
        ? Math.exp(-rate * expiry) * Math.max(0, forward - strike)
        : Math.exp(-rate * expiry) * Math.max(0, strike - forward);
    }

    const stdDev = vol * Math.sqrt(expiry);
    const d1 =
      (Math.log(spot / strike) + (rate - dividend + 0.5 * vol * vol) * expiry) /
      stdDev;
    const d2 = d1 - stdDev;

    const dfRate = Math.exp(-rate * expiry);
    const dfDiv = Math.exp(-dividend * expiry);

    if (isCall) {
      return spot * dfDiv * this.normalCdf(d1) - strike * dfRate * this.normalCdf(d2);
    }
    return strike * dfRate * this.normalCdf(-d2) - spot * dfDiv * this.normalCdf(-d1);
  }
}
