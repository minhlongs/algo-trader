export type CreditRating =
  | 'AAA'
  | 'AA'
  | 'A'
  | 'BBB'
  | 'BB'
  | 'B'
  | 'CCC'
  | 'D';

export interface LandoParams {
  generatorMatrix: number[][]; // 8x8 generator matrix Q
  tenors: number[];           // Horizon in years, e.g. [1, 3, 5, 10]
  recoveryRate: number;       // Expected recovery, e.g. 0.40
  initialRating: CreditRating;
}

export interface RatingTenorMetric {
  tenor: number;
  survivalProbability: number;
  defaultProbability: number;
  creditSpreadBps: number;
  downgradeProbability: number;
  upgradeProbability: number;
}

export interface TransitionProbabilityMatrix {
  tenor: number;
  matrix: number[][];
}

export interface LandoResult {
  initialRating: CreditRating;
  ratingIndex: number;
  recoveryRate: number;
  transitionMatrices: TransitionProbabilityMatrix[];
  curve: RatingTenorMetric[];
  benchmark5YSpreadBps: number;
}
