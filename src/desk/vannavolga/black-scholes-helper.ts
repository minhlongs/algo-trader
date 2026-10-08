export class BlackScholesHelper {
  public static normalCdf(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const t = 1.0 / (1.0 + (p * Math.abs(x)) / Math.SQRT2);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp((-x * x) / 2.0);
    return 0.5 * (1.0 + sign * y);
  }

  public static normalPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2.0 * Math.PI);
  }

  public static d1(S: number, K: number, r: number, q: number, T: number, vol: number): number {
    return (Math.log(S / K) + (r - q + 0.5 * vol * vol) * T) / (vol * Math.sqrt(T));
  }

  public static d2(S: number, K: number, r: number, q: number, T: number, vol: number): number {
    return this.d1(S, K, r, q, T, vol) - vol * Math.sqrt(T);
  }

  public static vega(S: number, K: number, r: number, q: number, T: number, vol: number): number {
    const d1 = this.d1(S, K, r, q, T, vol);
    return S * Math.exp(-q * T) * Math.sqrt(T) * this.normalPdf(d1);
  }

  public static vanna(S: number, K: number, r: number, q: number, T: number, vol: number): number {
    const vega = this.vega(S, K, r, q, T, vol);
    const d2 = this.d2(S, K, r, q, T, vol);
    // Vanna = dVega/dS = - Vega * (d2 / (S * vol * sqrt(T)))
    return -vega * (d2 / (S * vol * Math.sqrt(T)));
  }

  public static volga(S: number, K: number, r: number, q: number, T: number, vol: number): number {
    const vega = this.vega(S, K, r, q, T, vol);
    const d1 = this.d1(S, K, r, q, T, vol);
    const d2 = this.d2(S, K, r, q, T, vol);
    // Volga = dVega/dVol = Vega * (d1 * d2 / vol)
    return vega * ((d1 * d2) / vol);
  }

  public static priceCall(S: number, K: number, r: number, q: number, T: number, vol: number): number {
    if (T <= 0) return Math.max(0, S - K);
    const d1 = this.d1(S, K, r, q, T, vol);
    const d2 = this.d2(S, K, r, q, T, vol);
    return S * Math.exp(-q * T) * this.normalCdf(d1) - K * Math.exp(-r * T) * this.normalCdf(d2);
  }

  public static pricePut(S: number, K: number, r: number, q: number, T: number, vol: number): number {
    if (T <= 0) return Math.max(0, K - S);
    const d1 = this.d1(S, K, r, q, T, vol);
    const d2 = this.d2(S, K, r, q, T, vol);
    return K * Math.exp(-r * T) * this.normalCdf(-d2) - S * Math.exp(-q * T) * this.normalCdf(-d1);
  }
}
