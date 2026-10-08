export interface BdtYieldPoint {
  readonly maturityYears: number;
  readonly discountFactor: number; // P(0, T)
  readonly rateVolatility: number; // Annualized local volatility sigma
}

export interface BdtTreeParameters {
  readonly steps: number;
  readonly timeHorizonYears: number;
}

export interface BdtCalibrationResult {
  readonly steps: number;
  readonly dt: number;
  readonly baselineRates: number[]; // u_i
  readonly volatilities: number[];   // sigma_i
  readonly discountFactorsTarget: number[];
  readonly discountFactorsFitted: number[];
}

export interface BdtBondOptionSpec {
  readonly strikePriceUsd: number;
  readonly optionExpiryYears: number;
  readonly bondMaturityYears: number;
  readonly faceValueUsd?: number;
  readonly isCall: boolean;
  readonly isBermudan?: boolean;
}

export interface BdtOptionResult {
  readonly optionPriceUsd: number;
  readonly underlyingBondPriceUsd: number;
  readonly forwardBondPriceUsd: number;
  readonly intrinsicValueUsd: number;
}
