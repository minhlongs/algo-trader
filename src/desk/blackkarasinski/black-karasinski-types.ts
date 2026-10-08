export interface BkYieldPoint {
  readonly maturityYears: number;
  readonly discountFactor: number;
}

export interface BkModelParameters {
  readonly meanReversionSpeed: number; // a >= 0
  readonly shortRateVolatility: number; // sigma > 0
}

export interface BkCalibrationConfig {
  readonly steps: number;
  readonly timeHorizonYears: number;
}

export interface BkTrinomialNode {
  readonly j: number; // state index
  readonly rate: number; // r = exp(x)
  readonly discountFactor: number; // exp(-r * dt)
  readonly pu: number; // up transition probability
  readonly pm: number; // middle transition probability
  readonly pd: number; // down transition probability
}

export interface BkCalibrationResult {
  readonly steps: number;
  readonly dt: number;
  readonly dx: number;
  readonly alphas: number[]; // alpha_i drift adjustments
  readonly targetDiscountFactors: number[];
  readonly fittedDiscountFactors: number[];
}

export interface BkZeroCouponBondResult {
  readonly maturityYears: number;
  readonly modelPrice: number;
  readonly yieldPct: number;
}

export interface BkOptionSpec {
  readonly optionExpiryYears: number;
  readonly bondMaturityYears: number;
  readonly strikePrice: number;
  readonly isCall: boolean;
  readonly faceValue?: number;
}

export interface BkOptionResult {
  readonly optionPrice: number;
  readonly underlyingBondPrice: number;
  readonly intrinsicValue: number;
  readonly isCall: boolean;
}
