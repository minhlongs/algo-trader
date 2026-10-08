export type BjerksundOptionType = 'CALL' | 'PUT';

export interface BjerksundParameters {
  readonly spotPrice: number;
  readonly strikePrice: number;
  readonly timeToExpiryYears: number;
  readonly riskFreeRatePct: number;
  readonly continuousDividendYieldPct: number; // q in %
  readonly volatilityPct: number;              // sigma in %
  readonly optionType: BjerksundOptionType;
}

export interface BjerksundResult {
  readonly americanPrice: number;
  readonly europeanPrice: number;
  readonly earlyExercisePremium: number;
  readonly triggerBoundaryI1: number;
  readonly triggerBoundaryI2: number;
  readonly betaExponent: number;
}
