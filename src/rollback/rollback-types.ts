/**
 * Rollback Controller types
 * Extracted from tiered-rollback-controller.ts for modularity
 */

export enum RollbackLayer {
  L0_SIGNALS = 'L0_SIGNALS',
  L1_KILL = 'L1_KILL',
  L2_DISABLED = 'L2_DISABLED',
  L3_DRAWDOWN = 'L3_DRAWDOWN',
  L4_PAPER_GATE = 'L4_PAPER_GATE',
}

export enum RollbackState {
  ACTIVE = 'ACTIVE',
  RESTRICTED = 'RESTRICTED',
  HALTED = 'HALTED',
  BLOCKED = 'BLOCKED',
}

export interface LayerStatus {
  layer: RollbackLayer;
  active: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface RollbackStatus {
  overall: RollbackState;
  layers: LayerStatus[];
  lastChecked: number;
}

export interface RollbackConfig {
  enableCrossInstanceSync: boolean;
  signalStalenessMs: number;
  signalErrorRateThreshold: number;
  paperGateMinDays: number;
}

export const DEFAULT_ROLLBACK_CONFIG: RollbackConfig = {
  enableCrossInstanceSync: true,
  signalStalenessMs: 5 * 60_000,
  signalErrorRateThreshold: 0.5,
  paperGateMinDays: 30,
};

/** Severity mapping for layers (higher index = higher severity) */
export const LAYER_SEVERITY: Record<RollbackLayer, number> = {
  [RollbackLayer.L4_PAPER_GATE]: 1,
  [RollbackLayer.L3_DRAWDOWN]: 2,
  [RollbackLayer.L2_DISABLED]: 3,
  [RollbackLayer.L1_KILL]: 4,
  [RollbackLayer.L0_SIGNALS]: 5,
};

/** Tier-aware severity for L3 drawdown — HALT=3 (HALTED), HARD_STOP=4 (BLOCKED) */
export function getEffectiveSeverity(layer: RollbackLayer, metadata?: Record<string, unknown>): number {
  if (layer === RollbackLayer.L3_DRAWDOWN) {
    const tier = metadata?.tier as string;
    if (tier === 'HARD_STOP') return 4;
    if (tier === 'HALT') return 3;
    return LAYER_SEVERITY[layer]; // ALERT/REDUCE/DAILY_PAUSE → base severity 2 (RESTRICTED)
  }
  return LAYER_SEVERITY[layer];
}

/** Determine overall state from highest-severity active layer */
export function overallStateFromLayer(activeLayer: RollbackLayer | null, metadata?: Record<string, unknown>): RollbackState {
  if (!activeLayer) return RollbackState.ACTIVE;
  const sev = getEffectiveSeverity(activeLayer, metadata);
  if (sev >= 4) return RollbackState.BLOCKED;
  if (sev >= 3) return RollbackState.HALTED;
  if (sev >= 1) return RollbackState.RESTRICTED;
  return RollbackState.ACTIVE;
}
