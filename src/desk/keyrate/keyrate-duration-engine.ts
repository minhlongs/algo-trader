import { BenchmarkMaturity, BondCashFlow, KeyRateDurationResult } from './keyrate-types';

export class KeyRateDurationEngine {
  public static readonly DEFAULT_KEY_TENORS: BenchmarkMaturity[] = [
    { tenorYears: 2.0, label: '2Y' },
    { tenorYears: 5.0, label: '5Y' },
    { tenorYears: 10.0, label: '10Y' },
    { tenorYears: 30.0, label: '30Y' },
  ];

  public computeKrd(
    cashFlows: BondCashFlow[],
    yieldPct: number,
    keyTenors: BenchmarkMaturity[] = KeyRateDurationEngine.DEFAULT_KEY_TENORS,
    shiftBps = 1.0
  ): KeyRateDurationResult[] {
    const y0 = yieldPct / 100.0;
    const dy = shiftBps / 10000.0;
    const pv0 = this.discountCashFlows(cashFlows, y0);

    if (pv0 <= 0) {
      throw new Error('Present value must be positive');
    }

    return keyTenors.map((key, idx) => {
      const prevTenor = idx > 0 ? keyTenors[idx - 1]!.tenorYears : 0;
      const currTenor = key.tenorYears;
      const nextTenor = idx < keyTenors.length - 1 ? keyTenors[idx + 1]!.tenorYears : currTenor * 1.5;

      const pvUp = this.discountWithShift(cashFlows, y0, dy, prevTenor, currTenor, nextTenor);
      const pvDown = this.discountWithShift(cashFlows, y0, -dy, prevTenor, currTenor, nextTenor);

      // KRD = -(P_up - P_down) / (2 * P_0 * dy)
      const krd = -(pvUp - pvDown) / (2.0 * pv0 * dy);
      const dv01 = (pv0 * krd * 0.0001);

      return {
        tenorYears: currTenor,
        keyRateDurationYears: Number(krd.toFixed(4)),
        dv01Usd: Number(dv01.toFixed(2)),
      };
    });
  }

  private discountCashFlows(cashFlows: BondCashFlow[], y: number): number {
    return cashFlows.reduce((acc, cf) => acc + cf.cashFlowUsd / Math.pow(1.0 + y, cf.timeYears), 0);
  }

  private discountWithShift(
    cashFlows: BondCashFlow[],
    y0: number,
    dy: number,
    tLeft: number,
    tMid: number,
    tRight: number
  ): number {
    let pv = 0;
    for (const cf of cashFlows) {
      const t = cf.timeYears;
      let weight = 0;

      // Triangular tent weighting function
      if (t >= tLeft && t <= tMid && tMid > tLeft) {
        weight = (t - tLeft) / (tMid - tLeft);
      } else if (t > tMid && t <= tRight && tRight > tMid) {
        weight = (tRight - t) / (tRight - tMid);
      }

      const shiftedY = y0 + dy * weight;
      pv += cf.cashFlowUsd / Math.pow(1.0 + shiftedY, t);
    }
    return pv;
  }
}
