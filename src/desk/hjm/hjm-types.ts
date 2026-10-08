export interface HjmVolatilityFactor {
  readonly factorName: string;
  // sigma_k(t, T): volatility structure
  readonly evaluate: (t: number, T: number) => number;
  readonly integrateDriftComponent: (t: number, T: number) => number;
}

export interface HjmForwardPoint {
  readonly tenorYears: number;
  readonly instantaneousForwardRate: number;
}

export interface HjmSimulationConfig {
  readonly timeHorizonYears: number;
  readonly dt: number;
  readonly tenorMaturities: number[];
  readonly numSimulations: number;
}

export interface HjmYieldCurveState {
  readonly timeYears: number;
  readonly maturities: number[];
  readonly forwardRates: number[];
  readonly zeroCouponBondPrices: number[];
}

export interface HjmSimulationTrajectory {
  readonly timestamps: number[];
  readonly shortRates: number[];
  readonly finalYieldCurve: HjmYieldCurveState;
}

export interface HjmBondOptionSpec {
  readonly optionExpiryYears: number;
  readonly bondMaturityYears: number;
  readonly strikePrice: number;
  readonly isCall: boolean;
  readonly faceValue?: number;
}
