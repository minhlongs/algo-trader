/**
 * Mastromatteo, Toth & Bouchaud (2014) Mathematical Formulations.
 * Agent-based market impact derived from microscopic order book clearing.
 */

import { MastromatteoConfig, OrderFlowState, MastromatteoImpactAssessment } from './mastromatteo-types';

export function computeOrderImbalance(state: OrderFlowState): number {
  const total = state.buyVolume + state.sellVolume;
  if (total <= 0) return 0;
  return Math.abs(state.buyVolume - state.sellVolume) / total;
}

export function computeMicroscopicImpact(
  config: MastromatteoConfig,
  netOrderVolumeQ: number,
  state: OrderFlowState
): MastromatteoImpactAssessment {
  const omega = computeOrderImbalance(state);
  const isCollapse = omega > config.criticalImbalanceOmega;

  const scalingVolume = Math.sqrt(config.baselineVolumeV0 * config.timeScaleTau);
  const liquidityMultiplier = 1 + config.latentLiquidityFractionRho / (1 - Math.min(0.99, config.latentLiquidityFractionRho));

  // Base microscopic impact
  let impact = config.participationAlpha * (netOrderVolumeQ / Math.max(1e-6, scalingVolume)) * liquidityMultiplier;

  // If collapse regime is entered, spread blows out super-linearly
  let spreadCost = config.equilibriumSpreadDelta * (1 + omega * 2);
  if (isCollapse) {
    impact *= 1 + (omega - config.criticalImbalanceOmega) * 5;
    spreadCost *= 2.5;
  }

  return {
    equilibriumImpact: impact,
    orderImbalanceOmega: omega,
    isEndogenousCollapseTriggered: isCollapse,
    effectiveSpreadCost: spreadCost,
  };
}
