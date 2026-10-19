export type CreditRating = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'D';

export interface JltBondParams {
  rating: CreditRating;
  maturity: number; // in years (e.g., 1, 2, 5)
  recoveryRate: number; // e.g. 0.40 for senior unsecured
  riskFreeRate: number; // continuous annual risk-free rate, e.g. 0.04
}

export interface JltPricingResult {
  rating: CreditRating;
  maturity: number;
  riskFreeZeroPrice: number;
  defaultableZeroPrice: number;
  cumulativeDefaultProbP: number; // under physical measure P
  cumulativeDefaultProbQ: number; // under risk-neutral measure Q
  creditSpreadBps: number; // in basis points
  hazardRate: number; // annualized implied hazard rate
}

export interface JltTransitionMatrix {
  ratings: CreditRating[];
  matrix: number[][]; // N x N row-stochastic matrix
}
