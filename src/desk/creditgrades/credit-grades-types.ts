export interface CreditGradesParams {
  equityPrice: number;         // Spot equity price S > 0
  debtPerShare: number;        // Debt per share D > 0
  equityVolatility: number;    // Annualized equity volatility sigma_E > 0
  recoveryRate: number;        // Mean recovery rate L_bar in (0, 1) (default 0.5)
  recoveryVolatility: number;  // Recovery volatility lambda > 0 (default 0.3)
  riskFreeRate: number;        // Risk-free interest rate r (e.g. 0.04)
  maturities: number[];        // Tenors in years (e.g. [1, 2, 3, 5, 10])
}

export interface CreditGradesPoint {
  maturity: number;
  survivalProbability: number;
  defaultProbability: number;
  hazardRate: number;          // Cumulative annualized hazard rate lambda(T) = -ln(Q)/T
  parCdsSpreadBps: number;     // Par CDS spread in basis points (bps)
  discountFactor: number;      // Risk-free discount factor exp(-r*T)
}

export interface CreditGradesResult {
  assetVolatility: number;     // Calculated asset volatility sigma_A
  leverageRatio: number;       // L_bar * D / S
  curve: CreditGradesPoint[];
  fiveYearSpreadBps: number;   // Benchmark 5Y CDS spread
}
