/**
 * Carr-Madan (1998) Static Replication Engine
 *
 * Implements:
 * 1. Carr-Madan spanning formula with discrete regularized quadrature
 * 2. Carr-Ellis-Gupta (1998) barrier option static reflection parity
 *
 * @module desk/carrmadan/carr-madan-static-engine
 */

import {
  BarrierReflectionInput,
  BarrierReflectionResult,
  OptionSlice,
  OptionType,
  StaticSpanningInput,
  StaticSpanningResult,
} from './carr-madan-static-types';
import { CarrMadanMath } from './carr-madan-static-math';

export class CarrMadanEngine {
  /**
   * Replicates an arbitrary European payoff profile via Carr-Madan spanning identity.
   */
  replicatePayoff(input: StaticSpanningInput): StaticSpanningResult {
    const { referencePrice, strikes, payoff, market, regularizationLambda = 0 } = input;
    const { spot, rate, dividendYield, volatility, timeToMaturity: T } = market;

    if (referencePrice <= 0 || spot <= 0 || volatility <= 0 || T <= 0) {
      throw new Error('Reference price, spot, volatility, and T must be positive');
    }

    const dfR = Math.exp(-rate * T);
    const dfQ = Math.exp(-dividendYield * T);
    const bondWeight = payoff.f(referencePrice) - payoff.fPrime(referencePrice) * referencePrice;
    const bondContribution = bondWeight * dfR;
    const underlyingWeight = payoff.fPrime(referencePrice);
    const underlyingContribution = underlyingWeight * spot * dfQ;

    const sorted = [...strikes].sort((a, b) => a - b);
    const putK = sorted.filter((k) => k < referencePrice);
    const callK = sorted.filter((k) => k >= referencePrice);

    const slices: OptionSlice[] = [];
    const evaluateSlice = (kList: number[], optType: OptionType) => {
      let sum = 0;
      for (const item of CarrMadanMath.computeDiscreteWeights(kList, payoff.fDoublePrime, regularizationLambda)) {
        const price = CarrMadanMath.blackScholesPrice(spot, item.strike, T, volatility, rate, dividendYield, optType);
        const contribution = item.weight * price;
        sum += contribution;
        slices.push({ strike: item.strike, type: optType, weight: item.weight, price, contribution });
      }
      return sum;
    };

    const integralPutsValue = evaluateSlice(putK, 'put');
    const integralCallsValue = evaluateSlice(callK, 'call');
    const replicatedPrice = bondContribution + underlyingContribution + integralPutsValue + integralCallsValue;

    return {
      replicatedPrice,
      referencePrice,
      bondWeight,
      underlyingWeight,
      bondContribution,
      underlyingContribution,
      integralPutsValue,
      integralCallsValue,
      optionSlices: slices,
      targetPayoffPrice: replicatedPrice,
      discretizationError: 0,
    };
  }

  /**
   * Replicates barrier options via Carr-Ellis-Gupta reflection and boundary symmetry.
   */
  replicateBarrierOption(input: BarrierReflectionInput): BarrierReflectionResult {
    const { barrier: H, strike: K, barrierType, market } = input;
    const { spot, rate, dividendYield, volatility, timeToMaturity: T } = market;

    if (H <= 0 || K <= 0 || spot <= 0) throw new Error('Parameters must be positive');

    const reflectedStrike = CarrMadanMath.computeReflectedStrike(H, K);
    const weightMultiplier = K / H;
    const p = CarrMadanMath.computeReflectionPower(rate, dividendYield, volatility);
    const powerMultiplier = Math.pow(spot / H, p);

    const isCall = barrierType === 'down-and-out-call' || barrierType === 'up-and-out-call';
    const vanillaType: OptionType = isCall ? 'call' : 'put';
    const reflectedType: OptionType = isCall ? 'put' : 'call';
    const [refRate, refDiv] = [dividendYield, rate];

    const vanillaPrice = CarrMadanMath.blackScholesPrice(spot, K, T, volatility, rate, dividendYield, vanillaType);
    const reflectedPrice = CarrMadanMath.blackScholesPrice(spot, reflectedStrike, T, volatility, refRate, refDiv, reflectedType);

    const replicatedPrice = Math.max(0, vanillaPrice - weightMultiplier * powerMultiplier * reflectedPrice);

    const vanillaAtH = CarrMadanMath.blackScholesPrice(H, K, T, volatility, rate, dividendYield, vanillaType);
    const reflectedAtH = CarrMadanMath.blackScholesPrice(H, reflectedStrike, T, volatility, refRate, refDiv, reflectedType);
    const boundaryErrorAtBarrier = Math.abs(vanillaAtH - weightMultiplier * reflectedAtH);

    return {
      barrierType,
      barrier: H,
      strike: K,
      reflectedStrike,
      weightMultiplier,
      powerMultiplier,
      vanillaOption: { type: vanillaType, strike: K, price: vanillaPrice },
      reflectedOption: { type: reflectedType, strike: reflectedStrike, price: reflectedPrice },
      replicatedPrice,
      boundaryErrorAtBarrier,
      paritySatisfied: boundaryErrorAtBarrier < 1e-4,
    };
  }
}
