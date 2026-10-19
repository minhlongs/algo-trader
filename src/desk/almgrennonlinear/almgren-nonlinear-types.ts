/**
 * Almgren (2003) Non-Linear Power-Law Optimal Execution Types.
 */

export interface AlmgrenNonLinearConfig {
  totalSharesX0: number;
  horizonSecT: number;
  temporaryImpactEta: number;
  powerExponentAlpha: number; // e.g. 0.5 for square-root temporary impact
  permanentImpactGamma: number;
  riskAversionLambda: number;
  volatilitySigma: number;
}

export interface AlmgrenNonLinearAssessment {
  initialTradingVelocity: number;
  terminalTradingVelocity: number;
  effectiveTemporaryImpact: number;
  expectedTotalCost: number;
}
