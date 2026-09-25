/**
 * Pre-trade risk guard for multi-exchange arbitrage execution.
 *
 * Enforces Quarter-Kelly position sizing (5% hard cap), notional and venue/symbol
 * exposure ceilings, 15% daily drawdown circuit breaker, venue latency thresholds,
 * and live-trading credential validation.
 *
 * @module desk/arbitrage/risk/arbitrage-risk-guard
 */

import { logger } from '../../../shared/utils/logger';
import {
  type ArbitrageRiskConfig,
  type ArbitrageRiskCheckParams,
  type ArbitrageRiskCheckResult,
  DEFAULT_ARBITRAGE_RISK_CONFIG,
} from './arbitrage-risk-types';

export class ArbitrageRiskGuard {
  private readonly config: ArbitrageRiskConfig;
  private readonly symbolExposures = new Map<string, number>();
  private readonly venueExposures = new Map<string, number>();

  constructor(config?: Partial<ArbitrageRiskConfig>) {
    this.config = { ...DEFAULT_ARBITRAGE_RISK_CONFIG, ...config };
  }

  /**
   * Evaluate all pre-trade risk gates before submitting an arbitrage order.
   */
  async checkPreTrade(params: ArbitrageRiskCheckParams): Promise<ArbitrageRiskCheckResult> {
    const {
      symbol,
      buyVenue,
      sellVenue,
      tradeNotionalUsd,
      bankrollUsd,
      netProfitBps,
      currentDrawdown = 0,
      venueLatencies = {},
      venueBalances = {},
      winProbability = 0.95,
      winLossRatio = 1.0,
    } = params;

    // Gate 1: Cumulative Daily Drawdown Circuit Breaker (15% limit)
    if (currentDrawdown >= this.config.maxDailyDrawdown) {
      logger.warn('[ArbitrageRiskGuard] Drawdown limit breached', {
        currentDrawdown,
        maxDailyDrawdown: this.config.maxDailyDrawdown,
      });
      return { allowed: false, adjustedNotionalUsd: 0, rejectionReason: 'DAILY_DRAWDOWN_EXCEEDED' };
    }

    // Gate 2: Net Profitability Hurdle (min 10 bps)
    if (netProfitBps < this.config.minHurdleBps) {
      return {
        allowed: false,
        adjustedNotionalUsd: 0,
        rejectionReason: 'BELOW_PROFIT_HURDLE',
        details: { netProfitBps, hurdleBps: this.config.minHurdleBps },
      };
    }

    // Gate 3: Venue Latency Breakers
    const buyLatency = venueLatencies[buyVenue] ?? 0;
    const sellLatency = venueLatencies[sellVenue] ?? 0;
    if (buyLatency > this.config.maxVenueLatencyMs || sellLatency > this.config.maxVenueLatencyMs) {
      logger.warn('[ArbitrageRiskGuard] Venue latency threshold exceeded', {
        buyVenue,
        buyLatency,
        sellVenue,
        sellLatency,
        maxLatencyMs: this.config.maxVenueLatencyMs,
      });
      return {
        allowed: false,
        adjustedNotionalUsd: 0,
        rejectionReason: 'VENUE_LATENCY_BREACH',
        details: { buyLatency, sellLatency },
      };
    }

    // Gate 4: Quarter-Kelly Sizing Calculation
    const adjustedNotional = this.computeQuarterKellySizing(
      tradeNotionalUsd,
      bankrollUsd,
      winProbability,
      winLossRatio,
    );

    if (adjustedNotional <= 0) {
      return { allowed: false, adjustedNotionalUsd: 0, rejectionReason: 'MAX_TRADE_NOTIONAL_EXCEEDED' };
    }

    // Gate 5: Venue Balance Checks
    const buyBalance = venueBalances[buyVenue];
    const sellBalance = venueBalances[sellVenue];
    if (
      (buyBalance !== undefined && buyBalance < adjustedNotional) ||
      (sellBalance !== undefined && sellBalance < adjustedNotional)
    ) {
      return {
        allowed: false,
        adjustedNotionalUsd: 0,
        rejectionReason: 'INSUFFICIENT_VENUE_BALANCE',
        details: { buyBalance, sellBalance, required: adjustedNotional },
      };
    }

    // Gate 6: Open Exposure Limits (Symbol & Venue)
    const currentSymbolExp = this.symbolExposures.get(symbol) ?? 0;
    if (currentSymbolExp + adjustedNotional > this.config.maxSymbolExposureUsd) {
      return {
        allowed: false,
        adjustedNotionalUsd: 0,
        rejectionReason: 'MAX_SYMBOL_EXPOSURE_EXCEEDED',
        details: { currentSymbolExp, maxSymbolExposure: this.config.maxSymbolExposureUsd },
      };
    }

    const currentBuyExp = this.venueExposures.get(buyVenue) ?? 0;
    const currentSellExp = this.venueExposures.get(sellVenue) ?? 0;
    if (
      currentBuyExp + adjustedNotional > this.config.maxVenueExposureUsd ||
      currentSellExp + adjustedNotional > this.config.maxVenueExposureUsd
    ) {
      return {
        allowed: false,
        adjustedNotionalUsd: 0,
        rejectionReason: 'MAX_VENUE_EXPOSURE_EXCEEDED',
        details: { currentBuyExp, currentSellExp, maxVenueExposure: this.config.maxVenueExposureUsd },
      };
    }

    // Gate 7: Live Mode Credentials Check
    if (this.config.mode === 'live') {
      const liveAllowed = this.validateLiveCredentials();
      if (!liveAllowed) {
        return { allowed: false, adjustedNotionalUsd: 0, rejectionReason: 'LIVE_CREDENTIALS_INVALID' };
      }
    }

    return { allowed: true, adjustedNotionalUsd: adjustedNotional };
  }

