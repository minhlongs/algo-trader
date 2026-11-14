/**
 * Profitability Evaluator Helpers
 * Extracted negative spread response and dual-leg slippage resolution helpers.
 */

import type {
  VenueTradeLeg,
  NetProfitabilityAnalysis,
  SlippageModelConfig,
  VwapSlippageResult,
} from './profitability-types';
import { calculateParametricSlippage, calculateVwapSlippage } from './slippage-calculator';
import type { LegFee } from './fee-calculator';

export function buildNegativeSpreadResponse(
  grossSpreadUsd: number,
  grossSpreadBps: number,
  effectiveTradeAmount: number,
  buyNotionalUsd: number,
  sellNotionalUsd: number,
): NetProfitabilityAnalysis {
  return {
    isProfitable: false,
    grossSpreadUsd,
    grossSpreadBps,
    estimatedBuyFeeUsd: 0,
    estimatedSellFeeUsd: 0,
    estimatedGasUsd: 0,
    estimatedBuySlippageUsd: 0,
    estimatedSellSlippageUsd: 0,
    totalCostUsd: 0,
    netProfitUsd: grossSpreadUsd,
    netProfitBps: grossSpreadBps,
    rejectionReason: 'NEGATIVE_GROSS_SPREAD',
    breakdown: {
      effectiveTradeAmount,
      buyNotionalUsd,
      sellNotionalUsd,
      buyFeeRate: 0,
      sellFeeRate: 0,
      buySlippageBps: 0,
      sellSlippageBps: 0,
      hasZeroDepth: false,
      insufficientLiquidity: false,
    },
  };
}

export function evaluateDualLegSlippage(
  buyLeg: VenueTradeLeg,
  sellLeg: VenueTradeLeg,
  effectiveTradeAmount: number,
  buyNotionalUsd: number,
  sellNotionalUsd: number,
  slippageMode: string,
  slippageConfig: SlippageModelConfig,
): {
  buySlippageResult: VwapSlippageResult;
  sellSlippageResult: VwapSlippageResult;
  hasZeroDepth: boolean;
} {
  let buySlippageResult: VwapSlippageResult;
  let sellSlippageResult: VwapSlippageResult;
  let hasZeroDepth = false;

  if ((slippageMode === 'vwap_orderbook' || slippageMode === 'auto') && buyLeg.orderBook) {
    if (!buyLeg.orderBook.asks || buyLeg.orderBook.asks.length === 0) {
      hasZeroDepth = true;
      buySlippageResult = {
        vwap: 0,
        slippageUsd: 0,
        slippageBps: 0,
        filledAmount: 0,
        insufficientLiquidity: true,
      };
    } else {
      buySlippageResult = calculateVwapSlippage(buyLeg.orderBook, 'buy', effectiveTradeAmount);
    }
  } else {
    buySlippageResult = calculateParametricSlippage(buyLeg.venue, buyNotionalUsd, slippageConfig);
  }

  if ((slippageMode === 'vwap_orderbook' || slippageMode === 'auto') && sellLeg.orderBook) {
    if (!sellLeg.orderBook.bids || sellLeg.orderBook.bids.length === 0) {
      hasZeroDepth = true;
      sellSlippageResult = {
        vwap: 0,
        slippageUsd: 0,
        slippageBps: 0,
        filledAmount: 0,
        insufficientLiquidity: true,
      };
    } else {
      sellSlippageResult = calculateVwapSlippage(sellLeg.orderBook, 'sell', effectiveTradeAmount);
    }
  } else {
    sellSlippageResult = calculateParametricSlippage(sellLeg.venue, sellNotionalUsd, slippageConfig);
  }

  return { buySlippageResult, sellSlippageResult, hasZeroDepth };
}

/**
 * Response for a leg whose market the venue would not price. Fees, gas and
 * slippage are reported as 0 because none were computed — the trade is not
 * "free", it is unpriced, and the rejection reason says so.
 */
export function buildFeeScheduleUnavailableResponse(
  buyFee: LegFee,
  sellFee: LegFee,
  amounts: {
    grossSpreadUsd: number;
    grossSpreadBps: number;
    effectiveTradeAmount: number;
    buyNotionalUsd: number;
    sellNotionalUsd: number;
  },
  detail: string,
): NetProfitabilityAnalysis {
  const unpriced = [buyFee, sellFee]
    .filter((fee): fee is Extract<LegFee, { available: false }> => !fee.available)
    .map((fee) => `${fee.venue}:${fee.symbol}`)
    .join(', ');

  return {
    isProfitable: false,
    grossSpreadUsd: amounts.grossSpreadUsd,
    grossSpreadBps: amounts.grossSpreadBps,
    estimatedBuyFeeUsd: 0,
    estimatedSellFeeUsd: 0,
    estimatedGasUsd: 0,
    estimatedBuySlippageUsd: 0,
    estimatedSellSlippageUsd: 0,
    totalCostUsd: 0,
    netProfitUsd: 0,
    netProfitBps: 0,
    rejectionReason: 'FEE_SCHEDULE_UNAVAILABLE',
    breakdown: {
      effectiveTradeAmount: amounts.effectiveTradeAmount,
      buyNotionalUsd: amounts.buyNotionalUsd,
      sellNotionalUsd: amounts.sellNotionalUsd,
      buyFeeRate: 0,
      sellFeeRate: 0,
      buySlippageBps: 0,
      sellSlippageBps: 0,
      hasZeroDepth: false,
      insufficientLiquidity: false,
      feeScheduleUnavailable: `${unpriced} (${detail})`,
    },
  };
}
