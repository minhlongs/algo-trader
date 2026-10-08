export interface LehalleMoallemiMarketParams {
  totalOrderSize: number;      // Total parent order size Q > 0
  halfSpread: number;          // Half bid-ask spread s/2
  litImpactParam: number;      // Lit temporary price impact parameter eta_lit > 0
  darkBaseFillProb: number;    // Dark pool base fill probability p_0 in (0, 1]
  darkDecayParam: number;      // Dark pool queue decay factor alpha >= 0
  darkAdverseSelection: number;// Dark adverse selection coefficient kappa_dark >= 0
  darkPriceImprovement: number;// Dark price improvement pi_dark (e.g. half-spread savings)
  delayPenaltyFactor: number;  // Delay penalty factor gamma_delay >= 0
}

export interface ExecutionCostBreakdown {
  litDirectCost: number;
  darkDirectCost: number;
  residualLitCost: number;
  totalExpectedCost: number;
  expectedDarkFill: number;
  expectedFillRate: number;
}

export interface LehalleMoallemiResult {
  optimalDarkSplit: number;     // q_dark* in [0, Q]
  optimalLitSplit: number;      // q_lit* = Q - q_dark*
  optimalDarkFraction: number;  // q_dark* / Q
  minimumExpectedCost: number;
  allLitCost: number;           // Baseline cost if 100% lit
  allDarkCost: number;          // Baseline cost if 100% dark
  costSavingsBps: number;       // Savings vs 100% lit execution in bps
  breakdown: ExecutionCostBreakdown;
}