  /**
   * Compute position size via Quarter-Kelly with hard caps.
   */
  computeQuarterKellySizing(
    requestedNotional: number,
    bankroll: number,
    p: number,
    b: number,
  ): number {
    if (bankroll <= 0 || requestedNotional <= 0 || p <= 0 || b <= 0) return 0;
    const q = 1 - p;
    const fullKelly = (b * p - q) / b;
    if (fullKelly <= 0) return 0;

    // Quarter-Kelly fraction clamped to maxKellyFraction (0.05 default)
    const quarterKellyFraction = Math.min(fullKelly * 0.25, this.config.maxKellyFraction);
    const kellyNotional = bankroll * quarterKellyFraction;

    return Math.min(requestedNotional, kellyNotional, this.config.maxTradeNotionalUsd);
  }

  recordTradeOpened(symbol: string, buyVenue: string, sellVenue: string, notional: number): void {
    this.symbolExposures.set(symbol, (this.symbolExposures.get(symbol) ?? 0) + notional);
    this.venueExposures.set(buyVenue, (this.venueExposures.get(buyVenue) ?? 0) + notional);
    this.venueExposures.set(sellVenue, (this.venueExposures.get(sellVenue) ?? 0) + notional);
  }

  recordTradeClosed(symbol: string, buyVenue: string, sellVenue: string, notional: number): void {
    this.symbolExposures.set(symbol, Math.max(0, (this.symbolExposures.get(symbol) ?? 0) - notional));
    this.venueExposures.set(buyVenue, Math.max(0, (this.venueExposures.get(buyVenue) ?? 0) - notional));
    this.venueExposures.set(sellVenue, Math.max(0, (this.venueExposures.get(sellVenue) ?? 0) - notional));
  }

  getExposures(): { symbols: Record<string, number>; venues: Record<string, number> } {
    return {
      symbols: Object.fromEntries(this.symbolExposures.entries()),
      venues: Object.fromEntries(this.venueExposures.entries()),
    };
  }

  resetExposures(): void {
    this.symbolExposures.clear();
    this.venueExposures.clear();
  }

  private validateLiveCredentials(): boolean {
    const isLiveEnabled = process.env.LIVE_TRADING_ENABLED === 'true';
    const hasPolyKey = !!process.env.POLYMARKET_API_KEY || !!process.env.POLYMARKET_PRIVATE_KEY;
    return isLiveEnabled && hasPolyKey;
  }
}
