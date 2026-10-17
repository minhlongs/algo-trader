/**
 * Carr-Madan (1998) Static Replication & Barrier Reflection Types
 *
 * References:
 * - Carr, P., & Madan, D. (1998). Towards a Theory of Volatility Trading.
 * - Carr, P., Ellis, K., & Gupta, V. (1998). Static Hedging of Exotic Options.
 *   Journal of Finance, 53(3), 1165-1190.
 *
 * @module desk/carrmadan/carr-madan-static-types
 */

export interface CarrMadanMarketParams {
  spot: number;
  rate: number;
  dividendYield: number;
  volatility: number;
  timeToMaturity: number;
}

export type OptionType = 'call' | 'put';

export type BarrierType =
  | 'down-and-out-call'
  | 'up-and-out-put'
  | 'down-and-out-put'
  | 'up-and-out-call';

export interface PayoffSpecification {
  f: (s: number) => number;
  fPrime: (s: number) => number;
  fDoublePrime: (s: number) => number;
}

export interface OptionSlice {
  strike: number;
  type: OptionType;
  weight: number;
  price: number;
  contribution: number;
}

export interface StaticSpanningInput {
  referencePrice: number;
  strikes: number[];
  payoff: PayoffSpecification;
  market: CarrMadanMarketParams;
  regularizationLambda?: number;
}

export interface StaticSpanningResult {
  replicatedPrice: number;
  referencePrice: number;
  bondWeight: number;
  underlyingWeight: number;
  bondContribution: number;
  underlyingContribution: number;
  integralPutsValue: number;
  integralCallsValue: number;
  optionSlices: OptionSlice[];
  targetPayoffPrice: number;
  discretizationError: number;
}

export interface BarrierReflectionInput {
  barrier: number;
  strike: number;
  barrierType: BarrierType;
  market: CarrMadanMarketParams;
}

export interface BarrierReflectionResult {
  barrierType: BarrierType;
  barrier: number;
  strike: number;
  reflectedStrike: number;
  weightMultiplier: number;
  powerMultiplier: number;
  vanillaOption: {
    type: OptionType;
    strike: number;
    price: number;
  };
  reflectedOption: {
    type: OptionType;
    strike: number;
    price: number;
  };
  replicatedPrice: number;
  boundaryErrorAtBarrier: number;
  paritySatisfied: boolean;
}
