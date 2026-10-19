export interface DavisLoTranche {
  name: string;
  attachment: number; // e.g. 0.00
  detachment: number; // e.g. 0.03
}

export interface DavisLoParams {
  numObligors: number;       // Portfolio size n (e.g. 100 or 20)
  baseHazardRate: number;    // Autonomous default intensity lambda_0
  contagionHazard: number;   // Contagion/infection hazard mu >= 0
  recoveryRate: number;      // Recovery rate R in [0, 1)
  timeHorizon: number;       // Maturity T in years
  riskFreeRate: number;      // Risk-free rate r
  tranches: DavisLoTranche[];
  timeSteps?: number;        // Numerical integration steps (default: 200)
}

export interface TrancheResult {
  name: string;
  attachment: number;
  detachment: number;
  width: number;
  expectedLossFraction: number;
  expectedLossAmount: number;
  protectionLeg: number;
  annuityLeg: number;
  trancheSpreadBps: number;
}

export interface DavisLoResult {
  numObligors: number;
  timeHorizon: number;
  expectedDefaults: number;
  defaultProbabilities: number[]; // p_k(T) for k = 0..n
  expectedPortfolioLoss: number;
  expectedPortfolioLossFraction: number;
  tranches: TrancheResult[];
}
