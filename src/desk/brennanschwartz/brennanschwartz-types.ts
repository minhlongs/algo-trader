export interface BrennanSchwartzParams {
  shortRate: number; // r0
  longRate: number; // l0
  shortRateMeanReversion: number; // kappa_r (or kappa_1)
  longRateMeanReversion: number; // kappa_l (or kappa_2)
  longRateTarget: number; // bar{l} or target level
  shortRateVol: number; // sigma_r
  longRateVol: number; // sigma_l
  rateCorrelation: number; // rho between dW1 and dW2
  shortRateRiskPremium?: number; // lambda_r
}

export interface BrennanSchwartzBondResult {
  maturity: number;
  zeroBondPrice: number;
  yieldToMaturity: number;
  instantaneousForwardRate: number;
  curveSlope: number; // longRate - shortRate
  convexity: number;
}

export interface BrennanSchwartzSimulationStep {
  time: number;
  shortRate: number;
  longRate: number;
  spread: number;
}

export interface BrennanSchwartzSimulationResult {
  steps: BrennanSchwartzSimulationStep[];
  terminalShortRate: number;
  terminalLongRate: number;
  terminalSpread: number;
  meanShortRate: number;
  meanLongRate: number;
}
