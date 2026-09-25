/**
 * Empirical Challenger Stress Test Suite for Milestone 2:
 * Pre-Trade Risk Gates, Mode Switching & Balance Verification in ArbitrageRiskGuard
 *
 * Target: src/desk/arbitrage/arbitrage-risk-guard.ts
 *
 * Test Scenarios:
 * 1. Live trading mode with missing or partial credentials across venues:
 *    - Missing Binance key
 *    - Missing Bybit secret
 *    - Missing KuCoin passphrase
 *    - Missing Polymarket key / private key
 *    - Generic unconfigured CEX venue fallback vulnerability
 *    - Mode switching between paper and live
 * 2. Pre-trade venue balance verification & currency mismatch:
 *    - Leg 1 sufficient, Leg 2 zero balance
 *    - Omitted venue balance in live vs paper mode
 *    - Locked balance vs free balance
 *    - Exact floating boundary conditions
 *    - Asset denomination & currency mismatch (BTC vs USDT vs DOGE)
 * 3. Concurrent multi-thread/async re-entrancy & exposure tracking:
 *    - Concurrent checkBasket TOCTOU race conditions
 *    - Double-counting of symbol exposure on multi-leg baskets
 *    - Inconsistency between basket overload and legacy overload
 *    - NaN injection & permanently blinded exposure gates
 *    - High-volume concurrent interleaving
 *
 * @module tests/desk/arbitrage/m2-challenger-stress.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ArbitrageRiskGuard,
  type MultiLegArbitrageBasket,
  type VenueBalanceSnapshot,
  ArbitrageRejectionReason,
} from '../../../src/desk/arbitrage/arbitrage-risk-guard';

describe('Challenger M2-2: Mode Switching, Balance & Exposure Stress Suite', () => {
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

  function buildBasket(options?: {
    symbol?: string;
    buyVenue?: string;
    sellVenue?: string;
    amount?: number;
    price?: number;
    notional?: number;
    winProbability?: number;
    winLossRatio?: number;
  }): MultiLegArbitrageBasket {
    const symbol = options?.symbol ?? 'BTC/USDT';
    const buyVenue = options?.buyVenue ?? 'binance';
    const sellVenue = options?.sellVenue ?? 'bybit';
    const amount = options?.amount ?? 1.0;
    const price = options?.price ?? 2_000;
    const notional = options?.notional ?? amount * price;

    return {
      basketId: `basket-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      opportunityId: 'opp-stress-1',
      strategyKey: 'arb-challenger-stress',
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
      winProbability: options?.winProbability ?? 0.95,
      winLossRatio: options?.winLossRatio ?? 1.0,
      createdAt: Date.now(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Live Trading Mode: Missing & Partial Credentials Across Venues
  // ═══════════════════════════════════════════════════════════════════════════
  describe('1. Live Trading Mode Credential Verification & Mode Switching', () => {
    it('1.1: rejects live trade when Binance API key is missing (only secret present)', async () => {
      const liveGuard = new ArbitrageRiskGuard({ mode: 'live' });
      process.env.LIVE_TRADING_ENABLED = 'true';
      delete process.env.BINANCE_API_KEY;
      process.env.BINANCE_API_SECRET = 'binance-secret-xyz';
      process.env.BYBIT_API_KEY = 'bybit-key-xyz';
      process.env.BYBIT_API_SECRET = 'bybit-secret-xyz';

      const basket = buildBasket({ buyVenue: 'binance', sellVenue: 'bybit', notional: 2_000 });
      const result = await liveGuard.checkBasket(basket, {
        venueBalances: { binance: 10_000, bybit: 10_000 },
      });

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.MISSING_LIVE_CREDENTIALS);
      expect(result.checks?.credentialsOk).toBe(false);
    });

    it('1.2: rejects live trade when Bybit API secret is missing (only key present)', async () => {
      const liveGuard = new ArbitrageRiskGuard({ mode: 'live' });
      process.env.LIVE_TRADING_ENABLED = 'true';
      process.env.BINANCE_API_KEY = 'binance-key-xyz';
      process.env.BINANCE_API_SECRET = 'binance-secret-xyz';
      process.env.BYBIT_API_KEY = 'bybit-key-xyz';
      delete process.env.BYBIT_API_SECRET;

      const basket = buildBasket({ buyVenue: 'binance', sellVenue: 'bybit', notional: 2_000 });
      const result = await liveGuard.checkBasket(basket, {
        venueBalances: { binance: 10_000, bybit: 10_000 },
      });

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.MISSING_LIVE_CREDENTIALS);
      expect(result.checks?.credentialsOk).toBe(false);
    });

    it('1.3: fails closed when KuCoin is missing passphrase while API key and secret are set', async () => {
      const liveGuard = new ArbitrageRiskGuard({ mode: 'live' });
      process.env.LIVE_TRADING_ENABLED = 'true';
      process.env.BINANCE_API_KEY = 'binance-key-xyz';
      process.env.BINANCE_API_SECRET = 'binance-secret-xyz';
      process.env.KUCOIN_API_KEY = 'kucoin-key-xyz';
      process.env.KUCOIN_API_SECRET = 'kucoin-secret-xyz';
      delete process.env.KUCOIN_PASSPHRASE;
      delete process.env.KUCOIN_PASSWORD;

      const basket = buildBasket({ buyVenue: 'binance', sellVenue: 'kucoin', notional: 2_000 });
      const result = await liveGuard.checkBasket(basket, {
        venueBalances: { binance: 10_000, kucoin: 10_000 },
      });

      // KuCoin API strictly requires apiKey + secret + passphrase for trading execution.
      // Remediated: Fails closed when KuCoin passphrase is missing
      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.MISSING_LIVE_CREDENTIALS);
      expect(result.checks?.credentialsOk).toBe(false);
    });

    it('1.4: rejects live trade when Polymarket key and private key are completely missing', async () => {
      const liveGuard = new ArbitrageRiskGuard({ mode: 'live' });
      process.env.LIVE_TRADING_ENABLED = 'true';
      process.env.BINANCE_API_KEY = 'binance-key-xyz';
      process.env.BINANCE_API_SECRET = 'binance-secret-xyz';
      delete process.env.POLYMARKET_API_KEY;
      delete process.env.POLYMARKET_PRIVATE_KEY;

      const basket = buildBasket({ buyVenue: 'polymarket', sellVenue: 'binance', notional: 2_000 });
      const result = await liveGuard.checkBasket(basket, {
        venueBalances: { polymarket: 10_000, binance: 10_000 },
      });

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.MISSING_LIVE_CREDENTIALS);
    });

    it('1.5: rejects live trade when Polymarket has API key but lacks private key (wallet signing key)', async () => {
      const liveGuard = new ArbitrageRiskGuard({ mode: 'live' });
      process.env.LIVE_TRADING_ENABLED = 'true';
      process.env.BINANCE_API_KEY = 'binance-key-xyz';
      process.env.BINANCE_API_SECRET = 'binance-secret-xyz';
      process.env.POLYMARKET_API_KEY = 'poly-read-only-api-key';
      delete process.env.POLYMARKET_PRIVATE_KEY;

      const basket = buildBasket({ buyVenue: 'polymarket', sellVenue: 'binance', notional: 2_000 });
      const result = await liveGuard.checkBasket(basket, {
        venueBalances: { polymarket: 10_000, binance: 10_000 },
      });

      // Remediated: Polymarket CLOB requires private key for order signing; fails closed
      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.MISSING_LIVE_CREDENTIALS);
      expect(result.checks?.credentialsOk).toBe(false);
    });

    it('1.6: fails closed on generic CEX venue with zero credentials configured', async () => {
      const liveGuard = new ArbitrageRiskGuard({ mode: 'live' });
      process.env.LIVE_TRADING_ENABLED = 'true';
      process.env.BINANCE_API_KEY = 'binance-key-xyz';
      process.env.BINANCE_API_SECRET = 'binance-secret-xyz';
      delete process.env.OKX_API_KEY;
      delete process.env.OKX_API_SECRET;

      // Leg 2 is on OKX
      const basket = buildBasket({ buyVenue: 'binance', sellVenue: 'okx', notional: 2_000 });
      const result = await liveGuard.checkBasket(basket, {
        venueBalances: { binance: 10_000, okx: 10_000 },
      });

      // Remediated: Unconfigured generic venues fail closed in live mode
      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.MISSING_LIVE_CREDENTIALS);
      expect(result.checks?.credentialsOk).toBe(false);
    });

    it('1.7: dynamic mode switching enforces credentials immediately without lingering state', async () => {
      delete process.env.LIVE_TRADING_ENABLED;
      delete process.env.BINANCE_API_KEY;
      delete process.env.BYBIT_API_KEY;

      const basket = buildBasket({ notional: 2_000 });

      // Step A: In paper mode -> Allowed
      expect(riskGuard.getConfig().mode).toBe('paper');
      const paperRes = await riskGuard.checkBasket(basket);
      expect(paperRes.allowed).toBe(true);

      // Step B: Switch dynamically to live mode -> Immediately Rejected
      riskGuard.updateConfig({ mode: 'live' });
      expect(riskGuard.getConfig().mode).toBe('live');

      const liveRes = await riskGuard.checkBasket(basket, {
        venueBalances: { binance: 10_000, bybit: 10_000 },
      });
      expect(liveRes.allowed).toBe(false);
      expect(liveRes.rejectionReason).toBe(ArbitrageRejectionReason.MISSING_LIVE_CREDENTIALS);

      // Step C: Switch back to paper mode -> Immediately Allowed again
      riskGuard.updateConfig({ mode: 'paper' });
      const paperRes2 = await riskGuard.checkBasket(basket);
      expect(paperRes2.allowed).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Pre-Trade Venue Balance Verification & Currency Mismatch Scenarios
  // ═══════════════════════════════════════════════════════════════════════════
  describe('2. Pre-Trade Venue Balance Verification & Currency Mismatch', () => {
    it('2.1: rejects trade when Leg 1 has ample balance ($10,000) but Leg 2 has $0 balance', async () => {
      const basket = buildBasket({
        buyVenue: 'binance',
        sellVenue: 'bybit',
        notional: 2_000,
      });

      const result = await riskGuard.checkBasket(basket, {
        venueBalances: {
          binance: 10_000,
          bybit: 0,
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.INSUFFICIENT_VENUE_BALANCE);
      expect(result.checks?.venueBalanceOk).toBe(false);
      expect(result.details?.venue).toBe('bybit');
      expect(result.details?.available).toBe(0);
      expect(result.details?.requiredNotional).toBe(2_000);
    });

    it('2.2: live mode rejects trade when Leg 2 is omitted from venueBalances', async () => {
      const liveGuard = new ArbitrageRiskGuard({ mode: 'live' });
      process.env.LIVE_TRADING_ENABLED = 'true';
      process.env.BINANCE_API_KEY = 'k';
      process.env.BINANCE_API_SECRET = 's';
      process.env.BYBIT_API_KEY = 'k';
      process.env.BYBIT_API_SECRET = 's';

      const basket = buildBasket({
        buyVenue: 'binance',
        sellVenue: 'bybit',
        notional: 2_000,
      });

      // bybit balance is completely omitted
      const result = await liveGuard.checkBasket(basket, {
        venueBalances: {
          binance: 10_000,
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.INSUFFICIENT_VENUE_BALANCE);
      expect(result.details?.venue).toBe('bybit');
    });

    it('2.3: paper mode ignores omitted venue balances when partial balances provided', async () => {
      const basket = buildBasket({
        buyVenue: 'binance',
        sellVenue: 'bybit',
        notional: 2_000,
      });

      // bybit balance omitted in paper mode
      const result = await riskGuard.checkBasket(basket, {
        venueBalances: {
          binance: 10_000,
        },
      });

      // In paper mode, line 821 does 'continue;' when venue is missing from balances
      expect(result.allowed).toBe(true);
      expect(result.checks?.venueBalanceOk).toBe(true);
    });

    it('2.4: rejects trade when free balance is 0 even if locked balance is large', async () => {
      const basket = buildBasket({ notional: 2_500 });

      const binanceSnapshot: VenueBalanceSnapshot = {
        venue: 'binance',
        asset: 'USDT',
        free: 5_000,
        locked: 0,
        total: 5_000,
      };

      const bybitSnapshot: VenueBalanceSnapshot = {
        venue: 'bybit',
        asset: 'USDT',
        free: 0, // 0 free balance!
        locked: 100_000, // $100k locked in other orders
        total: 100_000,
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
      expect(result.details?.available).toBe(0);
    });

    it('2.5: exact floating boundary - rejects when free is 0.001 under notional, approves when equal', async () => {
      const basket = buildBasket({ notional: 2_000 });

      // Case A: 1999.999 < 2000
      const rejectRes = await riskGuard.checkBasket(basket, {
        venueBalances: {
          binance: 2_000,
          bybit: 1_999.999,
        },
      });
      expect(rejectRes.allowed).toBe(false);
      expect(rejectRes.rejectionReason).toBe(ArbitrageRejectionReason.INSUFFICIENT_VENUE_BALANCE);

      // Case B: exactly 2000.000 >= 2000
      const approveRes = await riskGuard.checkBasket(basket, {
        venueBalances: {
          binance: 2_000,
          bybit: 2_000,
        },
      });
      expect(approveRes.allowed).toBe(true);
    });

    it('2.6: currency denomination matches base asset for sell leg', async () => {
      // Trade: Buy 0.05 BTC at $40,000 ($2,000 notional) on Binance, Sell 0.05 BTC on Bybit.
      // On Bybit, the trader holds 0.10 BTC in base asset.
      // Remediated: ArbitrageRiskGuard matches base asset for sell leg (0.10 BTC >= 0.05 BTC required)
      const basket = buildBasket({
        symbol: 'BTC/USDT',
        amount: 0.05,
        price: 40_000, // notional = $2,000
        notional: 2_000,
      });

      const bybitBtcSnapshot: VenueBalanceSnapshot = {
        venue: 'bybit',
        asset: 'BTC',
        free: 0.10, // 0.10 BTC >= 0.05 BTC required amount
      };

      const result = await riskGuard.checkBasket(basket, {
        venueBalances: {
          binance: 5_000,
          bybit: bybitBtcSnapshot,
        },
      });

      expect(result.allowed).toBe(true);
      expect(result.checks?.venueBalanceOk).toBe(true);

      // Conversely, if free BTC is insufficient (0.02 BTC < 0.05 BTC required):
      const insufficientBtcSnapshot: VenueBalanceSnapshot = {
        venue: 'bybit',
        asset: 'BTC',
        free: 0.02,
      };
      const rejectRes = await riskGuard.checkBasket(basket, {
        venueBalances: {
          binance: 5_000,
          bybit: insufficientBtcSnapshot,
        },
      });
      expect(rejectRes.allowed).toBe(false);
      expect(rejectRes.rejectionReason).toBe(ArbitrageRejectionReason.INSUFFICIENT_VENUE_BALANCE);
      expect(rejectRes.details?.available).toBe(0.02);
      expect(rejectRes.details?.requiredAmount).toBe(0.05);
    });

    it('2.7: rejects under-collateralized altcoin snapshot with asset mismatch', async () => {
      // Trader has 50,000 SHIB tokens.
      // Remediated: SHIB is neither BTC (base) nor USDT (quote); rejected fail-closed
      const basket = buildBasket({ notional: 3_000 });

      const bybitShibSnapshot: VenueBalanceSnapshot = {
        venue: 'bybit',
        asset: 'SHIB',
        free: 50_000,
      };

      const result = await riskGuard.checkBasket(basket, {
        venueBalances: {
          binance: 5_000,
          bybit: bybitShibSnapshot,
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.INSUFFICIENT_VENUE_BALANCE);
      expect(result.checks?.venueBalanceOk).toBe(false);
    });

    it('2.8: structural limitation - ArbitrageRiskContext.venueBalances can only store one asset per venue', () => {
      // In a real multi-exchange arbitrage execution, Binance might need USDT to buy BTC,
      // and Bybit might need BTC to sell BTC.
      // But venueBalances is type Record<string, VenueBalanceSnapshot | number> keyed by venue.
      const balances: Record<string, VenueBalanceSnapshot> = {};

      const btcSnapshot: VenueBalanceSnapshot = {
        venue: 'binance',
        asset: 'BTC',
        free: 1.0,
      };

      const usdtSnapshot: VenueBalanceSnapshot = {
        venue: 'binance',
        asset: 'USDT',
        free: 10_000,
      };

      balances['binance'] = btcSnapshot;
      balances['binance'] = usdtSnapshot; // Overwrites BTC snapshot!

      expect(Object.keys(balances).length).toBe(1);
      expect(balances['binance'].asset).toBe('USDT');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Concurrency, Re-entrancy & Exposure Tracking Stress Tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe('3. Concurrency, Re-entrancy & Exposure Tracking Stress Tests', () => {
    it('3.1: TOCTOU race condition - concurrent checkBasket calls pass before recordTradeOpened', async () => {
      // Venue limit = $50,000. Capital = $100,000.
      // If 4 trades of $4,000 each are evaluated concurrently before any recordTradeOpened occurs:
      // All 4 trades observe 0 open venue exposure and approve.
      const baskets = Array.from({ length: 4 }, () =>
        buildBasket({ notional: 4_000, buyVenue: 'binance', sellVenue: 'bybit' }),
      );

      const results = await Promise.all(baskets.map((b) => riskGuard.checkBasket(b)));
      expect(results.every((r) => r.allowed)).toBe(true);

      // Now all 4 trades commit exposure
      for (const b of baskets) {
        riskGuard.recordTradeOpened(b);
      }

      // In-flight venue exposure is now $16,000
      expect(riskGuard.getExposures().venues['binance']).toBe(16_000);
      expect(riskGuard.getExposures().venues['bybit']).toBe(16_000);
    });

    it('3.2: does not double-count symbol exposure on multi-leg basket', () => {
      // Basket has Leg 1: buy BTC/USDT $2,000, Leg 2: sell BTC/USDT $2,000.
      // Basket total notional is $2,000.
      const basket = buildBasket({
        symbol: 'BTC/USDT',
        notional: 2_000,
      });

      riskGuard.recordTradeOpened(basket);

      // Remediated: intra-basket exposure deduplicated to max leg notional ($2,000)
      const exposures = riskGuard.getExposures();
      expect(exposures.symbols['BTC/USDT']).toBe(2_000);
    });

    it('3.3: consistency between basket overload and legacy overload of recordTradeOpened', () => {
      const guardA = new ArbitrageRiskGuard();
      const guardB = new ArbitrageRiskGuard();

      const basket = buildBasket({
        symbol: 'ETH/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        notional: 3_000,
      });

      // Guard A uses basket overload
      guardA.recordTradeOpened(basket);

      // Guard B uses legacy parameter overload
      guardB.recordTradeOpened('ETH/USDT', 'binance', 'bybit', 3_000);

      // Remediated: Both overloads record identical $3,000 symbol exposure
      expect(guardA.getExposures().symbols['ETH/USDT']).toBe(3_000);
      expect(guardB.getExposures().symbols['ETH/USDT']).toBe(3_000);
    });

    it('3.4: consistency between checkBasket symbol validation and recordTradeOpened', async () => {
      // Symbol limit is $5,000. Basket notional is $3,000.
      const strictGuard = new ArbitrageRiskGuard({
        maxOpenPositionPerSymbolUsd: 5_000,
      });

      const basket = buildBasket({
        symbol: 'SOL/USDT',
        notional: 3_000,
      });

      // In checkBasket, intra-basket deduplication evaluates symbol exposure correctly
      const result = await strictGuard.checkBasket(basket);
      expect(result.allowed).toBe(true);

      // Recorded trade:
      strictGuard.recordTradeOpened(basket);
      // Symbol exposure is $3,000, which is safely within the $5,000 limit
      expect(strictGuard.getExposures().symbols['SOL/USDT']).toBe(3_000);

      // Subsequent trade of $3,000 on SOL/USDT will breach limit (3,000 + 3,000 = 6,000 > 5,000)
      const nextBasket = buildBasket({ symbol: 'SOL/USDT', notional: 3_000 });
      const nextResult = await strictGuard.checkBasket(nextBasket);
      expect(nextResult.allowed).toBe(false);
      expect(nextResult.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_SYMBOL_CAP);
      expect(nextResult.details?.limitType).toBe('symbol');
    });

    it('3.5: sanitizes NaN notional inputs to prevent poisoning exposure map', async () => {
      const guard = new ArbitrageRiskGuard({
        capitalUsdc: 100_000,
        maxOpenPositionPerVenueUsd: 5_000, // Small venue limit of $5,000
        maxPerTradeNotionalUsd: 10_000,
      });

      // Attempt to poison venue exposure with NaN
      guard.recordTradeOpened('BTC/USDT', 'binance', 'bybit', NaN);

      // Remediated: The exposure map sanitizes NaN and remains 0:
      expect(guard.getExposures().venues['binance'] ?? 0).toBe(0);

      // Now attempt a trade of $4,000 on binance:
      const basket1 = buildBasket({
        buyVenue: 'binance',
        sellVenue: 'bybit',
        notional: 4_000,
      });

      const res1 = await guard.checkBasket(basket1);
      expect(res1.checks?.venueCapOk).toBe(true);
      expect(res1.allowed).toBe(true);

      // Record first trade
      guard.recordTradeOpened(basket1);
      // Venue exposure is cleanly $4,000
      expect(guard.getExposures().venues['binance']).toBe(4_000);

      // Now attempt a second trade of $4,000.
      // Total exposure would be $8,000 > $5,000 limit and MUST REJECT:
      const basket2 = buildBasket({
        buyVenue: 'binance',
        sellVenue: 'bybit',
        notional: 4_000,
      });
      const res2 = await guard.checkBasket(basket2);

      // Remediated: Gate functions properly and rejects trade exceeding venue limit
      expect(res2.checks?.venueCapOk).toBe(false);
      expect(res2.allowed).toBe(false);
      expect(res2.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_VENUE_CAP);
    });

    it('3.6: high-concurrency interleaved open/close stress test maintains zero leaks on clean balances', async () => {
      const concurrency = 200;
      const tradeAmount = 50;

      // Run 200 concurrent simulated trade lifecycles (open -> close)
      const tasks = Array.from({ length: concurrency }, async (_, i) => {
        const symbol = i % 2 === 0 ? 'BTC/USDT' : 'ETH/USDT';
        riskGuard.recordTradeOpened(symbol, 'binance', 'bybit', tradeAmount);
        // Small async jitter
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
        riskGuard.recordTradeClosed(symbol, 'binance', 'bybit', tradeAmount);
      });

      await Promise.all(tasks);

      const finalExposures = riskGuard.getExposures();
      expect(finalExposures.venues['binance']).toBe(0);
      expect(finalExposures.venues['bybit']).toBe(0);
      expect(finalExposures.symbols['BTC/USDT']).toBe(0);
      expect(finalExposures.symbols['ETH/USDT']).toBe(0);
    });

    it('3.7: recordTradeClosed floors at 0 and does not wrap to negative exposure', () => {
      // Close trade without prior open
      riskGuard.recordTradeClosed('BTC/USDT', 'binance', 'bybit', 5_000);

      const exposures = riskGuard.getExposures();
      expect(exposures.venues['binance']).toBe(0);
      expect(exposures.venues['bybit']).toBe(0);
      expect(exposures.symbols['BTC/USDT']).toBe(0);
    });
  });
});
