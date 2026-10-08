/**
 * Exotic Derivatives & Structured Products Types
 * Analytical barrier option contracts, autocallable reverse convertible notes, and cliquet payoff accumulators.
 *
 * @module desk/structured/structured-types
 */

export interface BarrierOptionParameters {
  spotPrice: number;
  strikePrice: number;
  barrierLevel: number;
  rebate: number;
  timeToExpiryYears: number;
  riskFreeRate: number;
  volatilitySigma: number;
  barrierType: 'DOWN_AND_OUT_CALL' | 'UP_AND_OUT_CALL' | 'DOWN_AND_IN_CALL' | 'UP_AND_IN_CALL';
}

export interface BarrierOptionPriceResult {
  optionPrice: number;
  vanillaOptionPrice: number;
  barrierHitProbability: number;
  delta: number;
  gamma: number;
}

export interface AutocallableObservationSchedule {
  observationMonth: number;
  autocallBarrierPct: number; // e.g. 1.00 for 100% of initial strike
  couponRatePct: number; // e.g. 0.08 for 8% annualized coupon
}

export interface BasketAsset {
  symbol: string;
  initialSpotPrice: number;
  currentSpotPrice: number;
}

export interface AutocallableNoteResult {
  isAutocalled: boolean;
  autocallTriggerMonth: number | null;
  totalCouponPaidPct: number;
  capitalRedemptionPct: number;
  worstPerformingAsset: string;
  worstPerformanceRatio: number;
}

export interface CliquetParameters {
  notionalUsd: number;
  localCapPct: number; // e.g. 0.05 for 5% max return per period
  localFloorPct: number; // e.g. -0.02 for -2% max loss per period
  globalFloorPct: number; // e.g. 0.00 for guaranteed principal return
  periodReturnsPct: number[]; // Periodic underlying returns
}

export interface CliquetPayoffResult {
  cappedFlooredPeriodReturns: number[];
  sumCappedReturnsPct: number;
  effectivePayoffPct: number;
  totalPayoutUsd: number;
}
