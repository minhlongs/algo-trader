/**
 * Kelly Position Sizer
 * Quarter-Kelly default for managed capital safety, configurable for own accounts.
 * Hard cap: no single position > 5% of portfolio.
 */

import { logger } from '../utils/logger';

export interface KellyConfig {
  /** Kelly fraction multiplier (0.1-0.5). Default 0.25 (quarter-Kelly) */
  kellyFraction: number;
  /** Max position as fraction of portfolio (default 0.05 = 5%) */
  maxPositionFraction: number;
  /** Min position size in USD */
  minPositionUsd: number;
  /** Whether this is managed capital (caps fraction at 0.25) */
  isManagedCapital: boolean;
}

export interface KellySizingInput {
  winProbability: number;     // 0-1 estimated probability of winning
  winLossRatio: number;       // average win / average loss (e.g., 1.5 means win 1.5x of loss)
  portfolioValue: number;     // total portfolio in USD
  currentExposure?: number;   // current total exposure in USD (optional)
  correlation?: number;       // correlation with existing positions, 0-1 (optional, default 0)
}

export interface KellySizingResult {
  positionSizeUsd: number;
  kellyRaw: number;           // raw Kelly fraction (before multiplier)
  kellyAdjusted: number;      // after applying kellyFraction multiplier
  correlation: number;        // correlation factor applied (0-1)
  cappedByMax: boolean;       // true if position was capped by maxPositionFraction
  cappedByManaged: boolean;   // true if managed capital cap applied
  fractionUsed: number;       // actual fraction used
  portfolioPercent: number;   // position as % of portfolio
}

const MANAGED_CAPITAL_MAX_FRACTION = 0.25;
const MIN_KELLY_FRACTION = 0.1;
const MAX_KELLY_FRACTION = 0.5;

export class KellyPositionSizer {
  private config: KellyConfig;
  private readonly managedCapApplied: boolean;

  constructor(config?: Partial<KellyConfig>) {
    const envFraction = parseFloat(process.env.KELLY_FRACTION || '');
    const requestedFraction = config?.kellyFraction ?? (isNaN(envFraction) ? 0.25 : envFraction);
    const clampedFraction = Math.max(MIN_KELLY_FRACTION, Math.min(MAX_KELLY_FRACTION, requestedFraction));

    const isManagedCapital = config?.isManagedCapital ?? false;
    this.managedCapApplied = isManagedCapital && clampedFraction > MANAGED_CAPITAL_MAX_FRACTION;
    const finalFraction = this.managedCapApplied ? MANAGED_CAPITAL_MAX_FRACTION : clampedFraction;

    this.config = {
      kellyFraction: finalFraction,
      maxPositionFraction: config?.maxPositionFraction ?? 0.05,
      minPositionUsd: config?.minPositionUsd ?? 10,
      isManagedCapital,
    };

    if (this.managedCapApplied) {
      logger.info(`[KellySizer] Managed capital: fraction capped at ${MANAGED_CAPITAL_MAX_FRACTION}`);
    }
  }

  /** Calculate optimal position size using Kelly criterion */
  calculatePositionSize(input: KellySizingInput): KellySizingResult {
    const { winProbability, winLossRatio, portfolioValue } = input;
    const correlation = input.correlation ?? 0;

    // Validate inputs
    if (winProbability <= 0 || winProbability >= 1 || winLossRatio <= 0 || portfolioValue <= 0) {
      return this.zeroResult(portfolioValue);
    }

    // Kelly formula: f* = (bp - q) / b
    // where b = win/loss ratio, p = win probability, q = 1-p
    const b = winLossRatio;
    const p = winProbability;
    const q = 1 - p;
    const kellyRaw = (b * p - q) / b;

    // Negative Kelly = no edge, don't bet
    if (kellyRaw <= 0) {
      return this.zeroResult(portfolioValue);
    }

    // Apply fraction multiplier (quarter-Kelly by default)
    const fractionUsed = this.config.kellyFraction;
    const cappedByManaged = this.managedCapApplied;

    const kellyAdjusted = kellyRaw * fractionUsed;

    // Apply correlation adjustment (reduce position for correlated exposure)
    let positionFraction = kellyAdjusted * (1 - correlation);

    // Apply max position cap (5% of portfolio)
    let cappedByMax = false;

    if (positionFraction > this.config.maxPositionFraction) {
      positionFraction = this.config.maxPositionFraction;
      cappedByMax = true;
    }

    let positionSizeUsd = portfolioValue * positionFraction;

    // Enforce minimum
    if (positionSizeUsd < this.config.minPositionUsd) {
      positionSizeUsd = 0;
    }

    return {
      positionSizeUsd,
      kellyRaw,
      kellyAdjusted,
      correlation,
      cappedByMax,
      cappedByManaged,
      fractionUsed,
      portfolioPercent: portfolioValue > 0 ? (positionSizeUsd / portfolioValue) * 100 : 0,
    };
  }

  getConfig(): KellyConfig {
    return { ...this.config };
  }

  private zeroResult(_portfolioValue: number): KellySizingResult {
    return {
      positionSizeUsd: 0, kellyRaw: 0, kellyAdjusted: 0, correlation: 0,
      cappedByMax: false, cappedByManaged: this.managedCapApplied,
      fractionUsed: this.config.kellyFraction, portfolioPercent: 0,
    };
  }
}
