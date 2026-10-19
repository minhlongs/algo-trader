import {
  HestonNandiParams,
  HestonNandiResult,
} from './heston-nandi-types';
import { HestonNandiMath } from './heston-nandi-math';

export class HestonNandiEngine {
  public static evaluate(params: HestonNandiParams): HestonNandiResult {
    this.validate(params);

    const {
      spotPrice,
      strikePrice,
      timeToMaturityDays,
      dailyRiskFreeRate,
      omega,
      alpha,
      beta,
      gamma,
      lambda = 0.0,
      quadratureSteps = 120,
    } = params;

    // Stationary variance: h_stat = (omega + alpha) / (1 - beta - alpha * gamma^2)
    // with restriction: beta + alpha * gamma^2 < 1
    const persistence = beta + alpha * gamma * gamma;
    const stationaryVariance =
      persistence < 1.0 ? (omega + alpha) / (1.0 - persistence) : omega;

    const initialVariance =
      params.initialVariance && params.initialVariance > 0
        ? params.initialVariance
        : stationaryVariance;

    const { callPrice, putPrice } = HestonNandiMath.calculateOptionPrice(
      spotPrice,
      strikePrice,
      timeToMaturityDays,
      dailyRiskFreeRate,
      omega,
      alpha,
      beta,
      gamma,
      initialVariance,
      lambda,
      quadratureSteps
    );

    const df = Math.exp(-timeToMaturityDays * dailyRiskFreeRate);
    const putCallParityError = Math.abs(callPrice - putPrice - (spotPrice - strikePrice * df));

    return {
      spotPrice,
      strikePrice,
      timeToMaturityDays,
      callPrice,
      putPrice,
      stationaryVariance,
      initialVariance,
      putCallParityError,
    };
  }

  private static validate(params: HestonNandiParams): void {
    if (params.spotPrice <= 0) {
      throw new Error(`Spot price must be positive, got ${params.spotPrice}`);
    }
    if (params.strikePrice <= 0) {
      throw new Error(`Strike price must be positive, got ${params.strikePrice}`);
    }
    if (params.timeToMaturityDays <= 0 || !Number.isInteger(params.timeToMaturityDays)) {
      throw new Error(
        `Time to maturity days must be a positive integer, got ${params.timeToMaturityDays}`
      );
    }
    if (params.omega <= 0) {
      throw new Error(`GARCH omega must be positive, got ${params.omega}`);
    }
    if (params.alpha < 0) {
      throw new Error(`GARCH alpha cannot be negative, got ${params.alpha}`);
    }
    if (params.beta < 0 || params.beta >= 1.0) {
      throw new Error(`GARCH beta must be in [0, 1), got ${params.beta}`);
    }
    const persistence = params.beta + params.alpha * params.gamma * params.gamma;
    if (persistence >= 1.0) {
      throw new Error(
        `GARCH persistence beta + alpha*gamma^2 must be < 1 for stationarity, got ${persistence}`
      );
    }
  }
}
