/**
 * Continuous State Policy Agent
 * Maps continuous market microstructure state to continuous quote spread and hedging actions.
 *
 * @module desk/rl/continuous-policy-agent
 */

import { ContinuousAction, MarketStateVector } from './continuous-rl-vol-types';

export interface PolicyAgentConfig {
  readonly baseSpreadMultiplier?: number;
  readonly inventoryRiskAversion?: number;
  readonly toxicitySensitivity?: number;
}

export class ContinuousPolicyAgent {
  private readonly baseMultiplier: number;
  private readonly inventoryRiskAversion: number;
  private readonly toxicitySensitivity: number;
  private totalRewardsEarned = 0;
  private stepCount = 0;

  public constructor(config?: PolicyAgentConfig) {
    this.baseMultiplier = config?.baseSpreadMultiplier ?? 1.0;
    this.inventoryRiskAversion = config?.inventoryRiskAversion ?? 0.05;
    this.toxicitySensitivity = config?.toxicitySensitivity ?? 2.0;
  }

  public selectAction(state: MarketStateVector): ContinuousAction {
    // Inventory skew effect
    const skew = state.inventoryUnits * this.inventoryRiskAversion;

    // Toxicity widening effect
    const toxFactor = 1 + state.vpinToxicity * this.toxicitySensitivity;

    // Spread multipliers
    const bidMultiplier = Math.max(0.2, (this.baseMultiplier + skew) * toxFactor);
    const askMultiplier = Math.max(0.2, (this.baseMultiplier - skew) * toxFactor);

    // Dynamic delta hedge units
    const targetDeltaHedgeUnits = -Math.round(state.inventoryUnits * 0.8 + state.orderBookImbalance * 10);

    return {
      bidSpreadMultiplier: Number(bidMultiplier.toFixed(3)),
      askSpreadMultiplier: Number(askMultiplier.toFixed(3)),
      targetDeltaHedgeUnits,
    };
  }

  public recordStep(reward: number): { cumulativeReward: number; averageReward: number } {
    this.totalRewardsEarned += reward;
    this.stepCount += 1;
    return {
      cumulativeReward: this.totalRewardsEarned,
      averageReward: this.totalRewardsEarned / this.stepCount,
    };
  }
}
