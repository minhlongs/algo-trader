/**
 * Position Sizing and Notional/Kelly Cap Logic for Arbitrage Risk Guard
 *
 * @module desk/arbitrage/risk/arbitrage-risk-guard-sizing
 */

import { logger } from '../../../shared/utils/logger';
import {
  type ArbitrageRiskConfig,
  type MultiLegArbitrageBasket,
  type ArbitrageBasketLeg,
  type ArbitrageRiskContext,
  type ArbitrageRiskGateChecks,
  type ArbitrageRiskCheckResult,
  ArbitrageRejectionReason,
} from './arbitrage-risk-types';
import type { KellyPositionSizer } from '../../risk/kelly-position-sizer';
import type { LiveExecutionGuard } from '../../execution/live-execution-guard-core';
import type { PolymarketOrder } from '../../execution/polymarket-signer';

export const KELLY_EPSILON = 1e-6;

export interface SizingGateDependencies {
  config: ArbitrageRiskConfig;
  kellyPositionSizer: KellyPositionSizer;
  liveExecutionGuard: LiveExecutionGuard;
}

export function calculateBasketNotional(basket: MultiLegArbitrageBasket): number {
  return (
    basket.totalNotionalUsd ??
    basket.legs.reduce((sum, l) => sum + (l.notionalUsd ?? l.amount * l.price), 0)
  );
}

export function computeQuarterKellySizingFormula(
  requestedNotional: number,
  bankroll: number,
  p: number,
  b: number,
  maxKellyFraction: number,
  maxPerTradeNotionalUsd: number,
): number {
  if (bankroll <= 0 || requestedNotional <= 0 || p <= 0 || b <= 0) return 0;
  const q = 1 - p;
  const fullKelly = (b * p - q) / b;
  if (fullKelly <= 0) return 0;

  const quarterKellyFraction = Math.min(fullKelly * 0.25, maxKellyFraction);
  const kellyNotional = bankroll * quarterKellyFraction;
  return Math.min(requestedNotional, kellyNotional, maxPerTradeNotionalUsd);
}

export function evaluateSizingGates(
  basket: MultiLegArbitrageBasket,
  totalNotionalUsd: number,
  context: ArbitrageRiskContext | undefined,
  checks: ArbitrageRiskGateChecks,
  deps: SizingGateDependencies,
): { errorResult: ArbitrageRiskCheckResult | null; effectiveKellyLimitUsd: number } {
  const { config, kellyPositionSizer, liveExecutionGuard } = deps;

  // Gate 5: Max Trade Notional
  if (totalNotionalUsd > config.maxPerTradeNotionalUsd) {
    checks.notionalCapOk = false;
    logger.warn('[ArbitrageRiskGuard] Basket exceeds max per-trade notional', {
      totalNotionalUsd,
      limit: config.maxPerTradeNotionalUsd,
    });
    return {
      errorResult: {
        allowed: false,
        rejectionReason: ArbitrageRejectionReason.EXCEEDS_NOTIONAL_CAP,
        adjustedNotionalUsd: 0,
        checks,
        details: {
          totalNotionalUsd,
          limit: config.maxPerTradeNotionalUsd,
          maxPerTradeNotionalUsd: config.maxPerTradeNotionalUsd,
        },
      },
      effectiveKellyLimitUsd: 0,
    };
  }

  // Gate 6: Quarter-Kelly Position Sizing
  const winProb = basket.winProbability ?? context?.winProbability;
  const winLoss = basket.winLossRatio ?? context?.winLossRatio;
  const bankroll = context?.portfolioValueUsd ?? config.capitalUsdc;
  let effectiveKellyLimitUsd = 0;

  if (winProb !== undefined && winLoss !== undefined && bankroll > 0) {
    const kellyResult = kellyPositionSizer.calculatePositionSize({
      winProbability: winProb,
      winLossRatio: winLoss,
      portfolioValue: bankroll,
    });

    effectiveKellyLimitUsd = kellyResult.positionSizeUsd;
    const autoAdjust = config.autoAdjustSizing ?? (config as unknown as Record<string, unknown>).autoDownsizeToKelly;

    if (totalNotionalUsd > effectiveKellyLimitUsd + KELLY_EPSILON) {
      if (autoAdjust && effectiveKellyLimitUsd > 0) {
        checks.kellyCapOk = true;
      } else {
        checks.kellyCapOk = false;
        logger.warn('[ArbitrageRiskGuard] Basket exceeds Quarter-Kelly cap', {
          totalNotionalUsd,
          kellyLimit: effectiveKellyLimitUsd,
          fraction: kellyResult.fractionUsed,
        });
        return {
          errorResult: {
            allowed: false,
            rejectionReason: ArbitrageRejectionReason.EXCEEDS_KELLY_CAP,
            adjustedNotionalUsd: Number(effectiveKellyLimitUsd.toFixed(2)),
            checks,
            details: {
              totalNotionalUsd,
              kellyLimit: effectiveKellyLimitUsd,
              maxKellyCapUsd: Number(effectiveKellyLimitUsd.toFixed(2)),
              fraction: kellyResult.fractionUsed,
              suggestedSizeUsd: effectiveKellyLimitUsd,
            },
          },
          effectiveKellyLimitUsd,
        };
      }
    }
  }

  // For Polymarket legs: also validate against LiveExecutionGuard position size
  for (const leg of basket.legs) {
    if (leg.venue.toLowerCase().includes('poly')) {
      const polyOrder: PolymarketOrder = {
        tokenId: leg.symbol,
        price: leg.price,
        size: leg.amount,
        side: leg.side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
        expiration: 0,
        nonce: '',
        feeRateBps: 0,
        signatureType: 0,
      };
      const legGuard = liveExecutionGuard.guardOrder(polyOrder);
      if (!legGuard.approved) {
        checks.notionalCapOk = false;
        return {
          errorResult: {
            allowed: false,
            rejectionReason: ArbitrageRejectionReason.EXCEEDS_NOTIONAL_CAP,
            adjustedNotionalUsd: 0,
            checks,
            details: { reason: legGuard.reason },
          },
          effectiveKellyLimitUsd,
        };
      }
    }
  }

  return { errorResult: null, effectiveKellyLimitUsd };
}
