/**
 * Derman-Kani Analytical Black-Scholes Helper
 *
 * Provides benchmark European option prices, implied vols, and cumulative normal CDF
 * for forward induction calibration of the Derman-Kani tree.
 *
 * @module desk/dermankani/derman-kani-black-scholes
 */

/** Standard normal cumulative distribution function approximation */
export function normalCdf(x: number): number {
  if (x === 0) return 0.5;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * absX);
  const erf = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1.0 + sign * erf);
}

/** Standard normal probability density function */
export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Black-Scholes European call/put price */
export function blackScholesPrice(
  spot: number,
  strike: number,
  timeToMaturity: number,
  rate: number,
  dividendYield: number,
  vol: number,
  optionType: 'call' | 'put',
): number {
  if (timeToMaturity <= 0) {
    return optionType === 'call' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  }
  if (vol <= 0) {
    const fwd = spot * Math.exp((rate - dividendYield) * timeToMaturity);
    const disc = Math.exp(-rate * timeToMaturity);
    return optionType === 'call' ? Math.max(0, (fwd - strike) * disc) : Math.max(0, (strike - fwd) * disc);
  }

  const d1 =
    (Math.log(spot / strike) + (rate - dividendYield + 0.5 * vol * vol) * timeToMaturity) /
    (vol * Math.sqrt(timeToMaturity));
  const d2 = d1 - vol * Math.sqrt(timeToMaturity);

  const dfS = spot * Math.exp(-dividendYield * timeToMaturity);
  const dfK = strike * Math.exp(-rate * timeToMaturity);

  if (optionType === 'call') {
    return dfS * normalCdf(d1) - dfK * normalCdf(d2);
  } else {
    return dfK * normalCdf(-d2) - dfS * normalCdf(-d1);
  }
}
