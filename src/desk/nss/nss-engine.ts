import { NssCurve } from './nss-curve';
import { NssBondPriceResult, NssParameters } from './nss-types';

export class NssEngine {
  public priceCouponBond(
    params: NssParameters,
    couponRatePct: number,
    maturityYears: number,
    frequency = 2,
    parValue = 100.0
  ): NssBondPriceResult {
    if (maturityYears <= 0) throw new Error('Maturity must be positive');
    if (frequency <= 0) throw new Error('Payment frequency must be positive');

    const numPeriods = Math.round(maturityYears * frequency);
    const dt = maturityYears / numPeriods;
    const couponPerPeriod = (parValue * (couponRatePct / 100.0)) / frequency;

    let pv = 0.0;
    let weightedTime = 0.0;
    let convexitySum = 0.0;

    for (let i = 1; i <= numPeriods; i++) {
      const t = i * dt;
      const point = NssCurve.calculatePoint(params, t);
      const cf = i === numPeriods ? couponPerPeriod + parValue : couponPerPeriod;
      const pvCf = cf * point.discountFactor;

      pv += pvCf;
      weightedTime += t * pvCf;
      convexitySum += t * (t + 1.0 / frequency) * pvCf;
    }

    const macaulayDuration = weightedTime / pv;
    const ytmPoint = NssCurve.calculatePoint(params, maturityYears);
    const y = ytmPoint.zeroRatePct / 100.0;
    const modifiedDuration = macaulayDuration / (1.0 + y / frequency);
    const convexity = convexitySum / (pv * Math.pow(1.0 + y / frequency, 2));

    return {
      price: Number(pv.toFixed(4)),
      yieldToMaturityPct: Number(ytmPoint.zeroRatePct.toFixed(4)),
      macaulayDurationYears: Number(macaulayDuration.toFixed(4)),
      modifiedDurationYears: Number(modifiedDuration.toFixed(4)),
      convexity: Number(convexity.toFixed(4)),
    };
  }
}
