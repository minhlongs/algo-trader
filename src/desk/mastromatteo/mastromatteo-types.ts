/**
 * Mastromatteo, Toth & Bouchaud (2014) Agent-Based Linear Impact Model Types.
 */

export interface MastromatteoConfig {
  equilibriumSpreadDelta: number;
  participationAlpha: number;
  latentLiquidityFractionRho: number;
  baselineVolumeV0: number;
  timeScaleTau: number;
  criticalImbalanceOmega: number;
}

export interface OrderFlowState {
  buyVolume: number;
  sellVolume: number;
}

export interface MastromatteoImpactAssessment {
  equilibriumImpact: number;
  orderImbalanceOmega: number;
  isEndogenousCollapseTriggered: boolean;
  effectiveSpreadCost: number;
}
