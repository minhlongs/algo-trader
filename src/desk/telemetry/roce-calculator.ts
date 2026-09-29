/**
 * ROCE & Margin Utilization Calculator
 * Computes period and annualized Return on Capital Employed (ROCE) and margin utilization metrics.
 */

import type { EngineId } from '../portfolio/types';
import type { MarginUtilization, RoceReport } from './telemetry-types';

export class RoceCalculator {
  /**
   * Computes period and annualized ROCE.
   * ROCE = Total MTM PnL / Capital Employed
   */
  public static computeRoce(
    totalPnlUsd: number,
    capitalEmployedUsd: number,
    daysElapsed = 30
  ): { roce: number; roceAnnualized: number } {
    if (capitalEmployedUsd <= 0) {
      return { roce: 0, roceAnnualized: 0 };
    }

    const roce = totalPnlUsd / capitalEmployedUsd;
    const annualMultiplier = daysElapsed > 0 ? 365 / daysElapsed : 1;
    const roceAnnualized = roce * annualMultiplier;

    return { roce, roceAnnualized };
  }

  /**
   * Generates a structured RoceReport.
   */
  public static generateReport(params: {
    engineId?: EngineId;
    totalPnlUsd: number;
    capitalEmployedUsd: number;
    daysElapsed?: number;
    timestamp?: number;
  }): RoceReport {
    const days = params.daysElapsed ?? 30;
    const { roce, roceAnnualized } = RoceCalculator.computeRoce(
      params.totalPnlUsd,
      params.capitalEmployedUsd,
      days
    );

    return {
      engineId: params.engineId,
      totalPnlUsd: params.totalPnlUsd,
      capitalEmployedUsd: params.capitalEmployedUsd,
      daysElapsed: days,
      roce,
      roceAnnualized,
      timestamp: params.timestamp ?? Date.now(),
    };
  }

  /**
   * Calculates margin utilization and leverage indicators.
   */
  public static computeMarginUtilization(params: {
    marginUsedUsd: number;
    capitalBaseUsd: number;
    initialMarginUsd?: number;
    maintenanceMarginUsd?: number;
    grossNotionalUsd?: number;
    engineId?: EngineId;
    warningThreshold?: number;
    criticalThreshold?: number;
  }): MarginUtilization {
    const {
      marginUsedUsd,
      capitalBaseUsd,
      initialMarginUsd = marginUsedUsd,
      maintenanceMarginUsd = marginUsedUsd * 0.75,
      grossNotionalUsd = marginUsedUsd,
      engineId,
      warningThreshold = 0.7,
      criticalThreshold = 0.9,
    } = params;

    const marginUtilizationRatio =
      capitalBaseUsd > 0 ? marginUsedUsd / capitalBaseUsd : 0;
    const grossLeverage =
      capitalBaseUsd > 0 ? grossNotionalUsd / capitalBaseUsd : 0;

    return {
      engineId,
      initialMarginUsd,
      maintenanceMarginUsd,
      totalMarginUsedUsd: marginUsedUsd,
      capitalBaseUsd,
      marginUtilizationRatio,
      grossLeverage,
      warningThresholdBreached: marginUtilizationRatio >= warningThreshold,
      criticalThresholdBreached: marginUtilizationRatio >= criticalThreshold,
    };
  }
}
