/**
 * Profitability Evaluator
 * Core synthesis logic evaluating gross spread, fees, gas, and slippage against minimum hurdles.
 */

import {
  type GasConfig,
  type NetProfitabilityAnalysis,
  type NetProfitabilityInput,
  type SlippageModelConfig,
  type VwapSlippageResult,
  NetProfitabilityInputSchema,
} from './profitability-types';
import { calculateLegFee } from './fee-calculator';
import { calculateLegGas } from './gas-calculator';
import { calculateParametricSlippage, calculateVwapSlippage } from './slippage-calculator';
import { buildInvalidResponse, classifyRejection } from './profitability-decision-engine';

export function evaluateNetProfitabilityCore(
  rawInput: NetProfitabilityInput,
  defaultGasConfig: GasConfig,
  defaultSlippageConfig: SlippageModelConfig,
  defaultHurdleBps: number
): NetProfitabilityAnalysis {
  const parseResult = NetProfitabilityInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return buildInvalidResponse(parseResult.error.message);
  }
  const input = parseResult.data;

  const buyPrice = input.buyLeg.price;
  const sellPrice = input.sellLeg.price;
  const effectiveTradeAmount =
    input.tradeAmount ?? input.buyLeg.amount ?? input.sellLeg.amount ?? 1.0;

  if (
    buyPrice <= 0 ||
    sellPrice <= 0 ||
    effectiveTradeAmount <= 0 ||
    !Number.isFinite(buyPrice) ||
    !Number.isFinite(sellPrice) ||
    !Number.isFinite(effectiveTradeAmount)
  ) {
    return buildInvalidResponse('Price and amount must be positive, finite numbers');
  }

  const buyNotionalUsd = buyPrice * effectiveTradeAmount;
  const sellNotionalUsd = sellPrice * effectiveTradeAmount;

  const grossSpreadUsd = (sellPrice - buyPrice) * effectiveTradeAmount;
  const grossSpreadBps = buyPrice > 0 ? ((sellPrice - buyPrice) / buyPrice) * 10_000 : 0;

  if (grossSpreadUsd <= 0) {
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

  const buyFeeCalc = calculateLegFee(input.buyLeg, buyNotionalUsd, input.feeOverrides?.buyFeeRate);
  const sellFeeCalc = calculateLegFee(input.sellLeg, sellNotionalUsd, input.feeOverrides?.sellFeeRate);
  const estimatedBuyFeeUsd = buyFeeCalc.feeUsd;
  const estimatedSellFeeUsd = sellFeeCalc.feeUsd;
  const totalFeesUsd = estimatedBuyFeeUsd + estimatedSellFeeUsd;

  const gasConfig = { ...defaultGasConfig, ...input.gasConfig };
  const buyGasUsd = calculateLegGas(input.buyLeg, gasConfig, input.gasOverrides?.polygonGasUsd);
  const sellGasUsd = calculateLegGas(input.sellLeg, gasConfig, input.gasOverrides?.polygonGasUsd);
  const estimatedGasUsd = buyGasUsd + sellGasUsd;

  const slippageConfig = { ...defaultSlippageConfig, ...input.slippageConfig };
  const slippageMode = input.slippageModel ?? 'auto';

  let buySlippageResult: VwapSlippageResult;
  let sellSlippageResult: VwapSlippageResult;
  let hasZeroDepth = false;

  if ((slippageMode === 'vwap_orderbook' || slippageMode === 'auto') && input.buyLeg.orderBook) {
    if (!input.buyLeg.orderBook.asks || input.buyLeg.orderBook.asks.length === 0) {
      hasZeroDepth = true;
      buySlippageResult = {
        vwap: 0,
        slippageUsd: 0,
        slippageBps: 0,
        filledAmount: 0,
        insufficientLiquidity: true,
      };
    } else {
      buySlippageResult = calculateVwapSlippage(input.buyLeg.orderBook, 'buy', effectiveTradeAmount);
    }
  } else {
    buySlippageResult = calculateParametricSlippage(input.buyLeg.venue, buyNotionalUsd, slippageConfig);
  }

  if ((slippageMode === 'vwap_orderbook' || slippageMode === 'auto') && input.sellLeg.orderBook) {
    if (!input.sellLeg.orderBook.bids || input.sellLeg.orderBook.bids.length === 0) {
      hasZeroDepth = true;
      sellSlippageResult = {
        vwap: 0,
        slippageUsd: 0,
        slippageBps: 0,
        filledAmount: 0,
        insufficientLiquidity: true,
      };
    } else {
      sellSlippageResult = calculateVwapSlippage(input.sellLeg.orderBook, 'sell', effectiveTradeAmount);
    }
  } else {
    sellSlippageResult = calculateParametricSlippage(input.sellLeg.venue, sellNotionalUsd, slippageConfig);
  }

  const estimatedBuySlippageUsd = buySlippageResult.slippageUsd;
  const estimatedSellSlippageUsd = sellSlippageResult.slippageUsd;
  const totalSlippageUsd = estimatedBuySlippageUsd + estimatedSellSlippageUsd;

  const totalCostUsd = totalFeesUsd + estimatedGasUsd + totalSlippageUsd;
  const netProfitUsd = grossSpreadUsd - totalCostUsd;
  const netProfitBps = buyNotionalUsd > 0 ? (netProfitUsd / buyNotionalUsd) * 10_000 : 0;
  const minHurdleBps = input.minHurdleBps ?? defaultHurdleBps;

  const { isProfitable, rejectionReason } = classifyRejection(
    hasZeroDepth,
    buySlippageResult,
    sellSlippageResult,
    grossSpreadUsd,
    totalFeesUsd,
    estimatedGasUsd,
    totalCostUsd,
    netProfitUsd,
    netProfitBps,
    minHurdleBps
  );

  return {
    isProfitable,
    grossSpreadUsd,
    grossSpreadBps,
    estimatedBuyFeeUsd,
    estimatedSellFeeUsd,
    estimatedGasUsd,
    estimatedBuySlippageUsd,
    estimatedSellSlippageUsd,
    totalCostUsd,
    netProfitUsd,
    netProfitBps,
    rejectionReason,
    breakdown: {
      effectiveTradeAmount,
      buyNotionalUsd,
      sellNotionalUsd,
      buyFeeRate: buyFeeCalc.rate,
      sellFeeRate: sellFeeCalc.rate,
      buyVwap: buySlippageResult.vwap > 0 ? buySlippageResult.vwap : undefined,
      sellVwap: sellSlippageResult.vwap > 0 ? sellSlippageResult.vwap : undefined,
      buySlippageBps: buySlippageResult.slippageBps,
      sellSlippageBps: sellSlippageResult.slippageBps,
      hasZeroDepth,
      insufficientLiquidity:
        buySlippageResult.insufficientLiquidity || sellSlippageResult.insufficientLiquidity,
      availableDepthBuy: buySlippageResult.filledAmount,
      availableDepthSell: sellSlippageResult.filledAmount,
    },
  };
}
