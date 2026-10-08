export enum OptionType {
  CALL = 'CALL',
  PUT = 'PUT',
}

export interface LsmcParams {
  readonly spotPrice: number;
  readonly strikePrice: number;
  readonly riskFreeRate: number;
  readonly dividendYield: number;
  readonly volatility: number;
  readonly timeToMaturity: number;
  readonly optionType: OptionType;
  readonly numPaths?: number; // default: 10000
  readonly numSteps?: number; // default: 50
  readonly basisTerms?: number; // default: 3 (e.g., L0, L1, L2)
}

export interface LsmcResult {
  readonly americanPrice: number;
  readonly europeanPrice: number; // as benchmark from same simulated paths
  readonly earlyExercisePremium: number;
  readonly standardError: number;
}
