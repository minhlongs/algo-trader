/**
 * Pre-Trade Risk Guard for MARL Market-Making Engine.
 *
 * Implements Milestone 4 pre-trade risk gates:
 * - 5% Quarter-Kelly position limit ceiling
 * - 15% daily drawdown circuit breaker
 * - 500ms venue latency spike threshold
 * - Inventory notional ceiling enforcement
 *
 * @module desk/marl/risk/marl-risk-guard
 */

import { logger } from '../../../shared/utils/logger';
import {
  type MarlRiskConfig,
  type MarlRiskEvaluationInput,
  type MarlRiskEvaluationResult,
  MarlRiskConfigSchema,
} from './marl-risk-types';

export class MarlRiskGuard {
  private readonly config: MarlRiskConfig;
  private emergencyHaltActive = false;

  constructor(customConfig?: Partial<MarlRiskConfig>) {
    this.config = MarlRiskConfigSchema.parse(customConfig ?? {});
  }

  public getConfig(): MarlRiskConfig {
    return { ...this.config };
  }

  public isHalted(): boolean {
    return this.emergencyHaltActive;
  }

  public tripEmergencyHalt(reason: string): void {
    this.emergencyHaltActive = true;
    logger.warn('[MarlRiskGuard] Emergency halt tripped manually or via circuit breaker', {
      reason,
    });
  }

  public resetEmergencyHalt(): void {
    this.emergencyHaltActive = false;
    logger.info('[MarlRiskGuard] Emergency halt reset to normal operation');
  }

  public evaluateRisk(input: MarlRiskEvaluationInput): MarlRiskEvaluationResult {
    const {
      quoteNotionalUsd,
      portfolioCapital,
      currentDailyDrawdown,
      venueLatencyMs,
      currentInventoryNotional,
      winRate = 0.55,
      payoutRatio = 1.0,
    } = input;

    if (this.emergencyHaltActive && this.config.emergencyHaltEnabled) {
      return {
        approved: false,
        rejectionReason: 'EMERGENCY_HALT_ACTIVE',
        quarterKellySizeUsd: 0,
        currentDrawdownFraction: currentDailyDrawdown,
        venueLatencyMs,
        circuitBroken: true,
      };
    }

    if (currentDailyDrawdown >= this.config.maxDailyDrawdownFraction) {
      logger.warn('[MarlRiskGuard] Pre-trade risk rejection: Drawdown circuit breaker tripped', {
        currentDailyDrawdown,
        maxDailyDrawdownFraction: this.config.maxDailyDrawdownFraction,
      });
      return {
        approved: false,
        rejectionReason: 'DRAWDOWN_BREAKER_TRIPPED',
        quarterKellySizeUsd: 0,
        currentDrawdownFraction: currentDailyDrawdown,
        venueLatencyMs,
        circuitBroken: true,
      };
    }

    if (venueLatencyMs > this.config.maxVenueLatencyMs) {
      logger.warn('[MarlRiskGuard] Pre-trade risk rejection: Venue latency spike', {
        venueLatencyMs,
        maxVenueLatencyMs: this.config.maxVenueLatencyMs,
      });
      return {
        approved: false,
        rejectionReason: 'VENUE_LATENCY_SPIKE',
        quarterKellySizeUsd: 0,
        currentDrawdownFraction: currentDailyDrawdown,
        venueLatencyMs,
        circuitBroken: false,
      };
    }

    const edge = winRate * (payoutRatio + 1) - 1;
    const fullKelly = edge > 0 ? edge / payoutRatio : 0;
    const quarterKelly = Math.min(
      this.config.maxPositionFraction,
      Math.max(0, fullKelly * 0.25),
    );
    const quarterKellySizeUsd = Number((quarterKelly * portfolioCapital).toFixed(4));

    if (quoteNotionalUsd > quarterKellySizeUsd + 1e-4) {
      logger.warn('[MarlRiskGuard] Pre-trade risk rejection: Quarter-Kelly cap exceeded', {
        quoteNotionalUsd,
        quarterKellySizeUsd,
      });
      return {
        approved: false,
        rejectionReason: 'KELLY_CAP_EXCEEDED',
        quarterKellySizeUsd,
        currentDrawdownFraction: currentDailyDrawdown,
        venueLatencyMs,
        circuitBroken: false,
      };
    }

    if (currentInventoryNotional + quoteNotionalUsd > this.config.maxInventoryNotionalUsd) {
      logger.warn('[MarlRiskGuard] Pre-trade risk rejection: Max inventory limit exceeded', {
        projectedNotional: currentInventoryNotional + quoteNotionalUsd,
        maxInventoryNotionalUsd: this.config.maxInventoryNotionalUsd,
      });
      return {
        approved: false,
        rejectionReason: 'INVENTORY_LIMIT_EXCEEDED',
        quarterKellySizeUsd,
        currentDrawdownFraction: currentDailyDrawdown,
        venueLatencyMs,
        circuitBroken: false,
      };
    }

    return {
      approved: true,
      quarterKellySizeUsd,
      currentDrawdownFraction: currentDailyDrawdown,
      venueLatencyMs,
      circuitBroken: false,
    };
  }
}
