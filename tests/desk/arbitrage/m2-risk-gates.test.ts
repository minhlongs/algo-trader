/**
 * Milestone 2: Pre-Trade Risk Gates & Position Sizing Enforcement Tests
 *
 * Comprehensive test suite verifying:
 * - Quarter-Kelly 5% portfolio cap enforcement via KellyPositionSizer
 * - Max per-trade notional limit across multi-leg baskets
 * - Max open position cap per venue and symbol
 * - 15% cumulative daily drawdown circuit breaker halt (TieredDrawdownBreaker & LiveExecutionGuard)
 * - Venue latency spike circuit breaker (SpreadDetector & CircuitBreaker)
 * - Paper mode vs Live mode credential checks (fail-closed live gating)
 * - Pre-trade venue balance verification (free balance checks)
 * - Explicit diagnostic rejection reasons matching the 7 standard codes
 * - Zod schema validation
 *
 * @module tests/desk/arbitrage/m2-risk-gates.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ArbitrageRiskGuard,
  type ArbitrageRiskConfig,
  type ArbitrageRiskGuardDependencies,
  type MultiLegArbitrageBasket,
  type VenueBalanceSnapshot,
  ArbitrageRejectionReason,
  DEFAULT_ARBITRAGE_RISK_CONFIG,
  ArbitrageRiskConfigSchema,
  MultiLegArbitrageBasketSchema,
  ArbitrageRiskCheckResultSchema,
  VenueBalanceSnapshotSchema,
} from '../../../src/desk/arbitrage/arbitrage-risk-guard';
import { KellyPositionSizer } from '../../../src/desk/risk/kelly-position-sizer';
import { LiveExecutionGuard } from '../../../src/desk/execution/live-execution-guard-core';
import { TieredDrawdownBreaker } from '../../../src/desk/risk/tiered-drawdown-breaker';

describe('Milestone 2: Pre-Trade Risk Gates & Position Sizing Enforcement', () => {
  let riskGuard: ArbitrageRiskGuard;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    riskGuard = new ArbitrageRiskGuard({
      capitalUsdc: 100_000,
      maxPerTradeNotionalUsd: 10_000,
      maxOpenPositionPerVenueUsd: 50_000,
      maxOpenPositionPerSymbolUsd: 25_000,
      maxDailyDrawdownFraction: 0.15,
      maxVenueLatencyMs: 500,
      kellyFraction: 0.25,
      maxKellyPositionFraction: 0.05,
      mode: 'paper',
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // Helper to build standard 2-leg basket
  function buildTestBasket(params?: {
    symbol?: string;
    buyVenue?: string;
    sellVenue?: string;
    amount?: number;
    price?: number;
    notional?: number;
    winProbability?: number;
    winLossRatio?: number;
  }): MultiLegArbitrageBasket {
    const symbol = params?.symbol ?? 'BTC/USDT';
    const buyVenue = params?.buyVenue ?? 'binance';
    const sellVenue = params?.sellVenue ?? 'bybit';
    const amount = params?.amount ?? 1.0;
    const price = params?.price ?? 2_000;
    const notional = params?.notional ?? amount * price;

    return {
      basketId: `basket-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      opportunityId: 'opp-123',
      strategyKey: 'cross-exchange-arb',
      legs: [
        {
          legId: 'leg-1',
          venue: buyVenue,
          symbol,
          side: 'buy',
          amount,
          price,
          notionalUsd: notional,
        },
        {
          legId: 'leg-2',
          venue: sellVenue,
          symbol,
          side: 'sell',
          amount,
          price,
          notionalUsd: notional,
        },
      ],
      totalNotionalUsd: notional,
      winProbability: params?.winProbability ?? 0.95,
      winLossRatio: params?.winLossRatio ?? 1.0,
      createdAt: Date.now(),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Quarter-Kelly 5% Cap Enforcement
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Quarter-Kelly 5% Cap Enforcement', () => {
    it('approves orders when requested notional is within Quarter-Kelly 5% cap', async () => {
      // Capital = $100,000 -> 5% cap = $5,000. Trade = $4,000 <= $5,000.
      const basket = buildTestBasket({ notional: 4_000 });
      const result = await riskGuard.checkBasket(basket);

      expect(result.allowed).toBe(true);
      expect(result.adjustedNotionalUsd).toBe(4_000);
      expect(result.checks?.kellyCapOk).toBe(true);
    });

    it('rejects orders when requested notional strictly exceeds Quarter-Kelly 5% cap', async () => {
      // Capital = $100,000 -> 5% cap = $5,000. Trade = $6,000 > $5,000.
      const basket = buildTestBasket({ notional: 6_000 });
      const result = await riskGuard.checkBasket(basket);

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_KELLY_CAP);
      expect(result.adjustedNotionalUsd).toBe(5_000); // capped at $5,000
      expect(result.checks?.kellyCapOk).toBe(false);
      expect(result.details?.maxKellyCapUsd).toBe(5_000);
    });

    it('computes smaller Kelly limit when edge is low (e.g. win rate 55%)', async () => {
      // Kelly formula: (b*p - q)/b = (1.0*0.55 - 0.45)/1.0 = 0.10.
      // Quarter-Kelly = 0.10 * 0.25 = 0.025 (2.5%).
      // 2.5% of $100,000 = $2,500 limit.
      const basket = buildTestBasket({
        notional: 3_500,
        winProbability: 0.55,
        winLossRatio: 1.0,
      });

      const result = await riskGuard.checkBasket(basket);

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_KELLY_CAP);
      expect(result.adjustedNotionalUsd).toBe(2_500);
    });

    it('rejects order with EXCEEDS_KELLY_CAP when Kelly edge is non-positive', async () => {
      // Win probability 40%, winLossRatio 1.0 -> raw Kelly = -0.20 <= 0 -> 0 size.
      const basket = buildTestBasket({
        notional: 1_000,
        winProbability: 0.40,
        winLossRatio: 1.0,
      });

      const result = await riskGuard.checkBasket(basket);

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_KELLY_CAP);
      expect(result.adjustedNotionalUsd).toBe(0);
    });

    it('clamps size without rejection when autoAdjustSizing is enabled', async () => {
      const sizingGuard = new ArbitrageRiskGuard({
        capitalUsdc: 100_000,
        autoAdjustSizing: true,
      });

      // Trade $8,000 > 5% Kelly cap ($5,000)
      const basket = buildTestBasket({ notional: 8_000 });
      const result = await sizingGuard.checkBasket(basket);

      expect(result.allowed).toBe(true);
      expect(result.adjustedNotionalUsd).toBe(5_000);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Per-Trade Notional and Venue/Symbol Open Position Caps
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. Per-Trade Notional and Open Position Caps', () => {
    it('enforces max per-trade notional ceiling even with large bankroll', async () => {
      // Capital = $1,000,000 (5% Kelly = $50,000). But maxPerTradeNotionalUsd = $10,000.
      const whaleGuard = new ArbitrageRiskGuard({
        capitalUsdc: 1_000_000,
        maxPerTradeNotionalUsd: 10_000,
      });

      const basket = buildTestBasket({ notional: 12_000 });
      const result = await whaleGuard.checkBasket(basket);

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_NOTIONAL_CAP);
      expect(result.details?.maxPerTradeNotionalUsd).toBe(10_000);
      expect(result.checks?.notionalCapOk).toBe(false);
    });

    it('enforces max open position cap per venue across multiple trades', async () => {
      // Venue limit = $50,000, Kelly cap = $5,000
      // Trade 1: $48,000 open on binance
      riskGuard.recordTradeOpened('BTC/USDT', 'binance', 'bybit', 48_000);
      expect(riskGuard.getExposures().venues['binance']).toBe(48_000);

      // Trade 2: $1,000 open -> cumulative = $49,000 <= $50,000 (allowed)
      const allowedBasket = buildTestBasket({
        symbol: 'ETH/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        notional: 1_000,
      });
      const allowedRes = await riskGuard.checkBasket(allowedBasket);
      expect(allowedRes.allowed).toBe(true);
      expect(allowedRes.checks?.venueCapOk).toBe(true);

      // Trade 3: cumulative 48k + 4k = 52k > 50k venue limit (rejected with EXCEEDS_VENUE_CAP)
      const breachBasket = buildTestBasket({
        symbol: 'SOL/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        notional: 4_000,
      });
      const breachRes = await riskGuard.checkBasket(breachBasket);
      expect(breachRes.allowed).toBe(false);
      expect(breachRes.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_VENUE_CAP);
      expect(breachRes.details?.limitType).toBe('venue');
      expect(breachRes.details?.venue).toBe('binance');
    });

    it('enforces max open position cap per symbol across multiple venues', async () => {
      // Symbol limit = $25,000
      riskGuard.recordTradeOpened('ETH/USDT', 'binance', 'bybit', 22_000);
      expect(riskGuard.getExposures().symbols['ETH/USDT']).toBe(22_000);

      // Next trade on ETH/USDT of $4,000 -> 22k + 4k = 26k > 25k (rejected)
      const breachBasket = buildTestBasket({
        symbol: 'ETH/USDT',
        buyVenue: 'kucoin',
        sellVenue: 'bybit',
        notional: 4_000,
      });

      const res = await riskGuard.checkBasket(breachBasket);
      expect(res.allowed).toBe(false);
      expect(res.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_SYMBOL_CAP);
      expect(res.details?.limitType).toBe('symbol');
      expect(res.details?.symbol).toBe('ETH/USDT');
    });

    it('releases exposure when trades close and allows subsequent trades', async () => {
      riskGuard.recordTradeOpened('SOL/USDT', 'binance', 'bybit', 24_000);
      expect(riskGuard.getExposures().symbols['SOL/USDT']).toBe(24_000);

      // Rejects trade of $4,000 (24k + 4k = 28k > 25k limit)
      const candidateBasket = buildTestBasket({
        symbol: 'SOL/USDT',
        notional: 4_000,
      });
      const blockedRes = await riskGuard.checkBasket(candidateBasket);
      expect(blockedRes.allowed).toBe(false);

      // Close $10,000 of SOL/USDT exposure -> remaining = 14k
      riskGuard.recordTradeClosed('SOL/USDT', 'binance', 'bybit', 10_000);
      expect(riskGuard.getExposures().symbols['SOL/USDT']).toBe(14_000);

      // Candidate trade of $4,000 is now 14k + 4k = 18k <= 25k (approved)
      const passedRes = await riskGuard.checkBasket(candidateBasket);
      expect(passedRes.allowed).toBe(true);
    });

    it('resetExposures cleanly purges all venue and symbol exposure state', () => {
      riskGuard.recordTradeOpened('BTC/USDT', 'binance', 'bybit', 20_000);
      riskGuard.recordTradeOpened('ETH/USDT', 'kucoin', 'bybit', 15_000);

      expect(riskGuard.getExposures().venues['binance']).toBe(20_000);
      expect(riskGuard.getExposures().symbols['ETH/USDT']).toBe(15_000);

      riskGuard.resetExposures();

      expect(riskGuard.getExposures().venues).toEqual({});
      expect(riskGuard.getExposures().symbols).toEqual({});
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. 15% Cumulative Drawdown Circuit Breaker Halt
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. 15% Cumulative Drawdown Circuit Breaker Halt', () => {
    it('permits trading when daily drawdown is within safe threshold (e.g. 10%)', async () => {
      const basket = buildTestBasket({ notional: 2_000 });
      const result = await riskGuard.checkBasket(basket, { currentDrawdown: 0.10 });

      expect(result.allowed).toBe(true);
      expect(result.checks?.drawdownBreakerOk).toBe(true);
    });

    it('immediately trips DRAWDOWN_BREAKER_TRIPPED when cumulative drawdown reaches 15%', async () => {
      const basket = buildTestBasket({ notional: 2_000 });
      const result = await riskGuard.checkBasket(basket, { currentDrawdown: 0.15 });

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED);
      expect(result.checks?.drawdownBreakerOk).toBe(false);
      expect(result.details?.currentDrawdown).toBe(0.15);
    });

    it('immediately trips DRAWDOWN_BREAKER_TRIPPED when cumulative drawdown exceeds 15%', async () => {
      const basket = buildTestBasket({ notional: 2_000 });
      const result = await riskGuard.checkBasket(basket, { currentDrawdown: 0.18 });

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED);
      expect(result.checks?.drawdownBreakerOk).toBe(false);
    });

    it('trips DRAWDOWN_BREAKER_TRIPPED when TieredDrawdownBreaker escalates to HALT tier', async () => {
      // Initial portfolio $100,000. Drop to $84,000 (16% drawdown) triggers HALT
      const tieredBreaker = new TieredDrawdownBreaker(100_000, { haltThreshold: 0.15 });
      tieredBreaker.reset(100_000);
      tieredBreaker.update(84_000);

      expect(tieredBreaker.getState().tier).toBe('HALT');
      expect(tieredBreaker.canOpenNewTrades()).toBe(false);

      const integratedGuard = new ArbitrageRiskGuard(
        { capitalUsdc: 100_000 },
        { tieredDrawdownBreaker: tieredBreaker },
      );

      const basket = buildTestBasket({ notional: 1_000 });
      const result = await integratedGuard.checkBasket(basket);

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED);
      expect(result.details?.tier).toBe('HALT');
    });

    it('trips DRAWDOWN_BREAKER_TRIPPED when LiveExecutionGuard circuit is tripped by losses', async () => {
      const liveGuard = new LiveExecutionGuard({
        capitalUsdc: 100_000,
        maxConsecutiveLosses: 3,
        enabled: true,
      });

      // Record 3 losses to trip circuit breaker
      liveGuard.recordLoss(-1_000);
      liveGuard.recordLoss(-1_000);
      liveGuard.recordLoss(-1_000);

      expect(liveGuard.getStatus().circuitTripped).toBe(true);

      const integratedGuard = new ArbitrageRiskGuard(
        { capitalUsdc: 100_000 },
        { liveExecutionGuard: liveGuard },
      );

      const basket = buildTestBasket({ notional: 1_000 });
      const result = await integratedGuard.checkBasket(basket);

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED);
      expect(result.details?.circuitTripped).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Venue Latency Spike Circuit Breaker
  // ──────────────────────────────────────────────────────────────────────────
  describe('4. Venue Latency Spike Circuit Breaker', () => {
    it('approves execution when all venues operate under 500ms latency', async () => {
      const basket = buildTestBasket({ notional: 2_000 });
      const result = await riskGuard.checkBasket(basket, {
        venueLatencies: { binance: 45, bybit: 110 },
      });

      expect(result.allowed).toBe(true);
      expect(result.checks?.venueLatencyOk).toBe(true);
    });

    it('halts execution with VENUE_LATENCY_SPIKE when buy venue spikes above 500ms', async () => {
      const basket = buildTestBasket({ notional: 2_000 });
      const result = await riskGuard.checkBasket(basket, {
        venueLatencies: { binance: 520, bybit: 80 },
      });

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.VENUE_LATENCY_SPIKE);
      expect(result.checks?.venueLatencyOk).toBe(false);
      expect(result.details?.venue).toBe('binance');
      expect(result.details?.latencyMs).toBe(520);
    });

    it('halts execution with VENUE_LATENCY_SPIKE when sell venue spikes above 500ms', async () => {
      const basket = buildTestBasket({ notional: 2_000 });
      const result = await riskGuard.checkBasket(basket, {
        venueLatencies: { binance: 120, bybit: 750 },
      });

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.VENUE_LATENCY_SPIKE);
      expect(result.checks?.venueLatencyOk).toBe(false);
      expect(result.details?.venue).toBe('bybit');
      expect(result.details?.latencyMs).toBe(750);
    });

    it('integrates with SpreadDetector latency metrics when context latency omitted', async () => {
      // Mock SpreadDetector returning high latency
      const mockSpreadDetector = {
        getExchangeLatency: vi.fn().mockImplementation((venue: string) => {
          if (venue === 'bybit') {
            return { avgLatency: 450, p95Latency: 600, p99Latency: 800 };
          }
          return { avgLatency: 100, p95Latency: 150, p99Latency: 200 };
        }),
      };

      const detectorGuard = new ArbitrageRiskGuard(
        { maxVenueLatencyMs: 500 },
        {
          spreadDetector:
            mockSpreadDetector as unknown as NonNullable<
              ArbitrageRiskGuardDependencies['spreadDetector']
            >,
        },
      );

      const basket = buildTestBasket({ notional: 1_000 });
      const result = await detectorGuard.checkBasket(basket);

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.VENUE_LATENCY_SPIKE);
      expect(result.details?.venue).toBe('bybit');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Paper Mode vs Live Mode Credential Checks
  // ──────────────────────────────────────────────────────────────────────────
  describe('5. Paper Mode vs Live Mode Credential Verification', () => {
    it('paper mode executes safely without any live API credentials', async () => {
      delete process.env.LIVE_TRADING_ENABLED;
      delete process.env.BINANCE_API_KEY;
      delete process.env.BYBIT_API_KEY;

      const basket = buildTestBasket({ notional: 2_000 });
      const result = await riskGuard.checkBasket(basket);

      expect(result.allowed).toBe(true);
      expect(result.checks?.credentialsOk).toBe(true);
    });

    it('live mode fails closed when LIVE_TRADING_ENABLED is missing or not true', async () => {
      const liveGuard = new ArbitrageRiskGuard({ mode: 'live' });
      process.env.LIVE_TRADING_ENABLED = 'false';

      const basket = buildTestBasket({ notional: 2_000 });
      const result = await liveGuard.checkBasket(basket, {
        venueBalances: { binance: 10_000, bybit: 10_000 },
      });

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.MISSING_LIVE_CREDENTIALS);
      expect(result.checks?.credentialsOk).toBe(false);
    });

    it('live mode fails closed when exchange API credentials are missing', async () => {
      const liveGuard = new ArbitrageRiskGuard({ mode: 'live' });
      process.env.LIVE_TRADING_ENABLED = 'true';
      delete process.env.BINANCE_API_KEY;
      delete process.env.BINANCE_API_SECRET;

      const basket = buildTestBasket({ notional: 2_000 });
      const result = await liveGuard.checkBasket(basket, {
        venueBalances: { binance: 10_000, bybit: 10_000 },
      });

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.MISSING_LIVE_CREDENTIALS);
    });

    it('live mode succeeds when LIVE_TRADING_ENABLED is true and credentials are provided', async () => {
      const liveGuard = new ArbitrageRiskGuard({ mode: 'live' });
      process.env.LIVE_TRADING_ENABLED = 'true';
      process.env.BINANCE_API_KEY = 'test-binance-key';
      process.env.BINANCE_API_SECRET = 'test-binance-secret';
      process.env.BYBIT_API_KEY = 'test-bybit-key';
      process.env.BYBIT_API_SECRET = 'test-bybit-secret';

      const basket = buildTestBasket({ notional: 2_000 });
      const result = await liveGuard.checkBasket(basket, {
        venueBalances: { binance: 10_000, bybit: 10_000 },
      });

      expect(result.allowed).toBe(true);
      expect(result.checks?.credentialsOk).toBe(true);
    });

    it('live mode validates Polymarket credentials for Polymarket legs', async () => {
      const liveGuard = new ArbitrageRiskGuard({ mode: 'live' });
      process.env.LIVE_TRADING_ENABLED = 'true';
      process.env.BINANCE_API_KEY = 'test-binance-key';
      process.env.BINANCE_API_SECRET = 'test-binance-secret';
      delete process.env.POLYMARKET_API_KEY;
      delete process.env.POLYMARKET_PRIVATE_KEY;

      const polyBasket = buildTestBasket({
        buyVenue: 'polymarket',
        sellVenue: 'binance',
        notional: 1_000,
      });

      const result = await liveGuard.checkBasket(polyBasket, {
        venueBalances: { polymarket: 5_000, binance: 5_000 },
      });

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.MISSING_LIVE_CREDENTIALS);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Pre-Trade Venue Balance Verification
  // ──────────────────────────────────────────────────────────────────────────
  describe('6. Pre-Trade Venue Balance Verification', () => {
    it('live mode fails closed when venue balance records are missing', async () => {
      const liveGuard = new ArbitrageRiskGuard({ mode: 'live' });
      process.env.LIVE_TRADING_ENABLED = 'true';
      process.env.BINANCE_API_KEY = 'k';
      process.env.BINANCE_API_SECRET = 's';
      process.env.BYBIT_API_KEY = 'k';
      process.env.BYBIT_API_SECRET = 's';

      const basket = buildTestBasket({ notional: 2_000 });
      // venueBalances completely omitted
      const result = await liveGuard.checkBasket(basket);

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.INSUFFICIENT_VENUE_BALANCE);
      expect(result.checks?.venueBalanceOk).toBe(false);
    });

    it('rejects trade when venue balance is insufficient for trade notional', async () => {
      const basket = buildTestBasket({ notional: 4_000 });
      const result = await riskGuard.checkBasket(basket, {
        venueBalances: {
          binance: 2_000, // $2k < $4k required
          bybit: 10_000,
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.INSUFFICIENT_VENUE_BALANCE);
      expect(result.checks?.venueBalanceOk).toBe(false);
      expect(result.details?.venue).toBe('binance');
      expect(result.details?.available).toBe(2_000);
      expect(result.details?.requiredNotional).toBe(4_000);
    });

    it('evaluates VenueBalanceSnapshot free balance accurately', async () => {
      const basket = buildTestBasket({ notional: 3_000 });

      const binanceSnapshot: VenueBalanceSnapshot = {
        venue: 'binance',
        asset: 'USDT',
        free: 5_000,
        locked: 10_000,
        total: 15_000,
      };

      const bybitSnapshot: VenueBalanceSnapshot = {
        venue: 'bybit',
        asset: 'USDT',
        free: 1_500, // free < 3000 required
        locked: 5_000,
        total: 6_500,
      };

      const result = await riskGuard.checkBasket(basket, {
        venueBalances: {
          binance: binanceSnapshot,
          bybit: bybitSnapshot,
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.INSUFFICIENT_VENUE_BALANCE);
      expect(result.details?.venue).toBe('bybit');
      expect(result.details?.available).toBe(1_500);
    });

    it('approves execution when all venues have sufficient free balance', async () => {
      const basket = buildTestBasket({ notional: 3_000 });

      const result = await riskGuard.checkBasket(basket, {
        venueBalances: {
          binance: 10_000,
          bybit: 12_000,
        },
      });

      expect(result.allowed).toBe(true);
      expect(result.checks?.venueBalanceOk).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Explicit Diagnostic Rejection Reasons & Schema Validation
  // ──────────────────────────────────────────────────────────────────────────
  describe('7. Explicit Diagnostic Rejection Reasons & Schema Validation', () => {
    it('enumerates all 8 required rejection codes exactly', () => {
      const expectedCodes = [
        'DRAWDOWN_BREAKER_TRIPPED',
        'VENUE_LATENCY_SPIKE',
        'EXCEEDS_KELLY_CAP',
        'EXCEEDS_NOTIONAL_CAP',
        'EXCEEDS_VENUE_CAP',
        'EXCEEDS_SYMBOL_CAP',
        'INSUFFICIENT_VENUE_BALANCE',
        'MISSING_LIVE_CREDENTIALS',
      ];

      for (const code of expectedCodes) {
        expect(ArbitrageRejectionReason[code as keyof typeof ArbitrageRejectionReason]).toBe(code);
      }
    });

    it('validates ArbitrageRiskConfig against Zod schema', () => {
      const validConfig: ArbitrageRiskConfig = {
        capitalUsdc: 150_000,
        maxPerTradeNotionalUsd: 15_000,
        maxOpenPositionPerVenueUsd: 60_000,
        maxOpenPositionPerSymbolUsd: 30_000,
        maxDailyDrawdownFraction: 0.15,
        maxVenueLatencyMs: 500,
        kellyFraction: 0.25,
        maxKellyPositionFraction: 0.05,
        mode: 'paper',
        minHurdleBps: 10,
      };

      const parsed = ArbitrageRiskConfigSchema.parse(validConfig);
      expect(parsed.capitalUsdc).toBe(150_000);
      expect(parsed.mode).toBe('paper');
    });

    it('rejects invalid ArbitrageRiskConfig in Zod validation', () => {
      expect(() =>
        ArbitrageRiskConfigSchema.parse({
          capitalUsdc: -100, // Invalid negative capital
          maxPerTradeNotionalUsd: 5_000,
          maxOpenPositionPerVenueUsd: 20_000,
          maxOpenPositionPerSymbolUsd: 10_000,
        }),
      ).toThrow();
    });

    it('validates MultiLegArbitrageBasket against Zod schema', () => {
      const basket = buildTestBasket({ notional: 2_500 });
      const parsed = MultiLegArbitrageBasketSchema.parse(basket);
      expect(parsed.legs.length).toBe(2);
      expect(parsed.totalNotionalUsd).toBe(2_500);
    });

    it('validates ArbitrageRiskCheckResult against Zod schema', async () => {
      const basket = buildTestBasket({ notional: 2_000 });
      const result = await riskGuard.checkBasket(basket);

      const parsed = ArbitrageRiskCheckResultSchema.parse(result);
      expect(parsed.allowed).toBe(true);
      expect(parsed.checks?.kellyCapOk).toBe(true);
    });

    it('validates VenueBalanceSnapshot against Zod schema', () => {
      const snapshot: VenueBalanceSnapshot = {
        venue: 'binance',
        asset: 'USDT',
        free: 10_000,
        locked: 2_000,
        total: 12_000,
      };

      const parsed = VenueBalanceSnapshotSchema.parse(snapshot);
      expect(parsed.free).toBe(10_000);
    });

    it('provides legacy checkPreTrade compatibility with ArbitrageRiskCheckParams', async () => {
      const legacyRes = await riskGuard.checkPreTrade({
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        tradeNotionalUsd: 3_000,
        bankrollUsd: 100_000,
        netProfitBps: 20,
        venueLatencies: { binance: 50, bybit: 60 },
        venueBalances: { binance: 10_000, bybit: 10_000 },
      });

      expect(legacyRes.allowed).toBe(true);
      expect(legacyRes.adjustedNotionalUsd).toBe(3_000);
    });
  });
});
