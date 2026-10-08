export interface AlmgrenChrissParams {
  totalShares: number;      // X: total inventory to liquidate (e.g. 1,000,000)
  totalTime: number;        // T: time horizon in days/years (e.g. 1.0 day or 5.0 days)
  numIntervals: number;     // N: number of discrete trade intervals
  
  // Market microstructure parameters
  volatility: number;       // sigma: daily or annual price volatility
  gamma: number;            // permanent price impact parameter (gamma)
  eta: number;              // temporary price impact parameter (eta)
  riskAversion: number;     // lambda: risk aversion parameter (lambda >= 0)
}

export interface TrajectoryPoint {
  time: number;             // t_k
  holdingsRemaining: number;// x_k
  tradeSize: number;        // n_k = x_{k-1} - x_k
  tradeRate: number;        // v_k = n_k / tau
}

export interface ExecutionSchedule {
  trajectory: TrajectoryPoint[];
  expectedCost: number;     // E[x] expected execution cost / shortfall
  variance: number;         // V[x] variance of capture / shortfall
  halfLife: number;         // kappa^-1 liquidation half life
}
