export interface ComplexNumber {
  re: number;
  im: number;
}

export interface CgmyParams {
  spotPrice: number;
  strikePrice: number;
  timeToMaturity: number;
  riskFreeRate: number;
  dividendYield: number;
  c: number;
  g: number;
  m: number;
  y: number;
  isCall: boolean;
}

export interface CgmyMoments {
  mean: number;
  variance: number;
  skewness: number;
  kurtosis: number;
}

export interface CgmyResult {
  price: number;
  martingaleCorrection: number;
  variance: number;
  skewness: number;
  kurtosis: number;
}
