export interface AdverseSelectionConfig {
  /** Composite score threshold above which market is skipped (0-1) */
  threshold: number;
  /** Number of snapshots to keep for spread history */
  spreadHistorySize: number;
  /** Relative spread widening factor that flags adverse selection */
  spreadWidenFactor: number;
  /** Imbalance strength at which we flag as adverse (0-1) */
  imbalanceThreshold: number;
}

export const DEFAULT_CONFIG: AdverseSelectionConfig = {
  threshold: 0.55,
  spreadHistorySize: 10,
  spreadWidenFactor: 1.5,
  imbalanceThreshold: 0.65,
};

export interface AdverseSelectionScore {
  /** Composite score 0-1 (higher = more adverse selection risk) */
  composite: number;
  /** Imbalance strength component 0-1 */
  imbalanceScore: number;
  /** Spread widening component 0-1 */
  spreadScore: number;
  /** Quote fading component 0-1 */
  fadingScore: number;
  /** Human-readable flags */
  flags: string[];
  timestamp: number;
}
