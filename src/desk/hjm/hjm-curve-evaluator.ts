import {
  HjmBondOptionSpec,
  HjmForwardPoint,
  HjmSimulationConfig,
  HjmSimulationTrajectory,
} from './hjm-types';

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

  public static priceBondOptionMonteCarlo(
    spec: HjmBondOptionSpec,
    simulations: number,
    simulateFn: (config: HjmSimulationConfig) => HjmSimulationTrajectory
  ): { optionPrice: number; standardError: number; expectedBondPrice: number } {
    if (spec.bondMaturityYears <= spec.optionExpiryYears) {
      throw new Error('Bond maturity must exceed option expiry');
    }

    const dt = 0.05;
    const tenorMaturities: number[] = [];
    for (let tau = 0.1; tau <= spec.bondMaturityYears + 0.5; tau += 0.2) {
      tenorMaturities.push(Number(tau.toFixed(2)));
    }
    if (!tenorMaturities.includes(spec.bondMaturityYears)) {
      tenorMaturities.push(spec.bondMaturityYears);
    }
    tenorMaturities.sort((a, b) => a - b);

    const config: HjmSimulationConfig = {
      timeHorizonYears: spec.optionExpiryYears,
      dt,
      tenorMaturities,
      numSimulations: simulations,
    };

    let payoffSum = 0.0;
    let payoffSqSum = 0.0;
    let bondPriceSum = 0.0;
    const faceValue = spec.faceValue ?? 100.0;

    for (let sim = 0; sim < simulations; sim++) {
      const traj = simulateFn(config);

      let moneyMarketDiscount = 0.0;
      for (let i = 0; i < traj.shortRates.length - 1; i++) {
        moneyMarketDiscount += traj.shortRates[i]! * dt;
      }
      const discountFactor = Math.exp(-moneyMarketDiscount);

      const zcbAtExpiry = HjmCurveEvaluator.computeZeroCouponBondPrice(
        traj.finalYieldCurve.maturities,
        traj.finalYieldCurve.forwardRates,
        spec.optionExpiryYears,
        spec.bondMaturityYears
      );
      const underlyingBondValue = zcbAtExpiry * faceValue;
      bondPriceSum += underlyingBondValue;

      const payoff = spec.isCall
        ? Math.max(0, underlyingBondValue - spec.strikePrice)
        : Math.max(0, spec.strikePrice - underlyingBondValue);

      const discountedPayoff = payoff * discountFactor;
      payoffSum += discountedPayoff;
      payoffSqSum += discountedPayoff * discountedPayoff;
    }

    const optionPrice = payoffSum / simulations;
    const variance = payoffSqSum / simulations - optionPrice * optionPrice;
    const standardError = Math.sqrt(Math.max(0, variance) / simulations);
    const expectedBondPrice = bondPriceSum / simulations;

    return { optionPrice, standardError, expectedBondPrice };
  }
}
