/**
 * Unit tests for Arbitrage Risk Guard submodules: sizing, drawdown, balance, and latency.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  calculateBasketNotional,
  computeQuarterKellySizingFormula,
  evaluateSizingGates,
} from '../../../src/desk/arbitrage/risk/arbitrage-risk-guard-sizing';
import {
  evaluateDrawdownBreaker,
} from '../../../src/desk/arbitrage/risk/arbitrage-risk-guard-drawdown';
import {
  evaluateVenueLatency,
  verifyLiveCredentials,
} from '../../../src/desk/arbitrage/risk/arbitrage-risk-guard-latency-credentials';
import {
  parseSymbolAssets,
  isQuoteEquivalent,
  verifyBuyLegBalance,
  verifySellLegBalance,
} from '../../../src/desk/arbitrage/risk/arbitrage-risk-guard-balance-helpers';
import { ExposureTracker } from '../../../src/desk/arbitrage/risk/arbitrage-risk-guard-exposure';
import { KellyPositionSizer } from '../../../src/desk/risk/kelly-position-sizer';
import { DEFAULT_ARBITRAGE_RISK_CONFIG } from '../../../src/desk/arbitrage/risk/arbitrage-risk-types';
import type { MultiLegArbitrageBasket, ArbitrageRiskGateChecks } from '../../../src/desk/arbitrage/risk/arbitrage-risk-types';

describe('Arbitrage Risk Submodules', () => {
  describe('arbitrage-risk-guard-sizing', () => {
    it('computes Quarter-Kelly sizing formula with edge and caps', () => {
      // requested: 10000, bankroll: 100000, p: 0.6, b: 1.5, maxKellyFraction: 0.05, maxPerTradeNotional: 5000
      const notional = computeQuarterKellySizingFormula(
        10000,
        100000,
        0.6,
        1.5,
        0.05,
        5000,
      );

      expect(notional).toBeLessThanOrEqual(5000);
      expect(notional).toBeGreaterThan(0);
    });

    it('returns zero position size on non-positive edge or non-positive parameters', () => {
      expect(computeQuarterKellySizingFormula(10000, 100000, 0.4, 1.0, 0.05, 5000)).toBe(0);
      expect(computeQuarterKellySizingFormula(0, 100000, 0.6, 1.5, 0.05, 5000)).toBe(0);
      expect(computeQuarterKellySizingFormula(10000, 0, 0.6, 1.5, 0.05, 5000)).toBe(0);
      expect(computeQuarterKellySizingFormula(10000, 100000, 0, 1.5, 0.05, 5000)).toBe(0);
      expect(computeQuarterKellySizingFormula(10000, 100000, 0.6, 0, 0.05, 5000)).toBe(0);
    });

    it('calculates basket notional correctly with and without totalNotionalUsd override', () => {
      const basket: MultiLegArbitrageBasket = {
        legs: [
          { legId: '1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 1, price: 50000 },
          { legId: '2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', amount: 1, price: 50200 },
        ],
      };
      expect(calculateBasketNotional(basket)).toBe(100200);

      const basketWithOverride: MultiLegArbitrageBasket = {
        totalNotionalUsd: 99999,
        legs: [],
      };
      expect(calculateBasketNotional(basketWithOverride)).toBe(99999);
    });

    it('evaluates sizing gates and flags notional cap breach', () => {
      const sizer = new KellyPositionSizer();
      const mockLiveGuard = { guardOrder: vi.fn().mockReturnValue({ approved: true }) } as any;
      const checks: ArbitrageRiskGateChecks = {
        credentialsOk: true,
        balancesOk: true,
        venueCapsOk: true,
        symbolCapsOk: true,
        notionalCapOk: true,
        kellyCapOk: true,
        drawdownBreakerOk: true,
        venueLatencyOk: true,
        profitHurdleOk: true,
      };

      const basket: MultiLegArbitrageBasket = {
        legs: [{ legId: '1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 1, price: 60000 }],
      };

      const result = evaluateSizingGates(
        basket,
        60000,
        undefined,
        checks,
        {
          config: { ...DEFAULT_ARBITRAGE_RISK_CONFIG, maxPerTradeNotionalUsd: 50000 },
          kellyPositionSizer: sizer,
          liveExecutionGuard: mockLiveGuard,
        },
      );

      expect(result.errorResult).not.toBeNull();
      expect(result.errorResult?.allowed).toBe(false);
      expect(checks.notionalCapOk).toBe(false);
    });

    it('evaluates sizing gates with Polymarket orders and unapproved rejection', () => {
      const sizer = new KellyPositionSizer();
      const mockLiveGuard = {
        guardOrder: vi.fn().mockReturnValue({ approved: false, reason: 'Exceeds poly risk limit' }),
      } as any;
      const checks: ArbitrageRiskGateChecks = {
        credentialsOk: true,
        balancesOk: true,
        venueCapsOk: true,
        symbolCapsOk: true,
        notionalCapOk: true,
        kellyCapOk: true,
        drawdownBreakerOk: true,
        venueLatencyOk: true,
        profitHurdleOk: true,
      };

      const basket: MultiLegArbitrageBasket = {
        legs: [{ legId: '1', venue: 'polymarket', symbol: 'POLY-1', side: 'buy', amount: 100, price: 0.5 }],
      };

      const result = evaluateSizingGates(
        basket,
        50,
        undefined,
        checks,
        {
          config: { ...DEFAULT_ARBITRAGE_RISK_CONFIG, maxPerTradeNotionalUsd: 50000 },
          kellyPositionSizer: sizer,
          liveExecutionGuard: mockLiveGuard,
        },
      );

      expect(result.errorResult).not.toBeNull();
      expect(result.errorResult?.allowed).toBe(false);
      expect(result.errorResult?.details?.reason).toBe('Exceeds poly risk limit');
    });

    it('evaluates sizing gates with autoAdjustSizing enabled', () => {
      const sizer = {
        calculatePositionSize: vi.fn().mockReturnValue({ positionSizeUsd: 500, fractionUsed: 0.05 }),
      } as any;
      const mockLiveGuard = { guardOrder: vi.fn().mockReturnValue({ approved: true }) } as any;
      const checks: ArbitrageRiskGateChecks = {
        credentialsOk: true,
        balancesOk: true,
        venueCapsOk: true,
        symbolCapsOk: true,
        notionalCapOk: true,
        kellyCapOk: true,
        drawdownBreakerOk: true,
        venueLatencyOk: true,
        profitHurdleOk: true,
      };

      const basket: MultiLegArbitrageBasket = {
        winProbability: 0.6,
        winLossRatio: 1.5,
        legs: [{ legId: '1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 1, price: 1000 }],
      };

      const result = evaluateSizingGates(
        basket,
        1000,
        undefined,
        checks,
        {
          config: { ...DEFAULT_ARBITRAGE_RISK_CONFIG, autoAdjustSizing: true },
          kellyPositionSizer: sizer,
          liveExecutionGuard: mockLiveGuard,
        },
      );

      expect(result.errorResult).toBeNull();
      expect(checks.kellyCapOk).toBe(true);
    });
  });

  describe('arbitrage-risk-guard-drawdown', () => {
    it('rejects trade when current drawdown breaches max daily drawdown', async () => {
      const checks: ArbitrageRiskGateChecks = {
        credentialsOk: true,
        balancesOk: true,
        venueCapsOk: true,
        symbolCapsOk: true,
        notionalCapOk: true,
        kellyCapOk: true,
        drawdownBreakerOk: true,
        venueLatencyOk: true,
        profitHurdleOk: true,
      };

      const mockLiveGuard = { getStatus: vi.fn().mockReturnValue({ circuitTripped: false, dailyPnl: 0 }) } as any;
      const mockRiskGateManager = { check: vi.fn().mockResolvedValue({ allowed: true }) } as any;

      const basket: MultiLegArbitrageBasket = { legs: [] };
      const res = await evaluateDrawdownBreaker(
        basket,
        { currentDrawdown: 0.20 },
        checks,
        {
          config: { ...DEFAULT_ARBITRAGE_RISK_CONFIG, maxDailyDrawdownFraction: 0.15 },
          liveExecutionGuard: mockLiveGuard,
          riskGateManager: mockRiskGateManager,
        },
      );

      expect(res).not.toBeNull();
      expect(res?.allowed).toBe(false);
      expect(checks.drawdownBreakerOk).toBe(false);
    });

    it('passes trade when drawdown is within limit', async () => {
      const checks: ArbitrageRiskGateChecks = {
        credentialsOk: true,
        balancesOk: true,
        venueCapsOk: true,
        symbolCapsOk: true,
        notionalCapOk: true,
        kellyCapOk: true,
        drawdownBreakerOk: true,
        venueLatencyOk: true,
        profitHurdleOk: true,
      };

      const mockLiveGuard = { getStatus: vi.fn().mockReturnValue({ circuitTripped: false, dailyPnl: 0 }) } as any;
      const mockRiskGateManager = { check: vi.fn().mockResolvedValue({ allowed: true }) } as any;

      const basket: MultiLegArbitrageBasket = { legs: [] };
      const res = await evaluateDrawdownBreaker(
        basket,
        { currentDrawdown: 0.05 },
        checks,
        {
          config: { ...DEFAULT_ARBITRAGE_RISK_CONFIG, maxDailyDrawdownFraction: 0.15 },
          liveExecutionGuard: mockLiveGuard,
          riskGateManager: mockRiskGateManager,
        },
      );

      expect(res).toBeNull();
      expect(checks.drawdownBreakerOk).toBe(true);
    });
  });

  describe('arbitrage-risk-guard-latency-credentials', () => {
    it('rejects trade when venue latency exceeds threshold', async () => {
      const checks: ArbitrageRiskGateChecks = {
        credentialsOk: true,
        balancesOk: true,
        venueCapsOk: true,
        symbolCapsOk: true,
        notionalCapOk: true,
        kellyCapOk: true,
        drawdownBreakerOk: true,
        venueLatencyOk: true,
        profitHurdleOk: true,
      };

      const basket: MultiLegArbitrageBasket = {
        legs: [{ legId: '1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 1, price: 50000 }],
      };

      const res = await evaluateVenueLatency(
        basket,
        { venueLatencies: { binance: 350 } },
        checks,
        {
          config: { ...DEFAULT_ARBITRAGE_RISK_CONFIG, maxVenueLatencyMs: 200 },
        },
      );

      expect(res).not.toBeNull();
      expect(res?.allowed).toBe(false);
      expect(checks.venueLatencyOk).toBe(false);
    });

    it('queries spreadDetector when venueLatencies context is missing', async () => {
      const checks: ArbitrageRiskGateChecks = {
        credentialsOk: true,
        balancesOk: true,
        venueCapsOk: true,
        symbolCapsOk: true,
        notionalCapOk: true,
        kellyCapOk: true,
        drawdownBreakerOk: true,
        venueLatencyOk: true,
        profitHurdleOk: true,
      };

      const basket: MultiLegArbitrageBasket = {
        legs: [{ legId: '1', venue: 'okx', symbol: 'ETH/USDT', side: 'buy', amount: 1, price: 3000 }],
      };

      const mockSpreadDetector = {
        getExchangeLatency: vi.fn().mockReturnValue({ avgLatency: 50, p95Latency: 80 }),
      };

      const res = await evaluateVenueLatency(
        basket,
        undefined,
        checks,
        {
          config: { ...DEFAULT_ARBITRAGE_RISK_CONFIG, maxVenueLatencyMs: 200 },
          spreadDetector: mockSpreadDetector as any,
        },
      );

      expect(res).toBeNull();
      expect(checks.venueLatencyOk).toBe(true);
    });

    it('rejects trade when circuitBreaker checkLatency returns false', async () => {
      const checks: ArbitrageRiskGateChecks = {
        credentialsOk: true,
        balancesOk: true,
        venueCapsOk: true,
        symbolCapsOk: true,
        notionalCapOk: true,
        kellyCapOk: true,
        drawdownBreakerOk: true,
        venueLatencyOk: true,
        profitHurdleOk: true,
      };

      const basket: MultiLegArbitrageBasket = {
        legs: [{ legId: '1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 1, price: 50000 }],
      };

      const mockCircuitBreaker = {
        checkLatency: vi.fn().mockResolvedValue(false),
      };

      const res = await evaluateVenueLatency(
        basket,
        { venueLatencies: { binance: 100 } },
        checks,
        {
          config: { ...DEFAULT_ARBITRAGE_RISK_CONFIG, maxVenueLatencyMs: 200 },
          circuitBreaker: mockCircuitBreaker as any,
        },
      );

      expect(res).not.toBeNull();
      expect(res?.allowed).toBe(false);
      expect(res?.details?.circuitBreakerTripped).toBe(true);
    });

    it('returns false for live credentials when LIVE_TRADING_ENABLED is not set', () => {
      delete process.env.LIVE_TRADING_ENABLED;
      const basket: MultiLegArbitrageBasket = {
        legs: [{ legId: '1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 1, price: 50000 }],
      };
      expect(verifyLiveCredentials(basket)).toBe(false);
    });

    it('validates live credentials with context override or venue envs', () => {
      process.env.LIVE_TRADING_ENABLED = 'true';

      const basket: MultiLegArbitrageBasket = {
        legs: [{ legId: '1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 1, price: 50000 }],
      };

      // Context credentials boolean true
      expect(verifyLiveCredentials(basket, { credentials: { binance: true } } as any)).toBe(true);
      // Context credentials object
      expect(verifyLiveCredentials(basket, { credentials: { binance: { apiKey: 'key' } } } as any)).toBe(true);

      // Env vars for venues
      delete process.env.BINANCE_API_KEY;
      expect(verifyLiveCredentials(basket)).toBe(false);

      process.env.BINANCE_API_KEY = 'binance_key';
      process.env.BINANCE_API_SECRET = 'binance_secret';
      expect(verifyLiveCredentials(basket)).toBe(true);

      delete process.env.LIVE_TRADING_ENABLED;
      delete process.env.BINANCE_API_KEY;
      delete process.env.BINANCE_API_SECRET;
    });
  });

  describe('arbitrage-risk-guard-balance-helpers', () => {
    it('parses symbol assets correctly with various separators', () => {
      expect(parseSymbolAssets('BTC/USDT')).toEqual({ baseAsset: 'BTC', quoteAsset: 'USDT' });
      expect(parseSymbolAssets('ETH-USDC')).toEqual({ baseAsset: 'ETH', quoteAsset: 'USDC' });
      expect(parseSymbolAssets('SOL_USD')).toEqual({ baseAsset: 'SOL', quoteAsset: 'USD' });
      expect(parseSymbolAssets('XRP')).toEqual({ baseAsset: 'XRP', quoteAsset: 'USD' });
    });

    it('determines quote equivalence for USD stables', () => {
      expect(isQuoteEquivalent('USDT', 'USDC')).toBe(true);
      expect(isQuoteEquivalent('USD', 'DAI')).toBe(true);
      expect(isQuoteEquivalent('BTC', 'USDT')).toBe(false);
    });

    it('verifies buy leg balance and detects insufficient balance', () => {
      const leg = { legId: '1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy' as const, amount: 1, price: 50000 };
      const pass = verifyBuyLegBalance(leg, 'USDT', { asset: 'USDT', free: 60000, locked: 0, total: 60000 }, 50000);
      expect(pass.ok).toBe(true);

      const fail = verifyBuyLegBalance(leg, 'USDT', { asset: 'USDT', free: 40000, locked: 0, total: 40000 }, 50000);
      expect(fail.ok).toBe(false);
    });

    it('verifies sell leg balance for base and quote assets', () => {
      const leg = { legId: '1', venue: 'binance', symbol: 'BTC/USDT', side: 'sell' as const, amount: 2, price: 50000 };
      // Base asset match
      const passBase = verifySellLegBalance(leg, 'BTC', 'USDT', { asset: 'BTC', free: 3, locked: 0, total: 3 }, 100000);
      expect(passBase.ok).toBe(true);

      const failBase = verifySellLegBalance(leg, 'BTC', 'USDT', { asset: 'BTC', free: 1, locked: 0, total: 1 }, 100000);
      expect(failBase.ok).toBe(false);
    });
  });

  describe('arbitrage-risk-guard-exposure (ExposureTracker)', () => {
    it('checks exposure gates for venue and symbol caps', () => {
      const tracker = new ExposureTracker();
      const checks: ArbitrageRiskGateChecks = {
        credentialsOk: true,
        balancesOk: true,
        venueCapsOk: true,
        symbolCapsOk: true,
        notionalCapOk: true,
        kellyCapOk: true,
        drawdownBreakerOk: true,
        venueLatencyOk: true,
        profitHurdleOk: true,
      };

      const basket: MultiLegArbitrageBasket = {
        legs: [
          { legId: '1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 1, price: 60000 },
          { legId: '2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', amount: 1, price: 60000 },
        ],
      };

      // Venue cap breach
      const resVenue = tracker.checkExposureGates(
        basket,
        { ...DEFAULT_ARBITRAGE_RISK_CONFIG, maxOpenPositionPerVenueUsd: 50000 },
        checks,
      );
      expect(resVenue).not.toBeNull();
      expect(resVenue?.allowed).toBe(false);
      expect(checks.venueCapOk).toBe(false);

      // Symbol cap breach
      checks.venueCapOk = true;
      const resSymbol = tracker.checkExposureGates(
        basket,
        { ...DEFAULT_ARBITRAGE_RISK_CONFIG, maxOpenPositionPerVenueUsd: 100000, maxOpenPositionPerSymbolUsd: 50000 },
        checks,
      );
      expect(resSymbol).not.toBeNull();
      expect(resSymbol?.allowed).toBe(false);
      expect(checks.symbolCapOk).toBe(false);

      // Pass all caps
      checks.symbolCapOk = true;
      const resPass = tracker.checkExposureGates(
        basket,
        { ...DEFAULT_ARBITRAGE_RISK_CONFIG, maxOpenPositionPerVenueUsd: 100000, maxOpenPositionPerSymbolUsd: 100000 },
        checks,
      );
      expect(resPass).toBeNull();
    });

    it('records trade opened and closed with basket and string overloads', () => {
      const tracker = new ExposureTracker();

      const basket: MultiLegArbitrageBasket = {
        legs: [
          { legId: '1', venue: 'binance', symbol: 'BTC/USDT', side: 'buy', amount: 1, price: 50000 },
          { legId: '2', venue: 'bybit', symbol: 'BTC/USDT', side: 'sell', amount: 1, price: 50000, notionalUsd: 50000 },
          { legId: '3', venue: 'okx', symbol: 'INVALID', side: 'buy', amount: 0, price: 0 }, // 0 notional skipped
        ],
      };

      tracker.recordTradeOpened(basket);
      expect(tracker.venueExposures.get('binance')).toBe(50000);
      expect(tracker.symbolExposures.get('BTC/USDT')).toBe(50000);

      // Positional trade opened
      tracker.recordTradeOpened('ETH/USDT', 'binance', 'bybit', 20000);
      tracker.recordTradeOpened('ETH/USDT', 'binance', 'bybit', -100); // Invalid ignored
      expect(tracker.venueExposures.get('binance')).toBe(70000);
      expect(tracker.symbolExposures.get('ETH/USDT')).toBe(20000);

      const exposures = tracker.getExposures();
      expect(exposures.venues.binance).toBe(70000);
      expect(exposures.symbols['BTC/USDT']).toBe(50000);

      // Trade closed with basket
      tracker.recordTradeClosed(basket);
      expect(tracker.venueExposures.get('binance')).toBe(20000);
      expect(tracker.symbolExposures.get('BTC/USDT')).toBe(0);

      // Trade closed with positional args
      tracker.recordTradeClosed('ETH/USDT', 'binance', 'bybit', 20000);
      tracker.recordTradeClosed('ETH/USDT', 'binance', 'bybit', -10); // Invalid ignored
      expect(tracker.venueExposures.get('binance')).toBe(0);

      // Reset
      tracker.resetExposures();
      expect(tracker.venueExposures.size).toBe(0);
      expect(tracker.symbolExposures.size).toBe(0);
    });
  });
});
