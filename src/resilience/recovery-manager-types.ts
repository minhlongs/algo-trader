/**
 * Recovery Manager Types and Constants.
 */

import type { StrategyConfig, Position } from '../desk/core/types';

export const RECOVERY_FILE_DEFAULT = 'data/recovery-state.json';
/** Maximum age (ms) of a recovery snapshot to be considered valid */
export const MAX_SNAPSHOT_AGE_MS = 60 * 60 * 1000; // 1 hour

export interface RecoveryState {
  strategies: StrategyConfig[];
  positions: Position[];
  lastEquity: string;
  timestamp: number;
}
