/**
 * Drawdown Circuit Breaker Gate Logic for Arbitrage Risk Guard
 *
 * @module desk/arbitrage/risk/arbitrage-risk-guard-drawdown
 */

import { logger } from '../../../shared/utils/logger';
import {
  type ArbitrageRiskConfig,
  type MultiLegArbitrageBasket,
  type ArbitrageRiskContext,
  type ArbitrageRiskGateChecks,
  type ArbitrageRiskCheckResult,
  ArbitrageRejectionReason,
} from './arbitrage-risk-types';
import type { LiveExecutionGuard } from '../../execution/live-execution-guard-core';
import type { RiskGateManager } from '../../risk/risk-gate-manager';
import type { TieredDrawdownBreaker } from '../../risk/tiered-drawdown-breaker';
import type { DrawdownMonitor } from '../../risk/drawdown-monitor';

export interface DrawdownGateDependencies {
  config: ArbitrageRiskConfig;
  liveExecutionGuard: LiveExecutionGuard;
  riskGateManager: RiskGateManager;
  tieredDrawdownBreaker?: TieredDrawdownBreaker;
  drawdownMonitor?: DrawdownMonitor;
}

export async function evaluateDrawdownBreaker(
  basket: MultiLegArbitrageBasket,
  context: ArbitrageRiskContext | undefined,
  checks: ArbitrageRiskGateChecks,
  deps: DrawdownGateDependencies,
): Promise<ArbitrageRiskCheckResult | null> {
  const { config, liveExecutionGuard, riskGateManager, tieredDrawdownBreaker, drawdownMonitor } = deps;

  // 1a. Explicit drawdown passed in context
  if (
    context?.currentDrawdown !== undefined &&
    context.currentDrawdown >= config.maxDailyDrawdownFraction
  ) {
    checks.drawdownBreakerOk = false;
    logger.warn('[ArbitrageRiskGuard] Cumulative daily drawdown breached limit', {
      currentDrawdown: context.currentDrawdown,
      maxDailyDrawdown: config.maxDailyDrawdownFraction,
    });
    return {
      allowed: false,
      rejectionReason: ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED,
      adjustedNotionalUsd: 0,
      checks,
      details: {
        currentDrawdown: context.currentDrawdown,
        maxDailyDrawdownFraction: config.maxDailyDrawdownFraction,
      },
    };
  }

  // 1b. TieredDrawdownBreaker check (haltThreshold = 0.15)
  if (tieredDrawdownBreaker) {
    const state = tieredDrawdownBreaker.getState();
    const ddFrac = state.drawdownPercent / 100;
    if (
      ddFrac >= config.maxDailyDrawdownFraction ||
      !tieredDrawdownBreaker.canOpenNewTrades() ||
      state.tier === 'HALT' ||
      state.tier === 'HARD_STOP'
    ) {
      checks.drawdownBreakerOk = false;
      logger.warn('[ArbitrageRiskGuard] TieredDrawdownBreaker halted trading', {
        tier: state.tier,
        drawdownPercent: state.drawdownPercent,
      });
      return {
        allowed: false,
        rejectionReason: ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED,
        adjustedNotionalUsd: 0,
        checks,
        details: {
          tier: state.tier,
          drawdownPercent: state.drawdownPercent,
          haltedUntil: state.haltedUntil,
        },
      };
    }
  }

  // 1c. DrawdownMonitor check (Redis-backed)
  if (drawdownMonitor) {
    const canTrade = await drawdownMonitor.canTrade();
    if (!canTrade) {
      checks.drawdownBreakerOk = false;
      return {
        allowed: false,
        rejectionReason: ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED,
        adjustedNotionalUsd: 0,
        checks,
        details: { monitorHalted: true },
      };
    }
    const metrics = await drawdownMonitor.getMetrics();
    if (metrics.dailyDrawdown >= config.maxDailyDrawdownFraction) {
      checks.drawdownBreakerOk = false;
      return {
        allowed: false,
        rejectionReason: ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED,
        adjustedNotionalUsd: 0,
        checks,
        details: {
          dailyDrawdown: metrics.dailyDrawdown,
          maxDailyDrawdown: config.maxDailyDrawdownFraction,
        },
      };
    }
  }

  // 1d. LiveExecutionGuard & RiskGateManager status
  const guardStatus = liveExecutionGuard.getStatus();
  if (guardStatus.circuitTripped) {
    checks.drawdownBreakerOk = false;
    return {
      allowed: false,
      rejectionReason: ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED,
      adjustedNotionalUsd: 0,
      checks,
      details: {
        circuitTripped: true,
        consecutiveLosses: guardStatus.consecutiveLosses,
      },
    };
  }

  const guardDailyDrawdown =
    config.capitalUsdc > 0
      ? Math.abs(Math.min(0, guardStatus.dailyPnl)) / config.capitalUsdc
      : 0;
  if (guardDailyDrawdown >= config.maxDailyDrawdownFraction) {
    checks.drawdownBreakerOk = false;
    return {
      allowed: false,
      rejectionReason: ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED,
      adjustedNotionalUsd: 0,
      checks,
      details: {
        guardDailyDrawdown,
        limit: config.maxDailyDrawdownFraction,
      },
    };
  }

  const gateResult = await riskGateManager.check(
    basket.strategyKey ?? 'arbitrage',
  );
  if (!gateResult.allowed) {
    checks.drawdownBreakerOk = false;
    return {
      allowed: false,
      rejectionReason: ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED,
      adjustedNotionalUsd: 0,
      checks,
      details: { reason: gateResult.reason },
    };
  }

  return null;
}
