import { logger } from '../../shared/utils/logger';
import {
  DEFAULT_VENUE_CAPS,
  type GrossLeverageReport,
  type LeverageCheckResult,
  type VenueExposureReport,
} from './portfolio-risk-types';

export class LeverageExposureGuard {
  constructor(
    private readonly maxGrossLeverage: number = 3.0,
    private readonly maxSingleVenueExposureRatio: number = 0.50,
    private readonly venueCaps: Readonly<Record<string, number>> = DEFAULT_VENUE_CAPS,
    private readonly maxNetLeverage?: number
  ) {}

  public checkExposure(
    totalNavUsd: number,
    positions: Readonly<Record<string, number>>
  ): LeverageCheckResult {
    const totalGross = Object.values(positions).reduce(
      (sum, p) => sum + Math.abs(Number.isFinite(p) ? p : 0),
      0
    );
    const netExposure = Object.values(positions).reduce(
      (sum, p) => sum + (Number.isFinite(p) ? p : 0),
      0
    );
    const grossLeverage = totalNavUsd > 0 ? totalGross / totalNavUsd : 0;

    let isAllowed = grossLeverage <= this.maxGrossLeverage;
    let violationReason: string | undefined;

    if (!isAllowed) {
      violationReason = `Gross leverage ${grossLeverage.toFixed(2)}x exceeds limit ${this.maxGrossLeverage}x`;
    }

    // Venue concentration check
    for (const [key, size] of Object.entries(positions)) {
      const ratio = totalGross > 0 ? Math.abs(size) / totalGross : 0;
      const venueCap = this.venueCaps[key.toLowerCase()] ?? this.maxSingleVenueExposureRatio;
      if (ratio > venueCap && totalGross > totalNavUsd * 0.5) {
        isAllowed = false;
        violationReason = `Venue exposure ${key} ratio ${(ratio * 100).toFixed(1)}% exceeds cap`;
        break;
      }
    }

    // Net directional leverage check (when maxNetLeverage is configured)
    if (this.maxNetLeverage !== undefined && isAllowed && totalNavUsd > 0) {
      const netLeverage = Math.abs(netExposure) / totalNavUsd;
      if (netLeverage > this.maxNetLeverage) {
        isAllowed = false;
        violationReason = `Net directional leverage ${netLeverage.toFixed(2)}x exceeds limit ${this.maxNetLeverage}x`;
      }
    }

    if (!isAllowed && violationReason) {
      logger.warn(`[LeverageExposureGuard] Violation: ${violationReason}`);
    }

    return {
      grossLeverage,
      netExposure,
      isAllowed,
      maxAllowedLeverage: this.maxGrossLeverage,
      violationReason,
    };
  }

  public checkDetailedReport(
    totalNavUsd: number,
    positions: Readonly<Record<string, number>>
  ): GrossLeverageReport {
    const check = this.checkExposure(totalNavUsd, positions);
    const totalGross = Object.values(positions).reduce((sum, p) => sum + Math.abs(p), 0);
    const netLeverage = totalNavUsd > 0 ? Math.abs(check.netExposure) / totalNavUsd : 0;

    return {
      totalGrossExposureUsd: totalGross,
      totalNavUsd,
      grossLeverage: check.grossLeverage,
      maxAllowedLeverage: this.maxGrossLeverage,
      isAllowed: check.isAllowed,
      netDirectionalExposureUsd: check.netExposure,
      netLeverage,
      maxNetLeverage: this.maxNetLeverage ?? 1.0,
      violationReason: check.violationReason,
    };
  }

  public checkVenueExposure(
    totalNavUsd: number,
    positions: Readonly<Record<string, number>>
  ): VenueExposureReport {
    const totalGross = Object.values(positions).reduce((sum, p) => sum + Math.abs(p), 0);
    const venueAllocations: Record<string, number> = {};
    const venueRatios: Record<string, number> = {};
    const venueCaps: Record<string, number> = {};
    const violations: string[] = [];

    for (const [venue, size] of Object.entries(positions)) {
      const absSize = Math.abs(size);
      venueAllocations[venue] = absSize;
      const ratio = totalGross > 0 ? absSize / totalGross : 0;
      venueRatios[venue] = ratio;
      const cap = this.venueCaps[venue.toLowerCase()] ?? this.maxSingleVenueExposureRatio;
      venueCaps[venue] = cap;

      if (ratio > cap && totalGross > totalNavUsd * 0.5) {
        violations.push(
          `Venue exposure ${venue} (${(ratio * 100).toFixed(1)}%) exceeds cap (${(cap * 100).toFixed(1)}%)`
        );
      }
    }

    return {
      venueAllocations,
      venueCaps,
      venueRatios,
      isCompliant: violations.length === 0,
      violations,
    };
  }

  public validatePreTradeOrder(
    totalNavUsd: number,
    currentPositions: Readonly<Record<string, number>>,
    orderNotionalUsd: number,
    venue?: string
  ): { approved: boolean; reason?: string } {
    if (totalNavUsd <= 0) {
      return { approved: false, reason: 'NAV must be positive to validate trade' };
    }
    const simulatedPositions = { ...currentPositions };
    const venueKey = venue ?? 'default';
    simulatedPositions[venueKey] = (simulatedPositions[venueKey] ?? 0) + Math.abs(orderNotionalUsd);

    const check = this.checkExposure(totalNavUsd, simulatedPositions);
    return {
      approved: check.isAllowed,
      reason: check.violationReason,
    };
  }
}
