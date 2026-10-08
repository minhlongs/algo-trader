import { HjmForwardPoint } from './hjm-types';

export class HjmCurveEvaluator {
  public static interpolateInitialForwardRate(
    initialCurve: HjmForwardPoint[],
    T: number
  ): number {
    if (initialCurve.length === 0) {
      throw new Error('Initial curve cannot be empty');
    }
    if (T <= initialCurve[0]!.tenorYears) {
      return initialCurve[0]!.instantaneousForwardRate;
    }
    const last = initialCurve[initialCurve.length - 1]!;
    if (T >= last.tenorYears) {
      return last.instantaneousForwardRate;
    }

    for (let i = 0; i < initialCurve.length - 1; i++) {
      const p1 = initialCurve[i]!;
      const p2 = initialCurve[i + 1]!;
      if (T >= p1.tenorYears && T <= p2.tenorYears) {
        const weight = (T - p1.tenorYears) / (p2.tenorYears - p1.tenorYears);
        return (
          p1.instantaneousForwardRate +
          weight * (p2.instantaneousForwardRate - p1.instantaneousForwardRate)
        );
      }
    }
    return last.instantaneousForwardRate;
  }

  public static computeZeroCouponBondPrice(
    maturities: number[],
    forwardRates: number[],
    t: number,
    T: number
  ): number {
    if (T <= t) return 1.0;
    let integral = 0.0;
    const n = maturities.length;

    for (let i = 0; i < n - 1; i++) {
      const u1 = maturities[i]!;
      const u2 = maturities[i + 1]!;
      if (u2 <= t || u1 >= T) continue;

      const left = Math.max(t, u1);
      const right = Math.min(T, u2);
      const du = right - left;
      const fMid = 0.5 * (forwardRates[i]! + forwardRates[i + 1]!);
      integral += fMid * du;
    }

    return Math.exp(-integral);
  }
}
