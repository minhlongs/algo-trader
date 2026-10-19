/**
 * Wave 293 — Cartea & Jaimungal (2015): Hybrid Limit and Market Order Execution
 * Types & Configuration Interfaces
 */

export interface CarteaJaimungal2015HybridConfig {
  readonly currentInventoryQ: number;
  readonly remainingHorizonSec: number;
  readonly quotedHalfSpreadDelta: number;
  readonly limitFillIntensityLambda: number;
  readonly temporaryImpactEta: number;
  readonly inventoryUrgencyPhi: number;
}

export interface CarteaJaimungal2015HybridResult {
  readonly criticalSwitchInventoryQStar: number;
  readonly postLimitExpectedRate: number;
  readonly aggressiveMarketSweepRate: number;
  readonly regimeMode: 'PASSIVE_LIMIT_ONLY' | 'HYBRID_LIMIT_AND_MARKET';
}
