/**
 * Heston & Nandi (2000) GARCH Option Pricer and Greeks Engine.
 * Evaluates European calls, puts, risk-neutral probabilities, delta, and gamma.
 * Strictly < 150 LOC, zero `:any` types.
 */

import {
  HestonNandiOptionInput,
  HestonNandiOptionResult,
  HestonNandiParameters,
} from './hestonnandi-types';
import { HestonNandiIntegrator } from './hestonnandi-integrator';

export class HestonNandiEngine {
  /**
   * Computes unconditional long-run variance under physical measure:
   * Var[h] = (omega + alpha) / (1 - beta - alpha * gamma^2)
   */
  public calculateUnconditionalVariance(params: HestonNandiParameters): {
    variance: number;
    stationary: boolean;
  } {
    const persistence = params.beta + params.alpha * params.gamma * params.gamma;
    const stationary = persistence < 1.0;
    const variance = stationary
      ? (params.omega + params.alpha) / (1.0 - persistence)
      : params.omega + params.alpha;
    return { variance, stationary };
  }

  /**
   * Prices European options via Heston-Nandi closed-form inversion formula:
   * Call = S * P1 - K * exp(-r * tau) * P2
   * Put = Call - S + K * exp(-r * tau)  (Put-Call Parity)
   */
  public priceOption(input: HestonNandiOptionInput): HestonNandiOptionResult {
    const { spotPrice, strikePrice, daysToExpiration, parameters } = input;
    const { variance: longRunVar, stationary } =
      this.calculateUnconditionalVariance(parameters);
    const hNext = input.initialVariance ?? longRunVar;

    const p1 = HestonNandiIntegrator.computeProbability(
      1,
      spotPrice,
      strikePrice,
      hNext,
      daysToExpiration,
      parameters
    );
    const p2 = HestonNandiIntegrator.computeProbability(
      2,
      spotPrice,
      strikePrice,
      hNext,
      daysToExpiration,
      parameters
    );

    const discount = Math.exp(-parameters.riskFreeRate * daysToExpiration);
    const callPrice = Math.max(0.0, spotPrice * p1 - strikePrice * discount * p2);
    const putPrice = Math.max(0.0, callPrice - spotPrice + strikePrice * discount);

    // Finite difference Greeks for verification
    const dS = spotPrice * 0.005;
    const p1Up = HestonNandiIntegrator.computeProbability(
      1,
      spotPrice + dS,
      strikePrice,
      hNext,
      daysToExpiration,
      parameters
    );
    const p2Up = HestonNandiIntegrator.computeProbability(
      2,
      spotPrice + dS,
      strikePrice,
      hNext,
      daysToExpiration,
      parameters
    );
    const callUp = Math.max(0.0, (spotPrice + dS) * p1Up - strikePrice * discount * p2Up);

    const p1Down = HestonNandiIntegrator.computeProbability(
      1,
      spotPrice - dS,
      strikePrice,
      hNext,
      daysToExpiration,
      parameters
    );
    const p2Down = HestonNandiIntegrator.computeProbability(
      2,
      spotPrice - dS,
      strikePrice,
      hNext,
      daysToExpiration,
      parameters
    );
    const callDown = Math.max(0.0, (spotPrice - dS) * p1Down - strikePrice * discount * p2Down);

    const deltaCall = (callUp - callDown) / (2 * dS);
    const gammaCall = (callUp - 2 * callPrice + callDown) / (dS * dS);

    return {
      spotPrice,
      strikePrice,
      daysToExpiration,
      callPrice: Math.round(callPrice * 10000) / 10000,
      putPrice: Math.round(putPrice * 10000) / 10000,
      p1Prob: Math.round(p1 * 10000) / 10000,
      p2Prob: Math.round(p2 * 10000) / 10000,
      unconditionalVariance: longRunVar,
      stationary,
      deltaCall: Math.round(deltaCall * 10000) / 10000,
      gammaCall: Math.round(gammaCall * 100000) / 100000,
    };
  }
}
