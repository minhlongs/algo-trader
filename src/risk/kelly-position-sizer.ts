/**
 * Kelly Position Sizer
 * Quarter-Kelly default for managed capital safety, configurable for own accounts.
 * Hard cap: no single position > 5% of portfolio.
 */
import { logger } from '../shared/utils/logger';

export interface KellyConfig {
  kellyFraction: number;
  maxPositionFraction: number;
  minPositionUsd: number;
  isManagedCapital: boolean;
}

export interface KellySizingInput {
  winProbability: number;
  winLossRatio: number;
  portfolioValue: number;
  currentExposure?: number;
}

export interface KellySizingResult {
  positionSizeUsd: number;
  kellyRaw: number;
  kellyAdjusted: number;
  cappedByMax: boolean;
  cappedByManaged: boolean;
  fractionUsed: number;
  portfolioPercent: number;
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
    if (this.config.isManagedCapital && this.config.kellyFraction > MANAGED_CAPITAL_MAX_FRACTION) {
      this.config.kellyFraction = MANAGED_CAPITAL_MAX_FRACTION;
      logger.info(`[KellySizer] Managed capital: fraction capped at ${MANAGED_CAPITAL_MAX_FRACTION}`);
    }
  }

  calculatePositionSize(input: KellySizingInput): KellySizingResult {
    const { winProbability, winLossRatio, portfolioValue } = input;
    if (winProbability <= 0 || winProbability >= 1 || portfolioValue <= 0) {
      return this.zeroResult(portfolioValue);
    }
    if (!isFinite(winLossRatio) || winLossRatio <= 0) {
      logger.warn(`[KellySizer] Invalid winLossRatio: ${winLossRatio}, returning zero result`);
      return this.zeroResult(portfolioValue);
    }
    const b = winLossRatio;
    const p = winProbability;
    const q = 1 - p;
    const kellyRaw = (b * p - q) / b;
    if (kellyRaw <= 0) return this.zeroResult(portfolioValue);

    let fractionUsed = this.config.kellyFraction;
    let cappedByManaged = false;
    if (this.config.isManagedCapital && fractionUsed > MANAGED_CAPITAL_MAX_FRACTION) {
      fractionUsed = MANAGED_CAPITAL_MAX_FRACTION;
      cappedByManaged = true;
    }
    const kellyAdjusted = kellyRaw * fractionUsed;
    let positionFraction = kellyAdjusted;
    let cappedByMax = false;
    if (positionFraction > this.config.maxPositionFraction) {
      positionFraction = this.config.maxPositionFraction;
      cappedByMax = true;
    }
    let positionSizeUsd = portfolioValue * positionFraction;
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

  private zeroResult(portfolioValue: number): KellySizingResult {
    const minSize = this.config.minPositionUsd > 0 ? this.config.minPositionUsd : 0;
    return {
      positionSizeUsd: 0,
      kellyRaw: 0,
      kellyAdjusted: 0,
      cappedByMax: false,
      cappedByManaged: false,
      fractionUsed: this.config.kellyFraction,
      portfolioPercent: 0,
    };
  }
}
