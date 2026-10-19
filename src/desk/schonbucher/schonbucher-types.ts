export interface ObligorProfile {
  name: string;
  baseHazardRate: number;    // lambda_0 (e.g. 0.02 for 200 bps hazard rate)
  factorLoading: number;     // beta in [0, 0.95]
  recoveryRate: number;      // R (e.g. 0.40)
  notional: number;          // Nominal face value (e.g. 10_000_000)
}

export interface TrancheDefinition {
  name: string;
  attachment: number;        // e.g. 0.00
  detachment: number;        // e.g. 0.03
}

export interface SchonbucherParams {
  obligors: ObligorProfile[];
  timeHorizon: number;       // T in years
  riskFreeRate: number;      // r
  tranches: TrancheDefinition[];
  quadraturePoints?: number; // Number of integration slices for factor X (default: 64)
}

export interface TrancheEvaluation {
  name: string;
  attachment: number;
  detachment: number;
  width: number;
  expectedLossFraction: number;
  expectedLossAmount: number;
  protectionValue: number;
  trancheSpreadBps: number;
}

export interface SchonbucherResult {
  timeHorizon: number;
  totalPortfolioNotional: number;
  expectedPortfolioLoss: number;
  expectedPortfolioLossFraction: number;
  tranches: TrancheEvaluation[];
}
