/**
 * Profitability Evaluator
 * Core synthesis logic evaluating gross spread, fees, gas, and slippage against minimum hurdles.
 */

import {
  type GasConfig,
  type NetProfitabilityAnalysis,
  type NetProfitabilityInput,
  type SlippageModelConfig,
  NetProfitabilityInputSchema,
} from './profitability-types';
import { calculateLegFee } from './fee-calculator';
import { calculateLegGas } from './gas-calculator';
import { buildInvalidResponse, classifyRejection } from './profitability-decision-engine';
import {
  buildNegativeSpreadResponse,
  evaluateDualLegSlippage,
} from './profitability-evaluator-helpers';

export * from './profitability-evaluator-helpers';

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
    return buildNegativeSpreadResponse(
      grossSpreadUsd,
      grossSpreadBps,
      effectiveTradeAmount,
      buyNotionalUsd,
      sellNotionalUsd,
    );
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

  const { buySlippageResult, sellSlippageResult, hasZeroDepth } = evaluateDualLegSlippage(
    input.buyLeg,
    input.sellLeg,
    effectiveTradeAmount,
    buyNotionalUsd,
    sellNotionalUsd,
    slippageMode,
    slippageConfig,
  );

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
