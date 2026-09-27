/**
 * Pre-Trade Risk Evaluation Pipeline and Helpers for Arbitrage Risk Guard
 *
 * @module desk/arbitrage/risk/arbitrage-risk-guard-pipeline
 */

import type {
  ArbitrageRiskConfig,
  MultiLegArbitrageBasket,
  ArbitrageRiskCheckResult,
  ArbitrageRiskGateChecks,
  ArbitrageRiskContext,
  ArbitrageRiskCheckParams,
} from './arbitrage-risk-types';
import type { LiveExecutionGuard } from '../../execution/live-execution-guard-core';
import type { RiskGateManager } from '../../risk/risk-gate-manager';
import type { KellyPositionSizer } from '../../risk/kelly-position-sizer';
import type { TieredDrawdownBreaker } from '../../risk/tiered-drawdown-breaker';
import type { DrawdownMonitor } from '../../risk/drawdown-monitor';
import type { CircuitBreaker } from '../../risk/circuit-breaker';
import type { SpreadDetector } from '../spread-detector';
import { evaluateDrawdownBreaker } from './arbitrage-risk-guard-drawdown';
import {
  evaluateVenueLatency,
  verifyLiveCredentials,
} from './arbitrage-risk-guard-latency-credentials';
import { verifyVenueBalances } from './arbitrage-risk-guard-balance';
import {
  calculateBasketNotional,
  evaluateSizingGates,
  KELLY_EPSILON,
} from './arbitrage-risk-guard-sizing';
import type { ExposureTracker } from './arbitrage-risk-guard-exposure';

export interface GateEvaluationContext {
  config: ArbitrageRiskConfig;
  liveExecutionGuard: LiveExecutionGuard;
  riskGateManager: RiskGateManager;
  kellyPositionSizer: KellyPositionSizer;
  tieredDrawdownBreaker?: TieredDrawdownBreaker;
  drawdownMonitor?: DrawdownMonitor;
  circuitBreaker?: CircuitBreaker;
  spreadDetector?: SpreadDetector;
  exposureTracker: ExposureTracker;
}

export async function runGatePipeline(
  basket: MultiLegArbitrageBasket,
  context: ArbitrageRiskContext | undefined,
  deps: GateEvaluationContext,
): Promise<ArbitrageRiskCheckResult> {
  const checks: ArbitrageRiskGateChecks = {
    drawdownBreakerOk: true,
    venueLatencyOk: true,
    kellyCapOk: true,
    notionalCapOk: true,
    venueCapOk: true,
    symbolCapOk: true,
    venueBalanceOk: true,
    credentialsOk: true,
  };

  const totalNotionalUsd = calculateBasketNotional(basket);

  // Gate 1: Drawdown Breaker
  const ddResult = await evaluateDrawdownBreaker(basket, context, checks, {
    config: deps.config,
    liveExecutionGuard: deps.liveExecutionGuard,
    riskGateManager: deps.riskGateManager,
    tieredDrawdownBreaker: deps.tieredDrawdownBreaker,
    drawdownMonitor: deps.drawdownMonitor,
  });
  if (ddResult) return ddResult;

  // Gate 2: Venue Latency
  const latResult = await evaluateVenueLatency(basket, context, checks, {
    config: deps.config,
    circuitBreaker: deps.circuitBreaker,
    spreadDetector: deps.spreadDetector,
  });
  if (latResult) return latResult;

  // Gate 3: Operating Mode Credentials
  if (deps.config.mode === 'live') {
    const credentialsOk = verifyLiveCredentials(basket, context);
    if (!credentialsOk) {
      checks.credentialsOk = false;
      return {
        allowed: false,
        rejectionReason: 'MISSING_LIVE_CREDENTIALS',
        adjustedNotionalUsd: 0,
        checks,
        details: { mode: 'live' },
      };
    }
  }

  // Gate 4: Venue Balance Verification
  const balanceCheck = verifyVenueBalances(basket, deps.config, context);
  if (!balanceCheck.ok) {
    checks.venueBalanceOk = false;
    return {
      allowed: false,
      rejectionReason: 'INSUFFICIENT_VENUE_BALANCE',
      adjustedNotionalUsd: 0,
      checks,
      details: balanceCheck.details,
    };
  }

  // Gate 5 & 6: Notional & Kelly Caps
  const sizingResult = evaluateSizingGates(
    basket,
    totalNotionalUsd,
    context,
    checks,
    {
      config: deps.config,
      kellyPositionSizer: deps.kellyPositionSizer,
      liveExecutionGuard: deps.liveExecutionGuard,
    },
  );
  if (sizingResult.errorResult) return sizingResult.errorResult;

  // Gate 7: Open Exposure Limits
  const exposureResult = deps.exposureTracker.checkExposureGates(
    basket,
    deps.config,
    checks,
  );
  if (exposureResult) return exposureResult;

  const finalAdjustedNotional = Math.min(
    totalNotionalUsd,
    sizingResult.effectiveKellyLimitUsd > 0
      ? sizingResult.effectiveKellyLimitUsd + KELLY_EPSILON >= totalNotionalUsd
        ? totalNotionalUsd
        : sizingResult.effectiveKellyLimitUsd
      : totalNotionalUsd,
    deps.config.maxPerTradeNotionalUsd,
  );

  return {
    allowed: true,
    adjustedNotionalUsd: Number(finalAdjustedNotional.toFixed(2)),
    checks,
  };
}

export function adaptPreTradeParamsToBasket(
  params: ArbitrageRiskCheckParams,
  context?: ArbitrageRiskContext,
): { basket: MultiLegArbitrageBasket; mergedContext: ArbitrageRiskContext } {
  const basket: MultiLegArbitrageBasket = {
    basketId: `basket-${Date.now()}`,
    legs: [
      {
        legId: 'leg-buy',
        venue: params.buyVenue,
        symbol: params.symbol,
        side: 'buy',
        amount: params.tradeNotionalUsd,
        price: 1.0,
        notionalUsd: params.tradeNotionalUsd,
      },
      {
        legId: 'leg-sell',
        venue: params.sellVenue,
        symbol: params.symbol,
        side: 'sell',
        amount: params.tradeNotionalUsd,
        price: 1.0,
        notionalUsd: params.tradeNotionalUsd,
      },
    ],
    totalNotionalUsd: params.tradeNotionalUsd,
    winProbability: params.winProbability,
    winLossRatio: params.winLossRatio,
  };

  const mergedContext: ArbitrageRiskContext = {
    ...context,
    venueLatencies: { ...params.venueLatencies, ...context?.venueLatencies },
    venueBalances: { ...params.venueBalances, ...context?.venueBalances },
    currentDrawdown: params.currentDrawdown ?? context?.currentDrawdown,
    portfolioValueUsd: params.bankrollUsd ?? context?.portfolioValueUsd,
    winProbability: params.winProbability ?? context?.winProbability,
    winLossRatio: params.winLossRatio ?? context?.winLossRatio,
  };

  return { basket, mergedContext };
}
