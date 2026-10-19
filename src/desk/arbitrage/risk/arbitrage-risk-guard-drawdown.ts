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
} from './arbitrage-risk-types';
import type { LiveExecutionGuard } from '../../execution/live-execution-guard-core';
import type { RiskGateManager } from '../../risk/risk-gate-manager';
import type { TieredDrawdownBreaker } from '../../risk/tiered-drawdown-breaker';
import type { DrawdownMonitor } from '../../risk/drawdown-monitor';
import {
  tripDrawdownRejection,
  isExplicitDrawdownBreached,
  isTieredBreakerHalted,
  computeGuardDailyDrawdownFraction,
} from './arbitrage-risk-guard-drawdown-math';

export {
  tripDrawdownRejection,
  isExplicitDrawdownBreached,
  isTieredBreakerHalted,
  computeGuardDailyDrawdownFraction,
};

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
  if (isExplicitDrawdownBreached(context?.currentDrawdown, config.maxDailyDrawdownFraction)) {
    logger.warn('[ArbitrageRiskGuard] Cumulative daily drawdown breached limit', {
      currentDrawdown: context.currentDrawdown,
      maxDailyDrawdown: config.maxDailyDrawdownFraction,
    });
    return tripDrawdownRejection(checks, {
      currentDrawdown: context.currentDrawdown,
      maxDailyDrawdownFraction: config.maxDailyDrawdownFraction,
    });
  }

  // 1b. TieredDrawdownBreaker check (haltThreshold = 0.15)
  if (tieredDrawdownBreaker) {
    const state = tieredDrawdownBreaker.getState();
    if (
      isTieredBreakerHalted(
        state.drawdownPercent,
        state.tier,
        tieredDrawdownBreaker.canOpenNewTrades(),
        config.maxDailyDrawdownFraction,
      )
    ) {
      logger.warn('[ArbitrageRiskGuard] TieredDrawdownBreaker halted trading', {
        tier: state.tier,
        drawdownPercent: state.drawdownPercent,
      });
      return tripDrawdownRejection(checks, {
        tier: state.tier,
        drawdownPercent: state.drawdownPercent,
        haltedUntil: state.haltedUntil,
      });
    }
  }

  // 1c. DrawdownMonitor check (Redis-backed)
  if (drawdownMonitor) {
    const canTrade = await drawdownMonitor.canTrade();
    if (!canTrade) {
      return tripDrawdownRejection(checks, { monitorHalted: true });
    }
    const metrics = await drawdownMonitor.getMetrics();
    if (metrics.dailyDrawdown >= config.maxDailyDrawdownFraction) {
      return tripDrawdownRejection(checks, {
        dailyDrawdown: metrics.dailyDrawdown,
        maxDailyDrawdown: config.maxDailyDrawdownFraction,
      });
    }
  }

  // 1d. LiveExecutionGuard & RiskGateManager status
  const guardStatus = liveExecutionGuard.getStatus();
  if (guardStatus.circuitTripped) {
    return tripDrawdownRejection(checks, {
      circuitTripped: true,
      consecutiveLosses: guardStatus.consecutiveLosses,
    });
  }

  const guardDailyDrawdown = computeGuardDailyDrawdownFraction(
    guardStatus.dailyPnl,
    config.capitalUsdc,
  );
  if (guardDailyDrawdown >= config.maxDailyDrawdownFraction) {
    return tripDrawdownRejection(checks, {
      guardDailyDrawdown,
      limit: config.maxDailyDrawdownFraction,
    });
  }

  const gateResult = await riskGateManager.check(
    basket.strategyKey ?? 'arbitrage',
  );
  if (!gateResult.allowed) {
    return tripDrawdownRejection(checks, { reason: gateResult.reason });
  }

  return null;
}
