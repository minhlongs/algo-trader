/** Minimal type mirrors for recovery snapshots — avoids shared→desk dependency. */
export interface StrategyConfig {
  name: string;
  enabled: boolean;
  capitalAllocation: string;
  params: Record<string, unknown>;
}

export interface Position {
  marketId: string;
  side: 'long' | 'short';
  entryPrice: string;
  size: string;
  unrealizedPnl: string;
  openedAt: number;
}

export const RECOVERY_FILE_DEFAULT = 'data/recovery-state.json';
/** Maximum age (ms) of a recovery snapshot to be considered valid */
export const MAX_SNAPSHOT_AGE_MS = 60 * 60 * 1000; // 1 hour

export interface RecoveryState {
  strategies: StrategyConfig[];
  positions: Position[];
  lastEquity: string;
  timestamp: number;
}
