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
}

export interface KellySizingResult {
  positionSizeUsd: number;
  kellyRaw: number;           // raw Kelly fraction (before multiplier)
  kellyAdjusted: number;      // after applying kellyFraction multiplier
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

  constructor(config?: Partial<KellyConfig>) {
    const envFraction = parseFloat(process.env.KELLY_FRACTION || '');
    const requestedFraction = config?.kellyFraction ?? (isNaN(envFraction) ? 0.25 : envFraction);

    const clampedFraction = Math.max(MIN_KELLY_FRACTION, Math.min(MAX_KELLY_FRACTION, requestedFraction));
    this.config = {
      kellyFraction: clampedFraction,
      maxPositionFraction: config?.maxPositionFraction ?? 0.05,
      minPositionUsd: config?.minPositionUsd ?? 10,
      isManagedCapital: config?.isManagedCapital ?? false,
    };

    // Managed capital: ALWAYS cap at quarter-Kelly regardless of config
    if (this.config.isManagedCapital && this.config.kellyFraction > MANAGED_CAPITAL_MAX_FRACTION) {
      this.config.kellyFraction = MANAGED_CAPITAL_MAX_FRACTION;
      logger.info(`[KellySizer] Managed capital: fraction capped at ${MANAGED_CAPITAL_MAX_FRACTION}`);
    }
  }

  /** Calculate optimal position size using Kelly criterion */
  calculatePositionSize(input: KellySizingInput): KellySizingResult {
    const { winProbability, winLossRatio, portfolioValue } = input;

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
    let fractionUsed = this.config.kellyFraction;
    let cappedByManaged = false;

    if (this.config.isManagedCapital && fractionUsed > MANAGED_CAPITAL_MAX_FRACTION) {
      fractionUsed = MANAGED_CAPITAL_MAX_FRACTION;
      cappedByManaged = true;
    }

    const kellyAdjusted = kellyRaw * fractionUsed;

    // Apply max position cap (5% of portfolio)
    let positionFraction = kellyAdjusted;
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
      positionSizeUsd: 0, kellyRaw: 0, kellyAdjusted: 0,
      cappedByMax: false, cappedByManaged: false,
      fractionUsed: this.config.kellyFraction, portfolioPercent: 0,
    };
  }
}
