export type AmericanOptionType = 'CALL' | 'PUT';

export interface BawOptionParameters {
  readonly spotPrice: number;
  readonly strikePrice: number;
  readonly timeToExpiryYears: number;
  readonly riskFreeRatePct: number;
  readonly continuousDividendYieldPct: number; // q in %
  readonly volatilityPct: number;              // sigma in %
  readonly optionType: AmericanOptionType;
}

export interface BawOptionResult {
  readonly americanPrice: number;
  readonly europeanPrice: number;
  readonly earlyExercisePremium: number;
  readonly criticalSpotPrice: number; // S*
  readonly qExponent: number;         // q1 or q2
  readonly iterations: number;
}
