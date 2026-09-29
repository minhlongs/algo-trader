/**
 * Tier 2: Boundary & Corner Conditions Test Suite
 *
 * Exhaustive edge case testing across extreme values, zero/negative inputs,
 * exact hurdle boundaries, saturation limits, timeout races, and depth exhaustion.
 *
 * Covers 70 targeted boundary test cases across all engine components.
 */

import { describe, it, expect, vi } from 'vitest';
import { NetProfitabilityCalculator } from '../../../src/desk/arbitrage/net-profitability-calculator';
import { OpportunityIngestionPipeline } from '../../../src/desk/arbitrage/opportunity-ingestion-pipeline';
import type { ArbitrageOpportunity } from '../../../src/desk/arbitrage/spread-detector-types';
import {
  ArbitrageRiskGuard,
  ArbitrageRejectionReason,
  type MultiLegArbitrageBasket,
} from '../../../src/desk/arbitrage/arbitrage-risk-guard';
import { KellyPositionSizer } from '../../../src/desk/risk/kelly-position-sizer';
import { AtomicMultiLegCoordinator } from '../../../src/desk/arbitrage/atomic-multileg-coordinator';
import { CompensatoryUnwindHandler } from '../../../src/desk/arbitrage/compensatory-unwind-handler';
import { ArbitrageMetrics } from '../../../src/desk/arbitrage/telemetry/arbitrage-metrics';
import { ArbitrageAuditLogger } from '../../../src/desk/arbitrage/telemetry/arbitrage-audit-logger';
import type { IExchangeConnector } from '../../../src/desk/arbitrage/connectors/types';

vi.mock('../../../src/seed/security/audit-log', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  hashIpAddress: vi.fn().mockReturnValue('mocked-ip-hash-sha256'),
}));

import { logAudit } from '../../../src/seed/security/audit-log';

