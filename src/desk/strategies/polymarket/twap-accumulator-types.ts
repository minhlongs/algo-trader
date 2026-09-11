import type { BaseStrategyConfig } from './base-polymarket-strategy';
import type { StrategyName } from '../../core/types';

// ── Config ─────────────────────────────────────────────────────────────────────

export interface TwapAccumulatorConfig extends BaseStrategyConfig {
  /** Target total position size in USDC */
  targetSizeUsdc: number;
  /** Number of slices to split the order into */
  numSlices: number;
  /** Interval between slices in ms */
  sliceIntervalMs: number;
  /** Acceptable execution slippage fraction (0.01 = 1%) */
  maxSlippage: number;
  /** Minimum volume to consider a market */
  minMarketVolume: number;
}

export const DEFAULT_CONFIG: TwapAccumulatorConfig = {
  targetSizeUsdc: 100,
  numSlices: 5,
  sliceIntervalMs: 60_000,
  maxSlippage: 0.01,
  minMarketVolume: 5000,
  minVolume: 1000,
  takeProfitPct: 0.04,
  stopLossPct: 0.025,
  maxHoldMs: 60 * 60_000,
  maxPositions: 3,
  cooldownMs: 300_000,
  positionSize: '20',
};

export const STRATEGY_NAME: StrategyName = 'twap-accumulator';

// ── Slice tracking ────────────────────────────────────────────────────────────

export interface AccumulatorState {
  marketId: string;
  conditionId: string;
  yesTokenId: string;
  noTokenId?: string;
  direction: 'yes' | 'no';
  targetSize: number;
  sliceSize: number;
  slicesFilled: number;
  totalSlices: number;
  lastSliceAt: number;
  entryPrices: number[];
  side: 'yes' | 'no';
}
