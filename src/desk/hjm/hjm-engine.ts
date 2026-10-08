import { HjmCurveEvaluator } from './hjm-curve-evaluator';
import {
  HjmBondOptionSpec,
  HjmForwardPoint,
  HjmSimulationConfig,
  HjmSimulationTrajectory,
  HjmVolatilityFactor,
  HjmYieldCurveState,
} from './hjm-types';

export class HjmEngine {
  public calculateNoArbitrageDrift(
    factors: HjmVolatilityFactor[],
    t: number,
    T: number
  ): number {
    if (T <= t) return 0.0;
    let totalDrift = 0.0;
    for (const factor of factors) {
      totalDrift += factor.integrateDriftComponent(t, T);
    }
    return totalDrift;
  }

  public interpolateInitialForwardRate(
    initialCurve: HjmForwardPoint[],
    T: number
  ): number {
    return HjmCurveEvaluator.interpolateInitialForwardRate(initialCurve, T);
  }

  public computeZeroCouponBondPrice(
    maturities: number[],
    forwardRates: number[],
    t: number,
    T: number
  ): number {
    return HjmCurveEvaluator.computeZeroCouponBondPrice(
      maturities,
      forwardRates,
      t,
      T
    );
  }

  public simulateTrajectory(
    initialCurve: HjmForwardPoint[],
    factors: HjmVolatilityFactor[],
    config: HjmSimulationConfig
  ): HjmSimulationTrajectory {
    if (config.dt <= 0 || config.timeHorizonYears <= 0) {
      throw new Error('dt and timeHorizonYears must be positive');
    }

    const maturities = [...config.tenorMaturities].sort((a, b) => a - b);
    let currentForwardRates = maturities.map((T) =>
      this.interpolateInitialForwardRate(initialCurve, T)
    );

    const steps = Math.round(config.timeHorizonYears / config.dt);
    const timestamps: number[] = [0];
    const shortRates: number[] = [currentForwardRates[0]!];

    let t = 0.0;
    const sqrtDt = Math.sqrt(config.dt);

    for (let s = 0; s < steps; s++) {
      t += config.dt;
      const nextForwardRates: number[] = [];

      // Generate independent standard normal random variates for each factor
      const zScores = factors.map(() => {
        const u1 = Math.max(1e-12, Math.random());
        const u2 = Math.random();
        return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      });

      for (let i = 0; i < maturities.length; i++) {
        const T = maturities[i]!;
        if (T < t) {
          nextForwardRates.push(currentForwardRates[i]!);
          continue;
        }

        const drift = this.calculateNoArbitrageDrift(factors, t - config.dt, T);
        let diffusion = 0.0;
        for (let k = 0; k < factors.length; k++) {
          const sig = factors[k]!.evaluate(t - config.dt, T);
          diffusion += sig * zScores[k]! * sqrtDt;
        }

        const newF = currentForwardRates[i]! + drift * config.dt + diffusion;
        nextForwardRates.push(newF);
      }

      currentForwardRates = nextForwardRates;
      timestamps.push(Number(t.toFixed(4)));

      // Instantaneous short rate r(t) is forward rate for closest tenor to t
      const currentShortRate = currentForwardRates.find(
        (_, idx) => maturities[idx]! >= t
      ) ?? currentForwardRates[currentForwardRates.length - 1]!;
      shortRates.push(currentShortRate);
    }

    const finalZcbPrices = maturities.map((T) =>
      this.computeZeroCouponBondPrice(maturities, currentForwardRates, t, T)
    );

    const finalYieldCurve: HjmYieldCurveState = {
      timeYears: t,
      maturities,
      forwardRates: currentForwardRates,
      zeroCouponBondPrices: finalZcbPrices,
    };

    return { timestamps, shortRates, finalYieldCurve };
  }

  public priceBondOptionMonteCarlo(
    initialCurve: HjmForwardPoint[],
    factors: HjmVolatilityFactor[],
    spec: HjmBondOptionSpec,
    simulations: number = 200
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
      const traj = this.simulateTrajectory(initialCurve, factors, config);

      // Discount factor along path: exp(-sum r(t) dt)
      let moneyMarketDiscount = 0.0;
      for (let i = 0; i < traj.shortRates.length - 1; i++) {
        moneyMarketDiscount += traj.shortRates[i]! * dt;
      }
      const discountFactor = Math.exp(-moneyMarketDiscount);

      const zcbAtExpiry = this.computeZeroCouponBondPrice(
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
    const variance = (payoffSqSum / simulations - optionPrice * optionPrice);
    const standardError = Math.sqrt(Math.max(0, variance) / simulations);
    const expectedBondPrice = bondPriceSum / simulations;

    return { optionPrice, standardError, expectedBondPrice };
  }
}
