/**
 * Empirical Challenger Stress & Property Test Suite for Milestone 1:
 * NetProfitabilityCalculator Robustness Verification
 *
 * Focus Areas:
 * 1. Extreme Order Book Depths (0 depth, thin liquidity, deep liquidity, partial fills)
 * 2. Negative Spreads, Zero Price, and Inverted Bids/Asks
 * 3. Boundary Fee Calculations (0%, 100%, fee overrides, maker rebates, category exemptions)
 * 4. Exact Hurdle Boundaries (9.99 bps vs 10.00 bps, floating-point precision vulnerability)
 * 5. Mathematical & Invariant Fuzzing / Property Testing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  NetProfitabilityCalculator,
  type RawOrderBookDepth,
} from '../../../src/desk/arbitrage/net-profitability-calculator';

describe('Challenger M1-1: NetProfitabilityCalculator Empirical Stress Suite', () => {
  let calculator: NetProfitabilityCalculator;

  beforeEach(() => {
    calculator = new NetProfitabilityCalculator({ defaultHurdleBps: 10.0 });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Extreme Order Book Depths
  // ═══════════════════════════════════════════════════════════════════════════
  describe('1. Extreme Order Book Depths', () => {
    it('1.1: rejects trade when buy leg has explicitly empty asks array (0 depth)', () => {
      const result = calculator.evaluate({
        buyLeg: {
          venue: 'binance',
          symbol: 'BTC/USDT',
          price: 50000,
          side: 'buy',
          orderBook: { asks: [], bids: [] },
        },
        sellLeg: {
          venue: 'bybit',
          symbol: 'BTC/USDT',
          price: 50500,
          side: 'sell',
        },
        tradeAmount: 1.0,
      });

      expect(result.isProfitable).toBe(false);
      expect(result.rejectionReason).toBe('ZERO_ORDERBOOK_DEPTH');
      expect(result.breakdown?.hasZeroDepth).toBe(true);
    });

    it('1.2: rejects trade when sell leg has explicitly empty bids array (0 depth)', () => {
      const result = calculator.evaluate({
        buyLeg: {
          venue: 'binance',
          symbol: 'BTC/USDT',
          price: 50000,
          side: 'buy',
          orderBook: { asks: [[50000, 10]], bids: [] },
        },
        sellLeg: {
          venue: 'bybit',
          symbol: 'BTC/USDT',
          price: 50500,
          side: 'sell',
          orderBook: { asks: [], bids: [] },
        },
        tradeAmount: 1.0,
      });

      expect(result.isProfitable).toBe(false);
      expect(result.rejectionReason).toBe('ZERO_ORDERBOOK_DEPTH');
      expect(result.breakdown?.hasZeroDepth).toBe(true);
    });

    it('1.3: flags INSUFFICIENT_LIQUIDITY when book depth is strictly less than tradeAmount', () => {
      // Requested amount = 10 BTC, but book asks only provide 2 BTC
      const result = calculator.evaluate({
        buyLeg: {
          venue: 'binance',
          symbol: 'BTC/USDT',
          price: 50000,
          side: 'buy',
          orderBook: {
            asks: [
              [50000, 1.0],
              [50010, 1.0],
            ],
            bids: [],
          },
        },
        sellLeg: {
          venue: 'bybit',
          symbol: 'BTC/USDT',
          price: 51000,
          side: 'sell',
        },
        tradeAmount: 10.0,
      });

      expect(result.isProfitable).toBe(false);
      expect(result.rejectionReason).toBe('INSUFFICIENT_LIQUIDITY');
      expect(result.breakdown?.insufficientLiquidity).toBe(true);
      expect(result.breakdown?.availableDepthBuy).toBe(2.0);
    });

    it('1.4: massive VWAP slippage on thin liquidity flips gross profit into rejection', () => {
      // Buy 10 units: 1 unit at 100, 9 units at 150 (50% higher!)
      // VWAP = (1*100 + 9*150) / 10 = 1450 / 10 = 145.00
      // Best ask = 100. Slippage = 45 per unit = 4500 bps!
      // Sell venue price = 110 (10% gross spread over best ask 100 = 1000 bps gross spread)
      // Because VWAP is 145, effective execution costs far exceed sell price 110!
      const result = calculator.evaluate({
        buyLeg: {
          venue: 'binance',
          symbol: 'XYZ/USDT',
          price: 100,
          side: 'buy',
          orderBook: {
            asks: [
              [100, 1],
              [150, 9],
            ],
            bids: [],
          },
        },
        sellLeg: {
          venue: 'bybit',
          symbol: 'XYZ/USDT',
          price: 110,
          side: 'sell',
        },
        tradeAmount: 10,
      });

      expect(result.isProfitable).toBe(false);
      expect(result.breakdown?.buyVwap).toBe(145);
      expect(result.estimatedBuySlippageUsd).toBe(450); // (145 - 100) * 10
      expect(result.breakdown?.buySlippageBps).toBe(4500);
      expect(result.rejectionReason).toBe('BELOW_HURDLE');
      expect(result.netProfitUsd).toBeLessThan(0);
    });

    it('1.5: deep liquidity yields zero slippage and matches best price exactly', () => {
      // 1,000,000 units available at best ask 100
      const result = calculator.evaluate({
        buyLeg: {
          venue: 'binance',
          symbol: 'XYZ/USDT',
          price: 100,
          side: 'buy',
          orderBook: {
            asks: [[100, 1_000_000]],
            bids: [],
          },
        },
        sellLeg: {
          venue: 'bybit',
          symbol: 'XYZ/USDT',
          price: 100.50, // 50 bps gross
          side: 'sell',
          orderBook: {
            asks: [],
            bids: [[100.50, 1_000_000]],
          },
        },
        tradeAmount: 100,
        feeOverrides: { buyFeeRate: 0.001, sellFeeRate: 0.001 }, // 20 bps total fee
      });

      expect(result.estimatedBuySlippageUsd).toBe(0);
      expect(result.estimatedSellSlippageUsd).toBe(0);
      expect(result.breakdown?.buyVwap).toBe(100);
      expect(result.breakdown?.sellVwap).toBe(100.50);
      expect(result.grossSpreadBps).toBe(50);
      // Net return = 50 bps gross - 20.05 bps fees = ~29.9 bps >= 10 bps hurdle
      expect(result.isProfitable).toBe(true);
      expect(result.netProfitBps).toBeCloseTo(29.95, 1);
    });

    it('1.6: calculateVwapSlippage handles direct empty book query safely without crashing', () => {
      const emptyBookResult = calculator.calculateVwapSlippage({ asks: [], bids: [] }, 'buy', 10);
      expect(emptyBookResult.vwap).toBe(0);
      expect(emptyBookResult.slippageUsd).toBe(0);
      expect(emptyBookResult.slippageBps).toBe(0);
      expect(emptyBookResult.filledAmount).toBe(0);
      expect(emptyBookResult.insufficientLiquidity).toBe(true);

      const zeroAmountResult = calculator.calculateVwapSlippage({ asks: [[100, 10]], bids: [] }, 'buy', 0);
      expect(zeroAmountResult.insufficientLiquidity).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Negative Spreads, Zero Price, and Inverted Bids/Asks
  // ═══════════════════════════════════════════════════════════════════════════
  describe('2. Negative Spreads, Zero Price, and Inverted Bids/Asks', () => {
    it('2.1: immediately rejects negative gross spread with NEGATIVE_GROSS_SPREAD', () => {
      const result = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 50500, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 50000, side: 'sell' },
        tradeAmount: 1.0,
      });

      expect(result.isProfitable).toBe(false);
      expect(result.grossSpreadUsd).toBe(-500);
      expect(result.grossSpreadBps).toBeCloseTo(-99.01, 1);
      expect(result.rejectionReason).toBe('NEGATIVE_GROSS_SPREAD');
      expect(result.totalCostUsd).toBe(0);
    });

    it('2.2: immediately rejects zero gross spread (sellPrice === buyPrice)', () => {
      const result = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 50000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 50000, side: 'sell' },
        tradeAmount: 1.0,
      });

      expect(result.isProfitable).toBe(false);
      expect(result.grossSpreadUsd).toBe(0);
      expect(result.rejectionReason).toBe('NEGATIVE_GROSS_SPREAD');
    });

    it('2.3: rejects zero buy price with INVALID_INPUT', () => {
      const result = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 0, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 50000, side: 'sell' },
        tradeAmount: 1.0,
      });

      expect(result.isProfitable).toBe(false);
      expect(result.rejectionReason).toBe('INVALID_INPUT');
    });

    it('2.4: rejects zero sell price with INVALID_INPUT', () => {
      const result = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 50000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 0, side: 'sell' },
        tradeAmount: 1.0,
      });

      expect(result.isProfitable).toBe(false);
      expect(result.rejectionReason).toBe('INVALID_INPUT');
    });

    it('2.5: rejects negative prices with INVALID_INPUT', () => {
      const result1 = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: -50000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 50000, side: 'sell' },
        tradeAmount: 1.0,
      });
      expect(result1.isProfitable).toBe(false);
      expect(result1.rejectionReason).toBe('INVALID_INPUT');

      const result2 = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 50000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: -50000, side: 'sell' },
        tradeAmount: 1.0,
      });
      expect(result2.isProfitable).toBe(false);
      expect(result2.rejectionReason).toBe('INVALID_INPUT');
    });

    it('2.6: rejects non-finite price or amount (NaN, Infinity)', () => {
      const nanPrice = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: NaN, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 50000, side: 'sell' },
        tradeAmount: 1.0,
      });
      expect(nanPrice.isProfitable).toBe(false);
      expect(nanPrice.rejectionReason).toBe('INVALID_INPUT');

      const infAmount = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 50000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 51000, side: 'sell' },
        tradeAmount: Infinity,
      });
      expect(infAmount.isProfitable).toBe(false);
      expect(infAmount.rejectionReason).toBe('INVALID_INPUT');
    });

    it('2.7: sorts inverted ask levels ascending so cheapest ask is consumed first', () => {
      // Asks provided in reverse/unsorted order: [105, 102, 100]
      const orderBook: RawOrderBookDepth = {
        asks: [
          [105, 5],
          [102, 3],
          [100, 2],
        ],
        bids: [],
      };

      // Buying 5 units should consume 2 @ 100 and 3 @ 102 -> VWAP 101.20
      const res = calculator.calculateVwapSlippage(orderBook, 'buy', 5);
      expect(res.vwap).toBeCloseTo(101.20, 2);
      expect(res.slippageBps).toBeCloseTo(120, 1);
    });

    it('2.8: sorts inverted bid levels descending so highest bid is consumed first', () => {
      // Bids provided in reverse/unsorted order: [100, 103, 105]
      const orderBook: RawOrderBookDepth = {
        asks: [],
        bids: [
          [100, 5],
          [103, 2],
          [105, 3],
        ],
      };

      // Selling 5 units should consume 3 @ 105 and 2 @ 103 -> VWAP 104.20
      const res = calculator.calculateVwapSlippage(orderBook, 'sell', 5);
      expect(res.vwap).toBeCloseTo(104.20, 2);
      expect(res.slippageBps).toBeCloseTo(76.19, 1);
    });

    it('2.9: filters non-positive levels in calculateVwapSlippage gracefully', () => {
      const orderBook: RawOrderBookDepth = {
        asks: [
          [0, 10], // invalid price
          [-10, 5], // negative price
          [100, 0], // zero size
          [100, 5], // valid
          [102, 5], // valid
        ],
        bids: [],
      };

      const res = calculator.calculateVwapSlippage(orderBook, 'buy', 5);
      expect(res.vwap).toBe(100);
      expect(res.filledAmount).toBe(5);
      expect(res.insufficientLiquidity).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Boundary Fee Calculations
  // ═══════════════════════════════════════════════════════════════════════════
  describe('3. Boundary Fee Calculations', () => {
    it('3.1: calculates zero fees (0.00%) correctly with feeOverrides', () => {
      const result = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 50000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 50100, side: 'sell' }, // 20 bps gross ($100)
        tradeAmount: 1.0,
        feeOverrides: { buyFeeRate: 0, sellFeeRate: 0 },
        slippageConfig: { cexBaseSlippageBps: 0, cexImpactFactorBps: 0 },
      });

      expect(result.estimatedBuyFeeUsd).toBe(0);
      expect(result.estimatedSellFeeUsd).toBe(0);
      expect(result.totalCostUsd).toBe(0);
      expect(result.netProfitUsd).toBe(100);
      expect(result.netProfitBps).toBe(20);
      expect(result.isProfitable).toBe(true);
    });

    it('3.2: rejects 100% fee rate override as MASSIVE_FEE_SPIKE when it wipes out spread', () => {
      const result = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 50000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 50500, side: 'sell' }, // 100 bps gross ($500)
        tradeAmount: 1.0,
        feeOverrides: { buyFeeRate: 1.0, sellFeeRate: 1.0 }, // 100% fee on buy and sell!
      });

      // Buy fee = $50,000, Sell fee = $50,500. Total fees = $100,500 >> $500 spread
      expect(result.isProfitable).toBe(false);
      expect(result.rejectionReason).toBe('MASSIVE_FEE_SPIKE');
      expect(result.estimatedBuyFeeUsd).toBe(50000);
      expect(result.estimatedSellFeeUsd).toBe(50500);
    });

    it('3.3: rejects feeOverrides exceeding 100% (> 1.0) with INVALID_INPUT', () => {
      const result = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 50000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 50500, side: 'sell' },
        tradeAmount: 1.0,
        feeOverrides: { buyFeeRate: 1.5 }, // 150% fee is invalid input
      });

      expect(result.isProfitable).toBe(false);
      expect(result.rejectionReason).toBe('INVALID_INPUT');
    });

    it('3.4: rejects negative feeOverrides (< 0.0) with INVALID_INPUT', () => {
      const result = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 50000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 50500, side: 'sell' },
        tradeAmount: 1.0,
        feeOverrides: { buyFeeRate: -0.01 }, // Negative fee override rejected by schema
      });

      expect(result.isProfitable).toBe(false);
      expect(result.rejectionReason).toBe('INVALID_INPUT');
    });

    it('3.5: maker rebate on Polymarket reduces total costs and enhances net profit', () => {
      // In category 'finance', taker fee is 20 bps (0.0020), maker rebate is 50% = 10 bps (0.0010)
      const resultWithMaker = calculator.evaluate({
        buyLeg: {
          venue: 'polymarket',
          symbol: 'tok-fin',
          price: 0.50,
          side: 'buy',
          orderType: 'maker',
          polymarketCategory: 'finance',
        },
        sellLeg: {
          venue: 'binance',
          symbol: 'tok-fin',
          price: 0.5020, // 40 bps gross spread ($4.00 on $1000 notional)
          side: 'sell',
        },
        tradeAmount: 2000, // $1000 buy notional, $1004 sell notional
        slippageConfig: { cexBaseSlippageBps: 0, cexImpactFactorBps: 0, polyBaseSlippageBps: 0, polyImpactFactorBps: 0 },
      });

      // Buy fee (maker rebate) = -$1.00 (-10 bps)
      expect(resultWithMaker.estimatedBuyFeeUsd).toBeCloseTo(-1.00, 2);
      // Sell fee (Binance 10 bps) = $1.004
      expect(resultWithMaker.estimatedSellFeeUsd).toBeCloseTo(1.004, 3);
      // Net fee is only $0.004!
      expect(resultWithMaker.totalCostUsd).toBeCloseTo(0.004, 2);
      // Gross spread = $4.00. Net profit = $3.996 = ~39.96 bps >= 10 bps hurdle
      expect(resultWithMaker.isProfitable).toBe(true);
      expect(resultWithMaker.netProfitBps).toBeCloseTo(39.96, 1);
    });

    it('3.6: category exemption on Polymarket (e.g. geopolitics) charges exactly 0 bps fee', () => {
      const feeResult = calculator.calculatePolymarketFee('geopolitics', 0.50, 10000);
      expect(feeResult.rate).toBe(0);
      expect(feeResult.feeUsd).toBe(0);
      expect(feeResult.rebateUsd).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Hurdle Boundary Testing (9.99 bps vs 10.00 bps)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('4. Hurdle Boundary Testing (9.99 bps vs 10.00 bps)', () => {
    const zeroCostConfig = {
      feeOverrides: { buyFeeRate: 0, sellFeeRate: 0 },
      slippageConfig: { cexBaseSlippageBps: 0, cexImpactFactorBps: 0 },
      minHurdleBps: 10.00,
    };

    it('4.1: rejects trade when net return is exactly 9.99 bps (< 10.00 bps hurdle) with BELOW_HURDLE', () => {
      // Buy 10000, Sell 10009.99 -> Gross spread 9.99 USD on 10,000 USD notional = 9.99 bps
      const result = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 10000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 10009.99, side: 'sell' },
        tradeAmount: 1,
        ...zeroCostConfig,
      });

      expect(result.netProfitBps).toBeCloseTo(9.99, 2);
      expect(result.isProfitable).toBe(false);
      expect(result.rejectionReason).toBe('BELOW_HURDLE');
    });

    it('4.2a: accepts trade when net return is exactly 10.00 bps with exact integer prices', () => {
      // Buy @ 1000, Sell @ 1001 with 10 units -> $10.00 spread on $10,000 notional = exactly 10.0000 bps
      const result = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 1000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 1001, side: 'sell' },
        tradeAmount: 10,
        ...zeroCostConfig,
      });

      expect(result.netProfitBps).toBe(10);
      expect(result.isProfitable).toBe(true);
      expect(result.rejectionReason).toBeUndefined();
    });

    it('4.2b: EMPIRICAL FINDING - demonstrates IEEE 754 precision loss on decimal prices at hurdle boundary', () => {
      // In decimal prices: buyPrice = 100.0, sellPrice = 100.1000
      // Mathematically, (100.10 - 100.0) / 100.0 = 0.0010 = exactly 10.00 bps
      // However, 100.10 in IEEE 754 float yields 9.999999999999432 bps
      // With HURDLE_EPSILON_BPS (1e-6) margin, the trade is correctly admitted
      const result = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 100.0, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 100.1000, side: 'sell' },
        tradeAmount: 100,
        ...zeroCostConfig,
      });

      // Floating-point artifact is safely bridged by epsilon margin
      expect(result.netProfitBps).toBeLessThan(10.00);
      expect(result.netProfitBps).toBeCloseTo(10.00, 10);
      expect(result.isProfitable).toBe(true);
      expect(result.rejectionReason).toBeUndefined();
    });

    it('4.3: accepts trade when net return is 10.01 bps (> 10.00 bps hurdle)', () => {
      // Buy @ 10000, Sell @ 10010.01 -> Gross spread 10.01 USD on 10,000 USD notional = 10.01 bps
      const result = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 10000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 10010.01, side: 'sell' },
        tradeAmount: 1,
        ...zeroCostConfig,
      });

      expect(result.netProfitBps).toBeCloseTo(10.01, 2);
      expect(result.isProfitable).toBe(true);
      expect(result.rejectionReason).toBeUndefined();
    });

    it('4.4: verifies sub-basis point threshold behavior at 9.999 bps', () => {
      const result = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 10000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 10009.999, side: 'sell' },
        tradeAmount: 1,
        ...zeroCostConfig,
      });

      expect(result.netProfitBps).toBeCloseTo(9.999, 3);
      expect(result.netProfitBps).toBeLessThan(10.00);
      expect(result.isProfitable).toBe(false);
      expect(result.rejectionReason).toBe('BELOW_HURDLE');
    });

    it('4.5: verifies custom minHurdleBps threshold (e.g. 25.00 bps)', () => {
      const result24 = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 10000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 10024.99, side: 'sell' },
        tradeAmount: 1,
        ...zeroCostConfig,
        minHurdleBps: 25.00,
      });
      expect(result24.netProfitBps).toBeCloseTo(24.99, 2);
      expect(result24.isProfitable).toBe(false);
      expect(result24.rejectionReason).toBe('BELOW_HURDLE');

      const result25 = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 1000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 1002.50, side: 'sell' },
        tradeAmount: 10,
        ...zeroCostConfig,
        minHurdleBps: 25.00,
      });
      expect(result25.netProfitBps).toBeCloseTo(25.0, 2);
      expect(result25.isProfitable).toBe(true);
      expect(result25.rejectionReason).toBeUndefined();
    });

    it('4.6a: zero net profit caused by fees is rejected with MASSIVE_FEE_SPIKE', () => {
      // Gross spread = $20, Total fees = $20. Net profit = $0.00.
      const result = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 10000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 10020, side: 'sell' },
        tradeAmount: 1.0,
        feeOverrides: { buyFeeRate: 0.002, sellFeeRate: 0 }, // Fees ($20) equal spread ($20)
        slippageConfig: { cexBaseSlippageBps: 0, cexImpactFactorBps: 0 },
        minHurdleBps: 0.0,
      });

      expect(result.netProfitUsd).toBe(0);
      expect(result.isProfitable).toBe(false);
      expect(result.rejectionReason).toBe('MASSIVE_FEE_SPIKE');
    });

    it('4.6b: zero net profit caused by slippage is rejected with BELOW_HURDLE', () => {
      // Buy 100 units at 100, sell at 100.10 -> gross spread = 10 USD
      // Slippage consumes 8 USD, fee consumes 2 USD -> total cost = 10 USD
      const result = calculator.evaluate({
        buyLeg: {
          venue: 'binance',
          symbol: 'BTC/USDT',
          price: 100,
          side: 'buy',
          orderBook: { asks: [[100, 20], [100.10, 80]], bids: [] },
        },
        sellLeg: {
          venue: 'bybit',
          symbol: 'BTC/USDT',
          price: 100.10,
          side: 'sell',
          orderBook: { asks: [], bids: [[100.10, 200]] },
        },
        tradeAmount: 100,
        feeOverrides: { buyFeeRate: 0.0002, sellFeeRate: 0 },
        minHurdleBps: 0.0,
      });

      expect(result.netProfitUsd).toBeLessThanOrEqual(0.0001);
      expect(result.isProfitable).toBe(false);
      expect(result.rejectionReason).toBe('BELOW_HURDLE');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Mathematical & Invariant Fuzzing / Property Testing
  // ═══════════════════════════════════════════════════════════════════════════
  describe('5. Mathematical & Invariant Fuzzing / Property Testing', () => {
    it('5.1: invariant: totalCostUsd == sum of fees, gas, and slippage across 100 random configs', () => {
      for (let i = 0; i < 100; i++) {
        const buyPrice = 100 + Math.random() * 1000;
        const sellPrice = buyPrice * (1 + (Math.random() * 0.05 - 0.01)); // -1% to +4%
        const amount = 0.1 + Math.random() * 10;
        const buyFee = Math.random() * 0.005; // 0 to 50 bps
        const sellFee = Math.random() * 0.005;
        const gasOverride = Math.random() * 0.50; // 0 to 50 cents

        const result = calculator.evaluate({
          buyLeg: { venue: 'binance', symbol: 'TEST/USDT', price: buyPrice, side: 'buy' },
          sellLeg: { venue: 'bybit', symbol: 'TEST/USDT', price: sellPrice, side: 'sell' },
          tradeAmount: amount,
          feeOverrides: { buyFeeRate: buyFee, sellFeeRate: sellFee },
          gasOverrides: { polygonGasUsd: gasOverride },
        });

        if (result.rejectionReason === 'NEGATIVE_GROSS_SPREAD') {
          expect(result.isProfitable).toBe(false);
          expect(result.grossSpreadUsd).toBeLessThanOrEqual(0);
          continue;
        }

        const expectedTotalCost =
          result.estimatedBuyFeeUsd +
          result.estimatedSellFeeUsd +
          result.estimatedGasUsd +
          result.estimatedBuySlippageUsd +
          result.estimatedSellSlippageUsd;

        expect(result.totalCostUsd).toBeCloseTo(expectedTotalCost, 6);
        expect(result.netProfitUsd).toBeCloseTo(result.grossSpreadUsd - result.totalCostUsd, 6);
      }
    });

    it('5.2: invariant: isProfitable === true strictly implies all gates passed', () => {
      for (let i = 0; i < 100; i++) {
        const buyPrice = 50 + Math.random() * 500;
        const sellPrice = buyPrice * (1 + Math.random() * 0.04); // strictly positive spread
        const amount = 1 + Math.random() * 5;
        const hurdle = 5 + Math.random() * 20;

        const result = calculator.evaluate({
          buyLeg: { venue: 'binance', symbol: 'TEST/USDT', price: buyPrice, side: 'buy' },
          sellLeg: { venue: 'bybit', symbol: 'TEST/USDT', price: sellPrice, side: 'sell' },
          tradeAmount: amount,
          minHurdleBps: hurdle,
        });

        if (result.isProfitable) {
          expect(result.grossSpreadUsd).toBeGreaterThan(0);
          expect(result.netProfitUsd).toBeGreaterThan(0);
          expect(result.netProfitBps).toBeGreaterThanOrEqual(hurdle);
          expect(result.rejectionReason).toBeUndefined();
        } else {
          expect(result.rejectionReason).toBeDefined();
        }
      }
    });
  });
});
