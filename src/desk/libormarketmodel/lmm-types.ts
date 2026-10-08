export interface LmmTenorStructure {
  readonly tenorDates: number[]; // e.g. [0.5, 1.0, 1.5, 2.0]
  readonly yearFractions: number[]; // tau_k = T_k - T_{k-1}
}

export interface LmmVolatilitySpec {
  readonly volatilities: number[]; // sigma_k for each forward rate
  readonly correlationMatrix: number[][]; // rho_{i,j}
}

export interface LmmForwardRateState {
  readonly time: number;
  readonly forwardRates: number[]; // L_k(t)
}

export interface LmmCapletSpec {
  readonly strikeRate: number;
  readonly resetTenorIndex: number; // index k where rate resets at T_{k-1}
  readonly notional?: number;
}

export interface LmmCapletResult {
  readonly monteCarloPrice: number;
  readonly black76BenchmarkPrice: number;
  readonly absoluteError: number;
  readonly standardError: number;
}
