/**
 * Pre-Trade Risk Guard
 * 5% Quarter-Kelly position limit, max pool exposure, 15% daily drawdown, and venue latency filter
 * (Milestone 4 / Feature 12)
 */

import { logger } from '../../../shared/utils/logger';
import {
  RiskCheckResult,
  RiskContext,
  RiskGateConfig,
  RiskMetricsSummary,
  TradeIntent,
} from '../types/risk-types';

export class AmmRiskGuard {
  private config: RiskGateConfig;

  constructor(config?: Partial<RiskGateConfig>) {
    this.config = {
      maxQuarterKellyRatio: config?.maxQuarterKellyRatio ?? 0.05,
      maxPoolExposureUsd: config?.maxPoolExposureUsd ?? 50_000,
      maxDailyDrawdownThreshold: config?.maxDailyDrawdownThreshold ?? 0.15,
      maxVenueLatencyMs: config?.maxVenueLatencyMs ?? 500,
    };
  }

  public evaluatePreTrade(
    intent: TradeIntent,
    context: RiskContext,
    overrideConfig?: Partial<RiskGateConfig>
  ): RiskCheckResult {
    const maxQuarterKelly = overrideConfig?.maxQuarterKellyRatio ?? this.config.maxQuarterKellyRatio;
    const maxPoolExp = overrideConfig?.maxPoolExposureUsd ?? context.maxPoolExposureLimitUsd ?? this.config.maxPoolExposureUsd;
    const maxDrawdown = overrideConfig?.maxDailyDrawdownThreshold ?? this.config.maxDailyDrawdownThreshold;
    const maxLatency = overrideConfig?.maxVenueLatencyMs ?? this.config.maxVenueLatencyMs;

    const latency = intent.venueLatencyMs ?? context.venueLatencyMs ?? 0;
    const portfolioEquity = context.portfolioEquityUsd ?? context.portfolioCapitalUsd ?? 100_000;
    const peakEquity = Math.max(context.peakDailyEquityUsd ?? portfolioEquity, portfolioEquity);
    const currentEquity = context.currentDailyEquityUsd ?? portfolioEquity;

    const calculatedDrawdown = peakEquity > 0 ? Math.max(0, (peakEquity - currentEquity) / peakEquity) : 0;
    const effectiveDrawdown = context.currentDailyDrawdown ?? calculatedDrawdown;
    const quarterKellyLimitUsd = portfolioEquity * maxQuarterKelly;
    const poolExposureAfterTrade = context.currentPoolExposureUsd + intent.notionalUsd;

    const metrics: RiskMetricsSummary = {
      quarterKellyLimitUsd,
      currentDailyDrawdown: effectiveDrawdown,
      maxAllowedDrawdown: maxDrawdown,
      venueLatencyMs: latency,
      poolExposureAfterTradeUsd: poolExposureAfterTrade,
    };

    // 1. Latency Spike Gate
    if (latency > maxLatency) {
      logger.warn('[AmmRiskGuard] Pre-trade rejected: Latency spike', { latency, maxLatency });
      return {
        allowed: false,
        verdict: 'REJECTED',
        allowedNotionalUsd: 0,
        rejectionCode: 'LATENCY_SPIKE_EXCEEDED',
        reason: `Venue latency ${latency}ms exceeds threshold ${maxLatency}ms`,
        riskMetrics: metrics,
      };
    }

    // 2. Daily Drawdown Circuit Breaker Gate
    if (effectiveDrawdown > maxDrawdown) {
      logger.warn('[AmmRiskGuard] Pre-trade rejected: Daily drawdown breach', {
        effectiveDrawdown,
        maxDrawdown,
      });
      return {
        allowed: false,
        verdict: 'REJECTED',
        allowedNotionalUsd: 0,
        rejectionCode: 'DAILY_DRAWDOWN_BREACH',
        reason: `Daily drawdown ${(effectiveDrawdown * 100).toFixed(2)}% exceeds threshold ${(maxDrawdown * 100).toFixed(2)}%`,
        riskMetrics: metrics,
      };
    }

    // 3. Max Pool Exposure Gate
    if (poolExposureAfterTrade > maxPoolExp) {
      const allowedNotional = Math.max(0, maxPoolExp - context.currentPoolExposureUsd);
      logger.warn('[AmmRiskGuard] Pre-trade rejected: Max pool exposure exceeded', {
        poolExposureAfterTrade,
        maxPoolExp,
      });
      return {
        allowed: false,
        verdict: 'REJECTED',
        allowedNotionalUsd: allowedNotional,
        rejectionCode: 'MAX_POOL_EXPOSURE_EXCEEDED',
        reason: `Pool exposure ${poolExposureAfterTrade} exceeds max ${maxPoolExp}`,
        riskMetrics: metrics,
      };
    }

    // 4. Quarter-Kelly Cap Gate (5% equity cap)
    if (intent.notionalUsd > quarterKellyLimitUsd) {
      logger.warn('[AmmRiskGuard] Pre-trade rejected: Kelly cap exceeded', {
        notionalUsd: intent.notionalUsd,
        quarterKellyLimitUsd,
      });
      return {
        allowed: false,
        verdict: 'REJECTED',
        allowedNotionalUsd: quarterKellyLimitUsd,
        rejectionCode: 'KELLY_CAP_EXCEEDED',
        reason: `Notional ${intent.notionalUsd} exceeds Quarter-Kelly limit ${quarterKellyLimitUsd}`,
        riskMetrics: metrics,
      };
    }

    return {
      allowed: true,
      verdict: 'APPROVED',
      allowedNotionalUsd: intent.notionalUsd,
      riskMetrics: metrics,
    };
  }

  // Static convenience helper matching test signatures
  public static evaluatePreTrade(
    intent: TradeIntent,
    context: RiskContext,
    config?: Partial<RiskGateConfig>
  ): RiskCheckResult {
    const guard = new AmmRiskGuard(config);
    return guard.evaluatePreTrade(intent, context, config);
  }
}
