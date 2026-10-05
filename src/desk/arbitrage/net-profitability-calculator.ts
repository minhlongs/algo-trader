/**
 * Net Profitability Calculator
 * Evaluates net arbitrage profitability after accounting for dynamic exchange fees,
 * on-chain Polygon gas costs, and order book depth VWAP slippage.
 */

import {
  type CalculatorConstructorOptions,
  type GasConfig,
  type NetProfitabilityAnalysis,
  type NetProfitabilityInput,
  type RawOrderBookDepth,
  type SlippageModelConfig,
  type VwapSlippageResult,
  GasConfigSchema,
  SlippageModelConfigSchema,
} from './profitability/profitability-types';
import { calculatePolymarketFee } from './profitability/fee-calculator';
import { calculateVwapSlippage } from './profitability/slippage-calculator';
import { evaluateNetProfitabilityCore } from './profitability/profitability-evaluator';
import type { PolymarketCategory } from '../polymarket/polymarket-fee-calculator';

export * from './profitability/profitability-types';
export * from './profitability/fee-calculator';
export * from './profitability/gas-calculator';
export * from './profitability/slippage-calculator';
export * from './profitability/profitability-evaluator';

export class NetProfitabilityCalculator {
  private readonly defaultGasConfig: GasConfig;
  private readonly defaultSlippageConfig: SlippageModelConfig;
  private readonly defaultHurdleBps: number;

  constructor(options?: CalculatorConstructorOptions) {
    const rawGas = { ...options?.gasConfig };
    if (options?.maticPriceUsd !== undefined) {
      rawGas.maticPriceUsd = options.maticPriceUsd;
    }
    this.defaultGasConfig = GasConfigSchema.parse(rawGas);
    this.defaultSlippageConfig = SlippageModelConfigSchema.parse(options?.slippageConfig ?? {});
    this.defaultHurdleBps = options?.defaultHurdleBps ?? 10.0;
  }

  /**
   * Main calculation entry point.
   */
  calculate(rawInput: NetProfitabilityInput): NetProfitabilityAnalysis {
    return this.evaluate(rawInput);
  }

  /**
   * Evaluate net profitability of an arbitrage opportunity.
   * Alias for evaluate() to maintain compatibility across naming conventions.
   */
  evaluateNetProfitability(rawInput: NetProfitabilityInput): NetProfitabilityAnalysis {
    return this.evaluate(rawInput);
  }

  /**
   * Pure evaluation logic.
   */
  evaluate(rawInput: NetProfitabilityInput): NetProfitabilityAnalysis {
    return evaluateNetProfitabilityCore(
      rawInput,
      this.defaultGasConfig,
      this.defaultSlippageConfig,
      this.defaultHurdleBps
    );
  }

  /**
   * Helper: Calculate VWAP slippage across order book levels.
   */
  calculateVwapSlippage(
    orderBook: RawOrderBookDepth,
    side: 'buy' | 'sell',
    targetAmount: number
  ): VwapSlippageResult {
    return calculateVwapSlippage(orderBook, side, targetAmount);
  }

  /**
   * Helper: Calculate Polymarket dynamic fee rate and dollar amount.
   */
  calculatePolymarketFee(
    category: PolymarketCategory,
    probability: number,
    notionalUsd: number
  ): { rate: number; feeUsd: number; rebateUsd: number } {
    return calculatePolymarketFee(category, probability, notionalUsd);
  }

  /**
   * Adapter: Calculate net profitability directly from a SpreadDetector ArbitrageOpportunity.
   */
  fromSpreadOpportunity(
    opp: {
      buyExchange: string;
      sellExchange: string;
      symbol: string;
      buyPrice: number;
      sellPrice: number;
      amount?: number;
      id?: string;
    },
    options?: {
      minHurdleBps?: number;
      settlementType?: 'off_chain_clob' | 'on_chain_settle';
      polymarketCategory?: PolymarketCategory;
    }
  ): NetProfitabilityAnalysis {
    const amount = opp.amount ?? 1.0;
    return this.calculate({
      buyLeg: {
        venue: opp.buyExchange,
        symbol: opp.symbol,
        side: 'buy',
        price: opp.buyPrice,
        amount,
        settlementType: options?.settlementType ?? 'off_chain_clob',
        polymarketCategory: options?.polymarketCategory,
      },
      sellLeg: {
        venue: opp.sellExchange,
        symbol: opp.symbol,
        side: 'sell',
        price: opp.sellPrice,
        amount,
        settlementType: options?.settlementType ?? 'off_chain_clob',
        polymarketCategory: options?.polymarketCategory,
      },
      tradeAmount: amount,
      minHurdleBps: options?.minHurdleBps ?? this.defaultHurdleBps,
    });
  }
}
