/**
 * Kelly Criterion Position Sizer
 * Calculates optimal position size based on win rate and risk/reward.
 */

import {
  calculateKelly,
  computeCorrelationAdjustedSize,
  type CalculatePositionSizeInput,
  type KellyInput,
  type KellyResult,
  type KellySizerConfig,
  type PositionSizeResult,
} from './kelly-position-sizer-math';

export {
  calculateKelly,
  computeCorrelationAdjustedSize,
  type CalculatePositionSizeInput,
  type KellyInput,
  type KellyResult,
  type KellySizerConfig,
  type PositionSizeResult,
};

/**
 * KellyPositionSizer - class wrapper for correlation-adjusted position sizing.
 * Supports the backtest and trading pipeline that expect an OOP interface.
 */
export class KellyPositionSizer {
  private readonly kellyFraction: number;
  private readonly maxPositionFraction: number;
  private readonly minPositionUsd: number;

  constructor(opts: {
    kellyFraction?: number;
    maxPositionFraction?: number;
    minPositionUsd?: number;
    isManagedCapital?: boolean;
  } = {}) {
    // Read KELLY_FRACTION from env when not explicitly provided
    const envFraction = opts.kellyFraction ?? parseFloat(process.env.KELLY_FRACTION ?? '');
    let rawFraction = Number.isFinite(envFraction) ? envFraction : 0.25;

    // Managed capital: cap at quarter-Kelly max
    if (opts.isManagedCapital && rawFraction > 0.25) {
      rawFraction = 0.25;
    }

    // Clamp to 0.1 – 0.5
    this.kellyFraction = Math.max(0.1, Math.min(0.5, rawFraction));
    this.maxPositionFraction = opts.maxPositionFraction ?? 0.05;
    this.minPositionUsd = opts.minPositionUsd ?? 1;
  }

  /** Get current config (for testing / introspection). */
  getConfig(): KellySizerConfig {
    return {
      kellyFraction: this.kellyFraction,
      maxPositionFraction: this.maxPositionFraction,
      minPositionUsd: this.minPositionUsd,
    };
  }

  calculatePositionSize(input: CalculatePositionSizeInput): PositionSizeResult {
    return computeCorrelationAdjustedSize(input, this.getConfig());
  }
}
