/**
 * Mean Reversion Strategy Types and Configuration.
 */

export interface MeanReversionConfig {
  /** Size per trade in USDC */
  sizeUsdc: number;
  /** Z-score threshold to trigger entry */
  spikeThreshold: number;
  /** Z-score threshold to exit (must be <= spikeThreshold) */
  exitThreshold: number;
  /** Number of price ticks for moving average */
  maWindow: number;
  /** Max concurrent positions */
  maxPositions: number;
  /** How often to scan (ms) — kept for compat */
  scanIntervalMs: number;
}

export const DEFAULT_CONFIG: MeanReversionConfig = {
  sizeUsdc: 50,
  spikeThreshold: 2.0,
  exitThreshold: 0.5,
  maWindow: 20,
  maxPositions: 3,
  scanIntervalMs: 60_000,
};

export interface MrPosition {
  tokenId: string;
  conditionId: string;
  side: 'yes' | 'no';
  entryPrice: number;
  sizeUsdc: number;
  entryZscore: number;
  openedAt: number;
}