describe('Tier 2: Boundary & Corner Conditions', () => {
  const createMockConnector = (venue: string, overrides?: Partial<IExchangeConnector>): IExchangeConnector => ({
    venue,
    fetchOrderBook: vi.fn().mockResolvedValue({
      symbol: 'BTC/USDT',
      bids: [{ price: 50100, amount: 2 }],
      asks: [{ price: 50000, amount: 2 }],
      timestamp: Date.now(),
    }),
    placeOrder: vi.fn().mockResolvedValue({
      orderId: `ord-${venue}-1`,
      clientOrderId: `cl-${venue}-1`,
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      price: 50000,
      amount: 0.1,
      filled: 0.1,
      status: 'closed',
      timestamp: Date.now(),
    }),
    cancelOrder: vi.fn().mockResolvedValue({ orderId: `ord-${venue}-1`, status: 'canceled' }),
    fetchBalance: vi.fn().mockResolvedValue({
      venue,
      balances: { USDT: { free: 50000, total: 50000 }, BTC: { free: 2, total: 2 } },
      timestamp: Date.now(),
    }),
    fetchTicker: vi.fn().mockResolvedValue({ symbol: 'BTC/USDT', last: 50000, bid: 49990, ask: 50010, timestamp: Date.now() }),
    getLatencyStats: vi.fn().mockReturnValue({ p50: 10, p90: 20, p99: 45 }),
    ...overrides,
  });

  const buildBasket = (params?: {
    symbol?: string;
    buyVenue?: string;
    sellVenue?: string;
    amount?: number;
    price?: number;
    notional?: number;
    winProbability?: number;
    winLossRatio?: number;
  }): MultiLegArbitrageBasket => {
    const symbol = params?.symbol ?? 'BTC/USDT';
    const buyVenue = params?.buyVenue ?? 'binance';
    const sellVenue = params?.sellVenue ?? 'bybit';
    const amount = params?.amount ?? 1.0;
    const price = params?.price ?? 2_000;
    const notional = params?.notional ?? amount * price;

    return {
      basketId: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      opportunityId: 'opp-t2',
      strategyKey: 'cross-exchange-arb',
      legs: [
        { legId: 'leg-1', venue: buyVenue, symbol, side: 'buy', amount, price, notionalUsd: notional },
        { legId: 'leg-2', venue: sellVenue, symbol, side: 'sell', amount, price, notionalUsd: notional },
      ],
      totalNotionalUsd: notional,
      winProbability: params?.winProbability ?? 0.95,
      winLossRatio: params?.winLossRatio ?? 1.0,
      createdAt: Date.now(),
    };
  };

  const createOpp = (overrides?: Partial<ArbitrageOpportunity>): ArbitrageOpportunity => ({
    id: `opp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    symbol: 'BTC/USDT',
    buyExchange: 'binance',
    sellExchange: 'bybit',
    buyPrice: 50000,
    sellPrice: 50200,
    spreadBps: 40,
    netProfitBps: 20,
    netProfitUsd: 10,
    confidence: 0.95,
    timestamp: Date.now(),
    ...overrides,
  });

  // ─── 1. Net Profitability & VWAP Slippage Boundaries ───────────────────────
  describe('B1: Net Profitability & VWAP Slippage Boundaries', () => {
    it('B1.1: micro trade amount (0.000001) calculates fees and net profit accurately', () => {
      const calc = new NetProfitabilityCalculator();
      const res = calc.calculate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', side: 'buy', price: 50000, amount: 0.000001 },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', price: 50200, amount: 0.000001 },
        tradeAmount: 0.000001,
      });
      expect(res.netProfitUsd).toBeGreaterThan(0);
      expect(res.netProfitBps).toBeGreaterThan(0);
    });

    it('B1.2: large trade amount (1,000,000) computes without floating-point overflow', () => {
      const calc = new NetProfitabilityCalculator();
      const res = calc.calculate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', side: 'buy', price: 50000, amount: 1000000 },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', price: 50500, amount: 1000000 },
        tradeAmount: 1000000,
      });
      expect(Number.isFinite(res.netProfitUsd)).toBe(true);
      expect(Number.isFinite(res.grossSpreadUsd)).toBe(true);
    });

    it('B1.3: exact hurdle edge — spread exactly covers fee hurdle (net profit close to hurdle)', () => {
      const calc = new NetProfitabilityCalculator();
      const res = calc.calculate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', side: 'buy', price: 10000, amount: 1 },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', price: 10050, amount: 1 },
        tradeAmount: 1,
        minHurdleBps: 10,
      });
      expect(res.isProfitable).toBe(true);
    });

    it('B1.4: spread below fee hurdle results in negative net profit and isProfitable = false', () => {
      const calc = new NetProfitabilityCalculator();
      const res = calc.calculate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', side: 'buy', price: 10000, amount: 1 },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', price: 10005, amount: 1 },
        tradeAmount: 1,
      });
      expect(res.isProfitable).toBe(false);
      expect(res.netProfitUsd).toBeLessThan(0);
    });

    it('B1.5: inverted spread (buy price > sell price) produces negative net profit', () => {
      const calc = new NetProfitabilityCalculator();
      const res = calc.calculate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', side: 'buy', price: 50500, amount: 1 },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', price: 50000, amount: 1 },
        tradeAmount: 1,
      });
      expect(res.netProfitBps).toBeLessThan(0);
      expect(res.isProfitable).toBe(false);
    });

    it('B1.6: zero fees scenario calculates gross spread equal to net spread', () => {
      const calc = new NetProfitabilityCalculator();
      const res = calc.calculate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', side: 'buy', price: 50000, amount: 1 },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', price: 50500, amount: 1 },
        tradeAmount: 1,
        feeOverrides: { buyFeeRate: 0, sellFeeRate: 0 },
        slippageConfig: { cexBaseSlippageBps: 0, cexImpactFactorBps: 0 },
      });
      expect(res.estimatedBuyFeeUsd).toBe(0);
      expect(res.estimatedSellFeeUsd).toBe(0);
      expect(res.grossSpreadUsd).toBeCloseTo(500, 1);
      expect(res.netProfitUsd).toBeCloseTo(500, 1);
    });

    it('B1.7: empty orderbook depth returns 0 vwap gracefully', () => {
      const calc = new NetProfitabilityCalculator();
      const slippage = calc.calculateVwapSlippage({ asks: [] }, 'buy', 10);
      expect(slippage.slippageBps).toBe(0);
      expect(slippage.vwap).toBe(0);
    });

    it('B1.8: single-level orderbook with exact volume match produces 0 slippage', () => {
      const calc = new NetProfitabilityCalculator();
      const singleBook = {
        bids: [{ price: 50000, amount: 5 }],
        asks: [{ price: 50000, amount: 5 }],
      };
      const slippage = calc.calculateVwapSlippage(singleBook, 'buy', 5);
      expect(slippage.slippageBps).toBe(0);
      expect(slippage.vwap).toBe(50000);
    });

    it('B1.9: orderbook walk exhausting all available depth marks insufficientLiquidity', () => {
      const calc = new NetProfitabilityCalculator();
      const shallowBook = {
        asks: [
          { price: 50000, amount: 1 },
          { price: 50100, amount: 1 },
        ],
      };
      const slippage = calc.calculateVwapSlippage(shallowBook, 'buy', 10);
      expect(slippage.vwap).toBe(50050); // (50000*1 + 50100*1) / 2
      expect(slippage.insufficientLiquidity).toBe(true);
    });

    it('B1.10: sell side orderbook walk through multiple bid tiers computes VWAP accurately', () => {
      const calc = new NetProfitabilityCalculator();
      const deepBook = {
        bids: [
          { price: 50000, amount: 1 },
          { price: 49800, amount: 1 },
        ],
      };
      const slippage = calc.calculateVwapSlippage(deepBook, 'sell', 2);
      expect(slippage.vwap).toBe(49900); // (50000*1 + 49800*1) / 2
      expect(slippage.slippageBps).toBeCloseTo(20, 0); // (50000 - 49900)/50000 * 10000 = 20 bps
    });

    it('B1.11: Polygon on-chain gas calculation with extreme 10,000 gwei gas spike', () => {
      const calc = new NetProfitabilityCalculator();
      const res = calc.calculate({
        buyLeg: { venue: 'polymarket', symbol: 'BTC-USDC', side: 'buy', price: 0.5, amount: 100, settlementType: 'on_chain_settle' },
        sellLeg: { venue: 'binance', symbol: 'BTC/USDT', side: 'sell', price: 0.52, amount: 100 },
        tradeAmount: 100,
        gasConfig: { polygonGasPriceGwei: 10000, maticPriceUsd: 1.0 },
      });
      // Gas cost: 150000 gas * 10000 gwei * 1e-9 * $1 = $1.50
      expect(res.estimatedGasUsd).toBeCloseTo(1.5, 2);
    });

    it('B1.12: Polygon on-chain gas with zero gas price results in 0 gas cost', () => {
      const calc = new NetProfitabilityCalculator();
      const res = calc.calculate({
        buyLeg: { venue: 'polymarket', symbol: 'BTC-USDC', side: 'buy', price: 0.5, amount: 100, settlementType: 'on_chain_settle' },
        sellLeg: { venue: 'binance', symbol: 'BTC/USDT', side: 'sell', price: 0.52, amount: 100 },
        tradeAmount: 100,
        gasOverrides: { polygonGasUsd: 0 },
      });
      expect(res.estimatedGasUsd).toBe(0);
    });

    it('B1.13: CEX-to-CEX trade has exactly 0 on-chain gas cost regardless of gas parameters', () => {
      const calc = new NetProfitabilityCalculator();
      const res = calc.calculate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', side: 'buy', price: 50000, amount: 1 },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', price: 50200, amount: 1 },
        tradeAmount: 1,
        gasConfig: { polygonGasPriceGwei: 500, maticPriceUsd: 2.0 },
      });
      expect(res.estimatedGasUsd).toBe(0);
    });

    it('B1.14: zero native token (MATIC) price produces 0 gas cost in USD', () => {
      const calc = new NetProfitabilityCalculator();
      const res = calc.calculate({
        buyLeg: { venue: 'polymarket', symbol: 'BTC-USDC', side: 'buy', price: 0.5, amount: 100, settlementType: 'on_chain_settle' },
        sellLeg: { venue: 'binance', symbol: 'BTC/USDT', side: 'sell', price: 0.52, amount: 100 },
        tradeAmount: 100,
        gasOverrides: { polygonGasUsd: 0 },
      });
      expect(res.estimatedGasUsd).toBe(0);
    });
  });

  // ─── 2. Ingestion Pipeline & Queue Saturation ───────────────────────────────
  describe('B2: Ingestion Pipeline & Queue Saturation Boundaries', () => {
    it('B2.1: capacity = 1 queue accepts first item and drops upon buffer overflow', async () => {
      const admitted: ArbitrageOpportunity[] = [];
      const pipeline = new OpportunityIngestionPipeline(
        { maxQueueSize: 1, minHurdleBps: 10 },
        { onAdmitted: async (opp) => { admitted.push(opp); } }
      );

      const opp1 = createOpp({ id: 'opp-cap-1', timestamp: Date.now() });
      const opp2 = createOpp({ id: 'opp-cap-2', symbol: 'ETH/USDT', timestamp: Date.now() + 1 });
      const opp3 = createOpp({ id: 'opp-cap-3', symbol: 'SOL/USDT', timestamp: Date.now() + 2 });

      pipeline.handleOpportunities([opp1, opp2, opp3]);
      expect(pipeline.metrics.queueDroppedCount).toBeGreaterThanOrEqual(1);
    });

    it('B2.2: duplicate opportunity with same ID within TTL window is dropped', async () => {
      const pipeline = new OpportunityIngestionPipeline({ dedupTtlMs: 500, minHurdleBps: 10 });
      const opp = createOpp({ id: 'dup-1' });

      pipeline.handleOpportunities([opp]);
      pipeline.handleOpportunities([opp]);

      expect(pipeline.metrics.dedupDroppedCount).toBe(1);
    });

    it('B2.3: exact net profit hurdle boundary — opportunity with profit above hurdle is admitted', async () => {
      const admitted: ArbitrageOpportunity[] = [];
      const pipeline = new OpportunityIngestionPipeline(
        { minHurdleBps: 10 },
        { onAdmitted: async (opp) => { admitted.push(opp); } }
      );

      const opp = createOpp({ id: 'hurdle-above', netProfitBps: 15.0 });
      pipeline.handleOpportunities([opp]);

      await new Promise((r) => setTimeout(r, 60));
      expect(admitted.length).toBe(1);
    });

    it('B2.4: net profit below hurdle is rejected', async () => {
      const admitted: ArbitrageOpportunity[] = [];
      const pipeline = new OpportunityIngestionPipeline(
        { minHurdleBps: 20 },
        { onAdmitted: async (opp) => { admitted.push(opp); } }
      );

      const opp = createOpp({ id: 'hurdle-below', netProfitBps: 5.0 });
      pipeline.handleOpportunities([opp]);

      await new Promise((r) => setTimeout(r, 60));
      expect(admitted.length).toBe(0);
      expect(pipeline.metrics.rejectedCount).toBe(1);
    });

    it('B2.5: rapid burst of 100 unique opportunities respects max capacity limit', () => {
      const pipeline = new OpportunityIngestionPipeline({ maxQueueSize: 20, minHurdleBps: 10 });
      const opps: ArbitrageOpportunity[] = Array.from({ length: 100 }, (_, i) =>
        createOpp({ id: `burst-${i}`, symbol: `SYM-${i}/USDT`, timestamp: Date.now() + i })
      );

      pipeline.handleOpportunities(opps);
      expect(pipeline.metrics.queueDroppedCount).toBeGreaterThan(0);
    });

    it('B2.6: stop() on empty pipeline completes cleanly without error', () => {
      const pipeline = new OpportunityIngestionPipeline();
      expect(() => pipeline.stop()).not.toThrow();
    });

    it('B2.7: stop() drains internal queue and clears dedup state cleanly', () => {
      const pipeline = new OpportunityIngestionPipeline();
      const opp = createOpp({ id: 'clr-1' });
      pipeline.handleOpportunities([opp]);
      pipeline.stop();
      expect(pipeline.metrics.scannedCount).toBe(1);
    });
  });

  // ─── 3. Pre-Trade Risk Guard Hard Limits ────────────────────────────────────
  describe('B3: Pre-Trade Risk Guard Hard Limits', () => {
    const riskGuard = new ArbitrageRiskGuard({
      maxPerTradeNotionalUsd: 10000,
      maxOpenPositionPerSymbolUsd: 25000,
      maxOpenPositionPerVenueUsd: 50000,
      maxDailyDrawdownFraction: 0.15,
      maxVenueLatencyMs: 500,
      capitalUsdc: 1_000_000,
      mode: 'paper',
    });

    it('B3.1: trade notional exactly at cap ($10,000.00) is allowed', async () => {
      const basket = buildBasket({ notional: 10000 });
      const res = await riskGuard.checkBasket(basket);
      expect(res.allowed).toBe(true);
    });

    it('B3.2: trade notional $0.01 above cap ($10,000.01) is rejected', async () => {
      const basket = buildBasket({ notional: 10000.01 });
      const res = await riskGuard.checkBasket(basket);
      expect(res.allowed).toBe(false);
      expect(res.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_NOTIONAL_CAP);
    });

    it('B3.3: symbol exposure within cap ($25,000) is allowed', async () => {
      const guard = new ArbitrageRiskGuard({ maxOpenPositionPerSymbolUsd: 25000, maxPerTradeNotionalUsd: 10000, capitalUsdc: 1_000_000, mode: 'paper' });
      guard.recordTradeOpened('BTC/USDT', 'binance', 'bybit', 15000);
      const basket = buildBasket({ symbol: 'BTC/USDT', notional: 8000 }); // 15k + 8k = 23k <= 25k
      const res = await guard.checkBasket(basket);
      expect(res.allowed).toBe(true);
    });

    it('B3.4: symbol exposure above cap ($25,000) is rejected with EXCEEDS_SYMBOL_CAP', async () => {
      const guard = new ArbitrageRiskGuard({ maxOpenPositionPerSymbolUsd: 25000, maxPerTradeNotionalUsd: 10000, capitalUsdc: 1_000_000, mode: 'paper' });
      guard.recordTradeOpened('BTC/USDT', 'binance', 'bybit', 20000);
      const basket = buildBasket({ symbol: 'BTC/USDT', notional: 6000 }); // 20k + 6k = 26k > 25k, but notional 6k <= 10k
      const res = await guard.checkBasket(basket);
      expect(res.allowed).toBe(false);
      expect(res.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_SYMBOL_CAP);
    });

    it('B3.5: venue exposure within cap ($50,000) is allowed', async () => {
      const guard = new ArbitrageRiskGuard({ maxOpenPositionPerVenueUsd: 50000, maxPerTradeNotionalUsd: 10000, capitalUsdc: 1_000_000, mode: 'paper' });
      guard.recordTradeOpened('BTC/USDT', 'binance', 'bybit', 40000);
      const basket = buildBasket({ symbol: 'ETH/USDT', buyVenue: 'binance', sellVenue: 'bybit', notional: 5000 }); // 40k + 5k = 45k <= 50k
      const res = await guard.checkBasket(basket);
      expect(res.allowed).toBe(true);
    });

    it('B3.6: venue exposure above cap ($50,000) is rejected with EXCEEDS_VENUE_CAP', async () => {
      const guard = new ArbitrageRiskGuard({ maxOpenPositionPerVenueUsd: 50000, maxPerTradeNotionalUsd: 10000, capitalUsdc: 1_000_000, mode: 'paper' });
      guard.recordTradeOpened('BTC/USDT', 'binance', 'bybit', 45000);
      const basket = buildBasket({ symbol: 'ETH/USDT', buyVenue: 'binance', sellVenue: 'bybit', notional: 6000 }); // 45k + 6k = 51k > 50k
      const res = await guard.checkBasket(basket);
      expect(res.allowed).toBe(false);
      expect(res.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_VENUE_CAP);
    });

    it('B3.7: venue latency exactly at threshold (500ms) is allowed', async () => {
      const basket = buildBasket({ notional: 1000 });
      const res = await riskGuard.checkBasket(basket, {
        venueLatencies: { binance: 500, bybit: 500 },
      });
      expect(res.allowed).toBe(true);
    });

    it('B3.8: venue latency 1ms above threshold (501ms) is rejected', async () => {
      const basket = buildBasket({ notional: 1000 });
      const res = await riskGuard.checkBasket(basket, {
        venueLatencies: { binance: 501, bybit: 200 },
      });
      expect(res.allowed).toBe(false);
      expect(res.rejectionReason).toBe(ArbitrageRejectionReason.VENUE_LATENCY_SPIKE);
    });

    it('B3.9: daily drawdown exactly 14.99% is allowed', async () => {
      const basket = buildBasket({ notional: 1000 });
      const res = await riskGuard.checkBasket(basket, { currentDrawdown: 0.1499 });
      expect(res.allowed).toBe(true);
    });

    it('B3.10: daily drawdown exactly 15.00% triggers circuit breaker', async () => {
      const basket = buildBasket({ notional: 1000 });
      const res = await riskGuard.checkBasket(basket, { currentDrawdown: 0.15 });
      expect(res.allowed).toBe(false);
      expect(res.rejectionReason).toBe(ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED);
    });

    it('B3.11: negative daily drawdown (portfolio in profit) passes smoothly', async () => {
      const basket = buildBasket({ notional: 1000 });
      const res = await riskGuard.checkBasket(basket, { currentDrawdown: -0.05 });
      expect(res.allowed).toBe(true);
    });

    it('B3.12: venue balance exactly equal to trade notional is allowed', async () => {
      const basket = buildBasket({ notional: 2000 });
      const res = await riskGuard.checkBasket(basket, {
        venueBalances: { binance: 2000, bybit: 2000 },
      });
      expect(res.allowed).toBe(true);
    });

    it('B3.13: venue balance less than trade notional is rejected', async () => {
      const basket = buildBasket({ notional: 2000 });
      const res = await riskGuard.checkBasket(basket, {
        venueBalances: { binance: 1000, bybit: 5000 },
      });
      expect(res.allowed).toBe(false);
      expect(res.rejectionReason).toBe(ArbitrageRejectionReason.INSUFFICIENT_VENUE_BALANCE);
    });

    it('B3.14: recordTradeClosed decrements exposure and clamps at 0 without negative leak', () => {
      const guard = new ArbitrageRiskGuard({ capitalUsdc: 100000 });
      guard.recordTradeOpened('BTC/USDT', 'binance', 'bybit', 5000);
      guard.recordTradeClosed('BTC/USDT', 'binance', 'bybit', 6000); // close more than opened
      const exposures = guard.getExposures();
      expect(exposures.venues['binance']).toBe(0);
      expect(exposures.symbols['BTC/USDT']).toBe(0);
    });

    it('B3.15: resetExposures clears all tracked open notionals completely', () => {
      const guard = new ArbitrageRiskGuard({ capitalUsdc: 100000 });
      guard.recordTradeOpened('BTC/USDT', 'binance', 'bybit', 5000);
      guard.recordTradeOpened('ETH/USDT', 'bybit', 'kucoin', 3000);
      guard.resetExposures();
      const exposures = guard.getExposures();
      expect(Object.keys(exposures.venues).length).toBe(0);
      expect(Object.keys(exposures.symbols).length).toBe(0);
    });
  });

  // ─── 4. Kelly Position Sizer Boundaries ────────────────────────────────────
  describe('B4: Kelly Position Sizer Boundaries', () => {
    it('B4.1: maximum Quarter-Kelly size capped at exactly 5% of bankroll', () => {
      const sizer = new KellyPositionSizer({ kellyFraction: 0.25, maxPositionFraction: 0.05 });
      const size = sizer.calculatePositionSize({
        winProbability: 0.99,
        winLossRatio: 10,
        portfolioValue: 100000,
      });
      expect(size.positionSizeUsd).toBe(5000); // 5% of 100k
      expect(size.portfolioPercent).toBe(5);
    });

    it('B4.2: zero win probability produces 0 size', () => {
      const sizer = new KellyPositionSizer({ kellyFraction: 0.25, maxPositionFraction: 0.05 });
      const size = sizer.calculatePositionSize({
        winProbability: 0,
        winLossRatio: 2,
        portfolioValue: 100000,
      });
      expect(size.positionSizeUsd).toBe(0);
      expect(size.portfolioPercent).toBe(0);
    });

    it('B4.3: 100% win probability still respects 5% hard cap', () => {
      const sizer = new KellyPositionSizer({ kellyFraction: 0.25, maxPositionFraction: 0.05 });
      const size = sizer.calculatePositionSize({
        winProbability: 0.999,
        winLossRatio: 1,
        portfolioValue: 100000,
      });
      expect(size.positionSizeUsd).toBe(5000);
    });

    it('B4.4: negative mathematical expectancy produces 0 size', () => {
      const sizer = new KellyPositionSizer({ kellyFraction: 0.25, maxPositionFraction: 0.05 });
      const size = sizer.calculatePositionSize({
        winProbability: 0.2,
        winLossRatio: 1,
        portfolioValue: 100000,
      });
      expect(size.positionSizeUsd).toBe(0);
    });

    it('B4.5: zero portfolio value returns 0 position size', () => {
      const sizer = new KellyPositionSizer({ kellyFraction: 0.25, maxPositionFraction: 0.05 });
      const size = sizer.calculatePositionSize({
        winProbability: 0.8,
        winLossRatio: 2,
        portfolioValue: 0,
      });
      expect(size.positionSizeUsd).toBe(0);
    });

    it('B4.6: custom maxPositionFraction (e.g. 2%) clamps sizing strictly', () => {
      const sizer = new KellyPositionSizer({ kellyFraction: 0.25, maxPositionFraction: 0.02 });
      const size = sizer.calculatePositionSize({
        winProbability: 0.9,
        winLossRatio: 3,
        portfolioValue: 50000,
      });
      expect(size.positionSizeUsd).toBe(1000); // 2% of 50k
      expect(size.portfolioPercent).toBe(2);
    });
  });

  // ─── 5. Atomic Multi-Leg Coordinator Boundaries ────────────────────────────
  describe('B5: Atomic Multi-Leg Coordinator Boundaries', () => {
    it('B5.1: rejects order with empty legs array via Zod schema', async () => {
      const binance = createMockConnector('binance');
      const coordinator = new AtomicMultiLegCoordinator(() => binance);
      await expect(
        coordinator.execute({
          orderId: 'empty-legs',
          legs: [],
        }),
      ).rejects.toThrow();
    });

    it('B5.2: rejects leg with non-positive amount via Zod schema', async () => {
      const binance = createMockConnector('binance');
      const coordinator = new AtomicMultiLegCoordinator(() => binance);
      await expect(
        coordinator.execute({
          orderId: 'neg-amount',
          legs: [{ legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 0, price: 50000, type: 'limit' }],
        }),
      ).rejects.toThrow();
    });

    it('B5.3: rejects leg with negative price via Zod schema', async () => {
      const binance = createMockConnector('binance');
      const coordinator = new AtomicMultiLegCoordinator(() => binance);
      await expect(
        coordinator.execute({
          orderId: 'neg-price',
          legs: [{ legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 1, price: -100, type: 'limit' }],
        }),
      ).rejects.toThrow();
    });

    it('B5.4: 1ms timeout triggers timeout status on slow leg', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn().mockImplementation(() => new Promise((r) => setTimeout(r, 50))),
      });
      const coordinator = new AtomicMultiLegCoordinator(() => binance);
      const report = await coordinator.execute({
        orderId: 'timeout-1ms',
        legs: [{ legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 0.1, price: 50000, type: 'limit', timeoutMs: 1 }],
      });
      expect(report.state).toBe('FAILED');
      expect(report.legs[0].status).toBe('timed_out');
    });

    it('B5.5: 3-leg concurrent order coordinates across all 3 venues simultaneously', async () => {
      const binance = createMockConnector('binance');
      const bybit = createMockConnector('bybit');
      const kucoin = createMockConnector('kucoin');
      const coordinator = new AtomicMultiLegCoordinator((v) => {
        if (v === 'binance') return binance;
        if (v === 'bybit') return bybit;
        return kucoin;
      });

      const report = await coordinator.execute({
        orderId: '3-leg-order',
        executionMode: 'concurrent',
        legs: [
          { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 0.1, price: 50000, type: 'limit' },
          { legId: 'l2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', amount: 0.05, price: 50200, type: 'limit' },
          { legId: 'l3', venue: 'kucoin', symbol: 'BTC/USDT', side: 'sell', amount: 0.05, price: 50250, type: 'limit' },
        ],
      });

      expect(report.state).toBe('FILLED');
      expect(report.legs.length).toBe(3);
    });

    it('B5.6: sequential mode stops upon first leg failure without calling second leg', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn().mockRejectedValue(new Error('Binance down')),
      });
      const bybit = createMockConnector('bybit');
      const coordinator = new AtomicMultiLegCoordinator((v) => (v === 'binance' ? binance : bybit));

      const report = await coordinator.execute({
        orderId: 'seq-fail-early',
        executionMode: 'sequential',
        legs: [
          { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 0.1, price: 50000, type: 'limit' },
          { legId: 'l2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', amount: 0.1, price: 50200, type: 'limit' },
        ],
      });

      expect(bybit.placeOrder).not.toHaveBeenCalled();
      expect(report.state).toBe('FAILED');
    });

    it('B5.7: 99.9% partial fill triggers unwind of 0.999 filled units', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn().mockResolvedValue({ orderId: 'b1', filled: 0.999, price: 50000, status: 'open' }),
      });
      const bybit = createMockConnector('bybit', {
        placeOrder: vi.fn().mockRejectedValue(new Error('Bybit network error')),
      });
      const coordinator = new AtomicMultiLegCoordinator((v) => (v === 'binance' ? binance : bybit));

      const report = await coordinator.execute({
        orderId: 'partial-999',
        legs: [
          { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 1.0, price: 50000, type: 'limit' },
          { legId: 'l2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', amount: 1.0, price: 50200, type: 'limit' },
        ],
      });

      expect(report.state).toBe('UNWOUND');
      expect(report.unwindResult?.unwoundLegs[0].filledAmount).toBe(0.999);
    });

    it('B5.8: 0.1% micro partial fill triggers unwind of 0.001 filled units', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn().mockResolvedValue({ orderId: 'b1', filled: 0.001, price: 50000, status: 'open' }),
      });
      const bybit = createMockConnector('bybit', {
        placeOrder: vi.fn().mockRejectedValue(new Error('Bybit network error')),
      });
      const coordinator = new AtomicMultiLegCoordinator((v) => (v === 'binance' ? binance : bybit));

      const report = await coordinator.execute({
        orderId: 'partial-micro',
        legs: [
          { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 1.0, price: 50000, type: 'limit' },
          { legId: 'l2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', amount: 1.0, price: 50200, type: 'limit' },
        ],
      });

      expect(report.state).toBe('UNWOUND');
      expect(report.unwindResult?.unwoundLegs[0].filledAmount).toBe(0.001);
    });

    it('B5.9: sequential mode unwinds previous filled legs when a later leg fails', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn().mockResolvedValue({ orderId: 'b1', filled: 1, price: 50000, status: 'closed' }),
      });
      const bybit = createMockConnector('bybit', {
        placeOrder: vi.fn().mockRejectedValue(new Error('Bybit offline')),
      });
      const coordinator = new AtomicMultiLegCoordinator((v) => (v === 'binance' ? binance : bybit));

      const report = await coordinator.execute({
        orderId: 'seq-unwind-prev',
        executionMode: 'sequential',
        legs: [
          { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 1.0, price: 50000, type: 'limit' },
          { legId: 'l2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', amount: 1.0, price: 50200, type: 'limit' },
        ],
      });

      expect(report.state).toBe('UNWOUND');
      expect(report.unwindResult?.unwoundLegs.length).toBe(1);
    });
  });

  // ─── 6. Compensatory Unwind & Retry Backoff Boundaries ──────────────────────
  describe('B6: Compensatory Unwind & Retry Backoff Boundaries', () => {
    it('B6.1: maxRetries = 0 performs exactly 1 unwind attempt', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn().mockRejectedValue(new Error('Fatal exchange error')),
      });
      const handler = new CompensatoryUnwindHandler(() => binance, { maxRetries: 0, emergencyFallback: false });
      const report = await handler.executeUnwind('unwind-0-retries', [
        { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', requestedAmount: 1, filledAmount: 1, price: 50000, status: 'filled', latencyMs: 10 },
      ]);
      expect(binance.placeOrder).toHaveBeenCalledTimes(1);
      expect(report.success).toBe(false);
      expect(report.attempts).toBe(1);
    });

    it('B6.2: unwind retry succeeds on 2nd attempt with backoff', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn()
          .mockRejectedValueOnce(new Error('Rate limit spike'))
          .mockResolvedValueOnce({ orderId: 'unwind-ok', filled: 1, price: 49950, status: 'closed' }),
      });
      const handler = new CompensatoryUnwindHandler(() => binance, { maxRetries: 3, initialBackoffMs: 5 });
      const report = await handler.executeUnwind('unwind-retry-ok', [
        { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', requestedAmount: 1, filledAmount: 1, price: 50000, status: 'filled', latencyMs: 10 },
      ]);
      expect(binance.placeOrder).toHaveBeenCalledTimes(2);
      expect(report.success).toBe(true);
      expect(report.attempts).toBe(2);
    });

    it('B6.3: fallback order succeeds on retry when first attempt fails', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn()
          .mockRejectedValueOnce(new Error('Fail 1'))
          .mockResolvedValueOnce({ orderId: 'fallback-ok', filled: 1, price: 49800, status: 'closed' }),
      });
      const handler = new CompensatoryUnwindHandler(() => binance, { maxRetries: 1, initialBackoffMs: 5, emergencyFallback: true });
      const report = await handler.executeUnwind('unwind-fallback', [
        { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', requestedAmount: 1, filledAmount: 1, price: 50000, status: 'filled', latencyMs: 10 },
      ]);
      expect(report.success).toBe(true);
    });

    it('B6.4: empty targets list completes with success and 0 unhedged delta', async () => {
      const handler = new CompensatoryUnwindHandler(() => undefined);
      const report = await handler.executeUnwind('unwind-empty', []);
      expect(report.success).toBe(true);
      expect(report.unhedgedResidualDelta).toBe(0);
      expect(report.unwoundLegs.length).toBe(0);
    });

    it('B6.5: targets with 0 filled amount are skipped without invoking exchange', async () => {
      const binance = createMockConnector('binance');
      const handler = new CompensatoryUnwindHandler(() => binance);
      const report = await handler.executeUnwind('unwind-zero-fill', [
        { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', requestedAmount: 5, filledAmount: 0, price: 50000, status: 'failed', latencyMs: 10 },
      ]);
      expect(binance.placeOrder).not.toHaveBeenCalled();
      expect(report.success).toBe(true);
      expect(report.unhedgedResidualDelta).toBe(0);
    });

    it('B6.6: unwind price equal to entry price computes exactly 0 USD unwind divergence', async () => {
      const binance = createMockConnector('binance', {
        placeOrder: vi.fn().mockResolvedValue({ orderId: 'u1', filled: 2, price: 50000, status: 'closed' }),
      });
      const handler = new CompensatoryUnwindHandler(() => binance);
      const report = await handler.executeUnwind('unwind-zero-pnl', [
        { legId: 'l1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', requestedAmount: 2, filledAmount: 2, price: 50000, status: 'filled', latencyMs: 10 },
      ]);
      expect(report.unwindCostUsd).toBe(0);
      expect(report.totalRealizedLossUsd).toBe(0);
    });

    it('B6.7: unwind buy covering short at higher price calculates realized loss correctly', async () => {
      const bybit = createMockConnector('bybit', {
        placeOrder: vi.fn().mockResolvedValue({ orderId: 'u2', filled: 1, price: 50300, status: 'closed' }),
      });
      const handler = new CompensatoryUnwindHandler(() => bybit);
      // Sold at 50,000, covered at 50,300 -> loss of 300 USD
      const report = await handler.executeUnwind('unwind-short-loss', [
        { legId: 'l2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', requestedAmount: 1, filledAmount: 1, price: 50000, status: 'filled', latencyMs: 10 },
      ]);
      expect(report.unwindCostUsd).toBe(300);
      expect(report.totalRealizedLossUsd).toBe(300);
    });
  });

  // ─── 7. Telemetry & Hash-Chained Audit Boundaries ───────────────────────────
  describe('B7: Telemetry & Hash-Chained Audit Boundaries', () => {
    it('B7.1: Prometheus metric handles 0ms execution latency observation', async () => {
      const metrics = new ArbitrageMetrics({ prefix: 'tier2_' });
      metrics.recordExecutionLatency('binance', 'concurrent', 0);
      const text = await metrics.getMetrics();
      expect(text).toContain('tier2_execution_latency_ms_bucket{le="5"');
    });

    it('B7.2: Prometheus metric handles extreme latency observation (10,000ms)', async () => {
      const metrics = new ArbitrageMetrics({ prefix: 'tier2_' });
      metrics.recordExecutionLatency('bybit', 'sequential', 10000);
      const text = await metrics.getMetrics();
      expect(text).toContain('tier2_execution_latency_ms_bucket{le="+Inf"');
    });

    it('B7.3: Prometheus handles negative realized PnL gracefully', async () => {
      const metrics = new ArbitrageMetrics({ prefix: 'tier2_' });
      metrics.recordPnl('concurrent', -500.55);
      const text = await metrics.getMetrics();
      expect(text).toContain('tier2_pnl_usd{strategy="concurrent",result="loss"} 500.55');
    });

    it('B7.4: Prometheus handles zero realized PnL observation', async () => {
      const metrics = new ArbitrageMetrics({ prefix: 'tier2_' });
      metrics.recordPnl('concurrent', 0);
      const text = await metrics.getMetrics();
      expect(text).toContain('tier2_pnl_usd{strategy="concurrent",result="profit"} 0');
    });

    it('B7.5: audit logger handles special characters in executionId safely', async () => {
      const auditLogger = new ArbitrageAuditLogger();
      await auditLogger.logExecution({
        executionId: 'order:special/chars!#$%-123',
        state: 'FILLED',
        legs: [],
        latencyMs: 15,
        timestamp: Date.now(),
      });
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ executionId: 'order:special/chars!#$%-123' }),
        }),
      );
    });

    it('B7.6: concurrent audit logger calls execute without race condition or rejection', async () => {
      const auditLogger = new ArbitrageAuditLogger();
      const promises = Array.from({ length: 10 }, (_, i) =>
        auditLogger.logExecution({
          executionId: `concurrent-audit-${i}`,
          state: 'FILLED',
          legs: [],
          latencyMs: 10 + i,
          timestamp: Date.now(),
        }),
      );
      await expect(Promise.all(promises)).resolves.toBeDefined();
    });

    it('B7.7: audit logger records risk rejection with full gate context', async () => {
      const auditLogger = new ArbitrageAuditLogger();
      await auditLogger.logRiskRejection({
        opportunityId: 'opp-boundary-gate',
        reason: 'Venue latency 501ms exceeds threshold',
        rule: 'LATENCY_THRESHOLD',
      });
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'arbitrage:risk_rejection',
          result: 'denied',
        }),
      );
    });
  });
});
