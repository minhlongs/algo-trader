/**
 * Pre-trade risk guard for multi-exchange arbitrage execution.
 *
 * Enforces Quarter-Kelly position sizing (5% hard cap), notional and venue/symbol
 * open position caps, 15% daily drawdown circuit breakers, venue latency breakers,
 * and fail-closed paper vs live mode credential and balance validation.
 *
 * @module desk/arbitrage/arbitrage-risk-guard
 */

import { logger } from '../../shared/utils/logger';
import {
  type ArbitrageRiskConfig,
  type MultiLegArbitrageBasket,
  type ArbitrageBasketLeg,
  type ArbitrageRiskCheckResult,
  type ArbitrageRiskGateChecks,
  type ArbitrageRiskContext,
  type ArbitrageRiskCheckParams,
  type VenueBalanceSnapshot,
  ArbitrageRejectionReason,
  DEFAULT_ARBITRAGE_RISK_CONFIG,
} from './arbitrage-risk-types';
import { KellyPositionSizer } from '../risk/kelly-position-sizer';
import { RiskGateManager } from '../risk/risk-gate-manager';
import { LiveExecutionGuard } from '../execution/live-execution-guard-core';
import type { TieredDrawdownBreaker } from '../risk/tiered-drawdown-breaker';
import type { DrawdownMonitor } from '../risk/drawdown-monitor';
import type { CircuitBreaker } from '../risk/circuit-breaker';
import type { SpreadDetector } from './spread-detector';
import type { PolymarketOrder } from '../execution/polymarket-signer';

export * from './arbitrage-risk-types';

export interface ArbitrageRiskGuardDependencies {
  riskGateManager?: RiskGateManager;
  liveExecutionGuard?: LiveExecutionGuard;
  kellyPositionSizer?: KellyPositionSizer;
  tieredDrawdownBreaker?: TieredDrawdownBreaker;
  drawdownMonitor?: DrawdownMonitor;
  circuitBreaker?: CircuitBreaker;
  spreadDetector?: SpreadDetector;
}

export class ArbitrageRiskGuard {
  private config: ArbitrageRiskConfig;
  private readonly liveExecutionGuard: LiveExecutionGuard;
  private readonly riskGateManager: RiskGateManager;
  private readonly kellyPositionSizer: KellyPositionSizer;
  private readonly tieredDrawdownBreaker?: TieredDrawdownBreaker;
  private readonly drawdownMonitor?: DrawdownMonitor;
  private readonly circuitBreaker?: CircuitBreaker;
  private readonly spreadDetector?: SpreadDetector;

  private readonly venueExposures = new Map<string, number>();
  private readonly symbolExposures = new Map<string, number>();

  constructor(
    config?: Partial<ArbitrageRiskConfig>,
    deps?: ArbitrageRiskGuardDependencies,
  ) {
    this.config = { ...DEFAULT_ARBITRAGE_RISK_CONFIG, ...config };

    this.circuitBreaker = deps?.circuitBreaker;
    this.tieredDrawdownBreaker = deps?.tieredDrawdownBreaker;
    this.drawdownMonitor = deps?.drawdownMonitor;
    this.spreadDetector = deps?.spreadDetector;

    this.liveExecutionGuard =
      deps?.liveExecutionGuard ??
      new LiveExecutionGuard({
        capitalUsdc: this.config.capitalUsdc,
        maxDailyDrawdown: this.config.maxDailyDrawdownFraction,
        maxPositionFraction: this.config.maxKellyPositionFraction,
        enabled: true,
      });

    this.riskGateManager =
      deps?.riskGateManager ??
      new RiskGateManager(this.liveExecutionGuard, this.circuitBreaker);

    this.kellyPositionSizer =
      deps?.kellyPositionSizer ??
      new KellyPositionSizer({
        kellyFraction: this.config.kellyFraction,
        maxPositionFraction: this.config.maxKellyPositionFraction,
        minPositionUsd: 10,
      });
  }

  /**
   * Evaluate all pre-trade risk gates for a multi-leg arbitrage basket.
   */
  async checkBasket(
    basket: MultiLegArbitrageBasket,
    context?: ArbitrageRiskContext,
  ): Promise<ArbitrageRiskCheckResult> {
    const checks: ArbitrageRiskGateChecks = {
      drawdownBreakerOk: true,
      venueLatencyOk: true,
      kellyCapOk: true,
      notionalCapOk: true,
      venueCapOk: true,
      symbolCapOk: true,
      venueBalanceOk: true,
      credentialsOk: true,
    };

    const totalNotionalUsd = this.calculateBasketNotional(basket);

    // ──────────────────────────────────────────────────────────────────────────
    // Gate 1: Cumulative Daily Drawdown Circuit Breakers (15% limit)
    // ──────────────────────────────────────────────────────────────────────────

    // 1a. Explicit drawdown passed in context
    if (
      context?.currentDrawdown !== undefined &&
      context.currentDrawdown >= this.config.maxDailyDrawdownFraction
    ) {
      checks.drawdownBreakerOk = false;
      logger.warn('[ArbitrageRiskGuard] Cumulative daily drawdown breached limit', {
        currentDrawdown: context.currentDrawdown,
        maxDailyDrawdown: this.config.maxDailyDrawdownFraction,
      });
      return {
        allowed: false,
        rejectionReason: ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED,
        adjustedNotionalUsd: 0,
        checks,
        details: {
          currentDrawdown: context.currentDrawdown,
          maxDailyDrawdownFraction: this.config.maxDailyDrawdownFraction,
        },
      };
    }

    // 1b. TieredDrawdownBreaker check (haltThreshold = 0.15)
    if (this.tieredDrawdownBreaker) {
      const state = this.tieredDrawdownBreaker.getState();
      const ddFrac = state.drawdownPercent / 100;
      if (
        ddFrac >= this.config.maxDailyDrawdownFraction ||
        !this.tieredDrawdownBreaker.canOpenNewTrades() ||
        state.tier === 'HALT' ||
        state.tier === 'HARD_STOP'
      ) {
        checks.drawdownBreakerOk = false;
        logger.warn('[ArbitrageRiskGuard] TieredDrawdownBreaker halted trading', {
          tier: state.tier,
          drawdownPercent: state.drawdownPercent,
        });
        return {
          allowed: false,
          rejectionReason: ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED,
          adjustedNotionalUsd: 0,
          checks,
          details: {
            tier: state.tier,
            drawdownPercent: state.drawdownPercent,
            haltedUntil: state.haltedUntil,
          },
        };
      }
    }

    // 1c. DrawdownMonitor check (Redis-backed)
    if (this.drawdownMonitor) {
      const canTrade = await this.drawdownMonitor.canTrade();
      if (!canTrade) {
        checks.drawdownBreakerOk = false;
        return {
          allowed: false,
          rejectionReason: ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED,
          adjustedNotionalUsd: 0,
          checks,
          details: { monitorHalted: true },
        };
      }
      const metrics = await this.drawdownMonitor.getMetrics();
      if (metrics.dailyDrawdown >= this.config.maxDailyDrawdownFraction) {
        checks.drawdownBreakerOk = false;
        return {
          allowed: false,
          rejectionReason: ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED,
          adjustedNotionalUsd: 0,
          checks,
          details: {
            dailyDrawdown: metrics.dailyDrawdown,
            maxDailyDrawdown: this.config.maxDailyDrawdownFraction,
          },
        };
      }
    }

    // 1d. LiveExecutionGuard & RiskGateManager status
    const guardStatus = this.liveExecutionGuard.getStatus();
    if (guardStatus.circuitTripped) {
      checks.drawdownBreakerOk = false;
      return {
        allowed: false,
        rejectionReason: ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED,
        adjustedNotionalUsd: 0,
        checks,
        details: {
          circuitTripped: true,
          consecutiveLosses: guardStatus.consecutiveLosses,
        },
      };
    }

    const guardDailyDrawdown =
      this.config.capitalUsdc > 0
        ? Math.abs(Math.min(0, guardStatus.dailyPnl)) / this.config.capitalUsdc
        : 0;
    if (guardDailyDrawdown >= this.config.maxDailyDrawdownFraction) {
      checks.drawdownBreakerOk = false;
      return {
        allowed: false,
        rejectionReason: ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED,
        adjustedNotionalUsd: 0,
        checks,
        details: {
          guardDailyDrawdown,
          limit: this.config.maxDailyDrawdownFraction,
        },
      };
    }

    const gateResult = await this.riskGateManager.check(
      basket.strategyKey ?? 'arbitrage',
    );
    if (!gateResult.allowed) {
      checks.drawdownBreakerOk = false;
      return {
        allowed: false,
        rejectionReason: ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED,
        adjustedNotionalUsd: 0,
        checks,
        details: { reason: gateResult.reason },
      };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Gate 2: Venue Latency Breakers (maxVenueLatencyMs, default 500ms)
    // ──────────────────────────────────────────────────────────────────────────
    const venueLatencies = context?.venueLatencies ?? {};
    for (const leg of basket.legs) {
      let lat = venueLatencies[leg.venue];

      if (lat === undefined && this.spreadDetector) {
        const detector = this.spreadDetector as unknown as {
          getExchangeLatency?: (v: string) => { avgLatency: number; p95Latency: number };
        };
        if (typeof detector.getExchangeLatency === 'function') {
          const spreadLat = detector.getExchangeLatency(leg.venue);
          lat = Math.max(spreadLat.p95Latency, spreadLat.avgLatency);
        }
      }

      if (lat !== undefined) {
        if (lat > this.config.maxVenueLatencyMs) {
          checks.venueLatencyOk = false;
          logger.warn('[ArbitrageRiskGuard] Venue latency spike exceeded threshold', {
            venue: leg.venue,
            latencyMs: lat,
            maxLatencyMs: this.config.maxVenueLatencyMs,
          });
          return {
            allowed: false,
            rejectionReason: ArbitrageRejectionReason.VENUE_LATENCY_SPIKE,
            adjustedNotionalUsd: 0,
            checks,
            details: {
              venue: leg.venue,
              latencyMs: lat,
              thresholdMs: this.config.maxVenueLatencyMs,
            },
          };
        }

        if (this.circuitBreaker) {
          const cbAllowed = await this.circuitBreaker.checkLatency(lat);
          if (!cbAllowed) {
            checks.venueLatencyOk = false;
            return {
              allowed: false,
              rejectionReason: ArbitrageRejectionReason.VENUE_LATENCY_SPIKE,
              adjustedNotionalUsd: 0,
              checks,
              details: {
                venue: leg.venue,
                latencyMs: lat,
                circuitBreakerTripped: true,
              },
            };
          }
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Gate 3: Operating Mode Safeguards & Live Mode Credential Verification
    // ──────────────────────────────────────────────────────────────────────────
    if (this.config.mode === 'live') {
      const credentialsOk = this.verifyLiveCredentials(basket, context);
      if (!credentialsOk) {
        checks.credentialsOk = false;
        logger.warn('[ArbitrageRiskGuard] Live execution credentials missing or invalid', {
          mode: this.config.mode,
        });
        return {
          allowed: false,
          rejectionReason: ArbitrageRejectionReason.MISSING_LIVE_CREDENTIALS,
          adjustedNotionalUsd: 0,
          checks,
          details: { mode: 'live' },
        };
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Gate 4: Pre-Trade Venue Balance Verification
    // ──────────────────────────────────────────────────────────────────────────
    const balanceCheck = this.verifyVenueBalances(basket, context);
    if (!balanceCheck.ok) {
      checks.venueBalanceOk = false;
      return {
        allowed: false,
        rejectionReason: ArbitrageRejectionReason.INSUFFICIENT_VENUE_BALANCE,
        adjustedNotionalUsd: 0,
        checks,
        details: balanceCheck.details,
      };
    }

    const autoAdjust =
      context?.autoAdjustSizing ?? this.config.autoAdjustSizing ?? false;

    // ──────────────────────────────────────────────────────────────────────────
    // Gate 5: Max Per-Trade Notional Limit
    // ──────────────────────────────────────────────────────────────────────────
    if (totalNotionalUsd > this.config.maxPerTradeNotionalUsd) {
      if (!autoAdjust) {
        checks.notionalCapOk = false;
        logger.warn('[ArbitrageRiskGuard] Trade notional exceeds maximum per-trade limit', {
          totalNotionalUsd,
          maxPerTradeNotionalUsd: this.config.maxPerTradeNotionalUsd,
        });
        return {
          allowed: false,
          rejectionReason: ArbitrageRejectionReason.EXCEEDS_NOTIONAL_CAP,
          adjustedNotionalUsd: this.config.maxPerTradeNotionalUsd,
          checks,
          details: {
            totalNotionalUsd,
            maxPerTradeNotionalUsd: this.config.maxPerTradeNotionalUsd,
          },
        };
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Gate 6: Quarter-Kelly 5% Cap Enforcement (KellyPositionSizer)
    // ──────────────────────────────────────────────────────────────────────────
    const portfolioValueUsd =
      context?.portfolioValueUsd ?? this.config.capitalUsdc;
    const winProbability =
      basket.winProbability ?? context?.winProbability ?? 0.95;
    const winLossRatio =
      basket.winLossRatio ?? context?.winLossRatio ?? 1.0;

    const kellyResult = this.kellyPositionSizer.calculatePositionSize({
      winProbability,
      winLossRatio,
      portfolioValue: portfolioValueUsd,
    });

    const maxKellyCapUsd =
      portfolioValueUsd * this.config.maxKellyPositionFraction;
    const effectiveKellyLimitUsd =
      kellyResult.positionSizeUsd > 0
        ? Math.min(kellyResult.positionSizeUsd, maxKellyCapUsd)
        : 0;

    const KELLY_EPSILON = 1e-6;
    if (totalNotionalUsd > effectiveKellyLimitUsd + KELLY_EPSILON) {
      if (!autoAdjust) {
        checks.kellyCapOk = false;
        logger.warn('[ArbitrageRiskGuard] Basket notional exceeds Quarter-Kelly 5% cap', {
          totalNotionalUsd,
          effectiveKellyLimitUsd,
          maxKellyCapUsd,
        });
        return {
          allowed: false,
          rejectionReason: ArbitrageRejectionReason.EXCEEDS_KELLY_CAP,
          adjustedNotionalUsd: Number(effectiveKellyLimitUsd.toFixed(2)),
          checks,
          details: {
            totalNotionalUsd,
            effectiveKellyLimitUsd,
            maxKellyCapUsd,
            fractionUsed: kellyResult.fractionUsed,
          },
        };
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Gate 7: Open Exposure Limits (Per Venue & Per Symbol)
    // ──────────────────────────────────────────────────────────────────────────

    // Check venue exposure per leg
    for (const leg of basket.legs) {
      const legNotional = leg.notionalUsd ?? leg.amount * leg.price;

      const currentVenueExp = this.venueExposures.get(leg.venue) ?? 0;
      if (
        currentVenueExp + legNotional >
        this.config.maxOpenPositionPerVenueUsd
      ) {
        checks.venueCapOk = false;
        logger.warn('[ArbitrageRiskGuard] Exceeds max open position per venue', {
          venue: leg.venue,
          currentVenueExp,
          legNotional,
          limit: this.config.maxOpenPositionPerVenueUsd,
        });
        return {
          allowed: false,
          rejectionReason: ArbitrageRejectionReason.EXCEEDS_VENUE_CAP,
          adjustedNotionalUsd: 0,
          checks,
          details: {
            limitType: 'venue',
            venue: leg.venue,
            currentExposure: currentVenueExp,
            addedNotional: legNotional,
            limit: this.config.maxOpenPositionPerVenueUsd,
          },
        };
      }
    }

    // Group legs by symbol to avoid intra-basket double counting
    const symbolLegMap = new Map<string, number>();
    for (const leg of basket.legs) {
      const legNotional = leg.notionalUsd ?? leg.amount * leg.price;
      const current = symbolLegMap.get(leg.symbol) ?? 0;
      symbolLegMap.set(leg.symbol, Math.max(current, legNotional));
    }

    // Check symbol exposure per symbol
    for (const [symbol, notional] of Array.from(symbolLegMap.entries())) {
      const currentSymbolExp = this.symbolExposures.get(symbol) ?? 0;
      if (
        currentSymbolExp + notional >
        this.config.maxOpenPositionPerSymbolUsd
      ) {
        checks.symbolCapOk = false;
        logger.warn('[ArbitrageRiskGuard] Exceeds max open position per symbol', {
          symbol,
          currentSymbolExp,
          notional,
          limit: this.config.maxOpenPositionPerSymbolUsd,
        });
        return {
          allowed: false,
          rejectionReason: ArbitrageRejectionReason.EXCEEDS_SYMBOL_CAP,
          adjustedNotionalUsd: 0,
          checks,
          details: {
            limitType: 'symbol',
            symbol,
            currentExposure: currentSymbolExp,
            addedNotional: notional,
            limit: this.config.maxOpenPositionPerSymbolUsd,
          },
        };
      }
    }

    // For Polymarket legs: also validate against LiveExecutionGuard position size
    for (const leg of basket.legs) {
      if (leg.venue.toLowerCase().includes('poly')) {
        const polyOrder: PolymarketOrder = {
          tokenId: leg.symbol,
          price: leg.price,
          size: leg.amount,
          side: leg.side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
          expiration: 0,
          nonce: '',
          feeRateBps: 0,
          signatureType: 0,
        };
        const legGuard = this.liveExecutionGuard.guardOrder(polyOrder);
        if (!legGuard.approved) {
          checks.notionalCapOk = false;
          return {
            allowed: false,
            rejectionReason: ArbitrageRejectionReason.EXCEEDS_NOTIONAL_CAP,
            adjustedNotionalUsd: 0,
            checks,
            details: { reason: legGuard.reason },
          };
        }
      }
    }

    // All gates passed
    const finalAdjustedNotional = Math.min(
      totalNotionalUsd,
      effectiveKellyLimitUsd > 0
        ? (effectiveKellyLimitUsd + KELLY_EPSILON >= totalNotionalUsd
            ? totalNotionalUsd
            : effectiveKellyLimitUsd)
        : totalNotionalUsd,
      this.config.maxPerTradeNotionalUsd,
    );

    return {
      allowed: true,
      adjustedNotionalUsd: Number(finalAdjustedNotional.toFixed(2)),
      checks,
    };
  }

  /**
   * Pre-trade check supporting both MultiLegArbitrageBasket and legacy ArbitrageRiskCheckParams.
   */
  async checkPreTrade(
    basketOrParams: MultiLegArbitrageBasket | ArbitrageRiskCheckParams,
    context?: ArbitrageRiskContext,
  ): Promise<ArbitrageRiskCheckResult> {
    if ('legs' in basketOrParams) {
      return this.checkBasket(basketOrParams, context);
    }

    // Convert legacy ArbitrageRiskCheckParams into MultiLegArbitrageBasket
    const params = basketOrParams;
    const basket: MultiLegArbitrageBasket = {
      basketId: `basket-${Date.now()}`,
      legs: [
        {
          legId: 'leg-buy',
          venue: params.buyVenue,
          symbol: params.symbol,
          side: 'buy',
          amount: params.tradeNotionalUsd,
          price: 1.0,
          notionalUsd: params.tradeNotionalUsd,
        },
        {
          legId: 'leg-sell',
          venue: params.sellVenue,
          symbol: params.symbol,
          side: 'sell',
          amount: params.tradeNotionalUsd,
          price: 1.0,
          notionalUsd: params.tradeNotionalUsd,
        },
      ],
      totalNotionalUsd: params.tradeNotionalUsd,
      winProbability: params.winProbability,
      winLossRatio: params.winLossRatio,
    };

    const mergedContext: ArbitrageRiskContext = {
      ...context,
      venueLatencies: { ...params.venueLatencies, ...context?.venueLatencies },
      venueBalances: { ...params.venueBalances, ...context?.venueBalances },
      currentDrawdown: params.currentDrawdown ?? context?.currentDrawdown,
      portfolioValueUsd: params.bankrollUsd ?? context?.portfolioValueUsd,
      winProbability: params.winProbability ?? context?.winProbability,
      winLossRatio: params.winLossRatio ?? context?.winLossRatio,
    };

    return this.checkBasket(basket, mergedContext);
  }

  /**
   * Record trade opening: updates venue and symbol open exposure.
   */
  recordTradeOpened(basket: MultiLegArbitrageBasket): void;
  recordTradeOpened(
    symbol: string,
    buyVenue: string,
    sellVenue: string,
    notional: number,
  ): void;
  recordTradeOpened(
    basketOrSymbol: MultiLegArbitrageBasket | string,
    buyVenue?: string,
    sellVenue?: string,
    notional?: number,
  ): void {
    if (typeof basketOrSymbol === 'object' && 'legs' in basketOrSymbol) {
      const symbolNotionals = new Map<string, number>();

      for (const leg of basketOrSymbol.legs) {
        const legNotional = leg.notionalUsd ?? leg.amount * leg.price;
        if (!Number.isFinite(legNotional) || legNotional <= 0) {
          continue;
        }
        this.venueExposures.set(
          leg.venue,
          (this.venueExposures.get(leg.venue) ?? 0) + legNotional,
        );
        const curr = symbolNotionals.get(leg.symbol) ?? 0;
        symbolNotionals.set(leg.symbol, Math.max(curr, legNotional));
      }

      for (const [symbol, notionalVal] of Array.from(symbolNotionals.entries())) {
        this.symbolExposures.set(
          symbol,
          (this.symbolExposures.get(symbol) ?? 0) + notionalVal,
        );
      }
    } else if (
      typeof basketOrSymbol === 'string' &&
      buyVenue &&
      sellVenue &&
      typeof notional === 'number'
    ) {
      if (!Number.isFinite(notional) || notional <= 0) {
        return;
      }
      this.symbolExposures.set(
        basketOrSymbol,
        (this.symbolExposures.get(basketOrSymbol) ?? 0) + notional,
      );
      this.venueExposures.set(
        buyVenue,
        (this.venueExposures.get(buyVenue) ?? 0) + notional,
      );
      this.venueExposures.set(
        sellVenue,
        (this.venueExposures.get(sellVenue) ?? 0) + notional,
      );
    }
  }

  /**
   * Record trade closing: decrements venue and symbol open exposure.
   */
  recordTradeClosed(basket: MultiLegArbitrageBasket): void;
  recordTradeClosed(
    symbol: string,
    buyVenue: string,
    sellVenue: string,
    notional: number,
  ): void;
  recordTradeClosed(
    basketOrSymbol: MultiLegArbitrageBasket | string,
    buyVenue?: string,
    sellVenue?: string,
    notional?: number,
  ): void {
    if (typeof basketOrSymbol === 'object' && 'legs' in basketOrSymbol) {
      const symbolNotionals = new Map<string, number>();

      for (const leg of basketOrSymbol.legs) {
        const legNotional = leg.notionalUsd ?? leg.amount * leg.price;
        if (!Number.isFinite(legNotional) || legNotional <= 0) {
          continue;
        }
        const venueExp = Math.max(
          0,
          (this.venueExposures.get(leg.venue) ?? 0) - legNotional,
        );
        this.venueExposures.set(leg.venue, venueExp);
        const curr = symbolNotionals.get(leg.symbol) ?? 0;
        symbolNotionals.set(leg.symbol, Math.max(curr, legNotional));
      }

      for (const [symbol, notionalVal] of Array.from(symbolNotionals.entries())) {
        const symbolExp = Math.max(
          0,
          (this.symbolExposures.get(symbol) ?? 0) - notionalVal,
        );
        this.symbolExposures.set(symbol, symbolExp);
      }
    } else if (
      typeof basketOrSymbol === 'string' &&
      buyVenue &&
      sellVenue &&
      typeof notional === 'number'
    ) {
      if (!Number.isFinite(notional) || notional <= 0) {
        return;
      }
      const symExp = Math.max(
        0,
        (this.symbolExposures.get(basketOrSymbol) ?? 0) - notional,
      );
      const buyExp = Math.max(
        0,
        (this.venueExposures.get(buyVenue) ?? 0) - notional,
      );
      const sellExp = Math.max(
        0,
        (this.venueExposures.get(sellVenue) ?? 0) - notional,
      );
      this.symbolExposures.set(basketOrSymbol, symExp);
      this.venueExposures.set(buyVenue, buyExp);
      this.venueExposures.set(sellVenue, sellExp);
    }
  }

  getExposures(): {
    venues: Record<string, number>;
    symbols: Record<string, number>;
  } {
    return {
      venues: Object.fromEntries(this.venueExposures.entries()),
      symbols: Object.fromEntries(this.symbolExposures.entries()),
    };
  }

  resetExposures(): void {
    this.venueExposures.clear();
    this.symbolExposures.clear();
  }

  getConfig(): Readonly<ArbitrageRiskConfig> {
    return this.config;
  }

  updateConfig(patch: Partial<ArbitrageRiskConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  getLiveExecutionGuard(): LiveExecutionGuard {
    return this.liveExecutionGuard;
  }

  getRiskGateManager(): RiskGateManager {
    return this.riskGateManager;
  }

  getKellyPositionSizer(): KellyPositionSizer {
    return this.kellyPositionSizer;
  }

  getTieredDrawdownBreaker(): TieredDrawdownBreaker | undefined {
    return this.tieredDrawdownBreaker;
  }

  getDrawdownMonitor(): DrawdownMonitor | undefined {
    return this.drawdownMonitor;
  }

  getCircuitBreaker(): CircuitBreaker | undefined {
    return this.circuitBreaker;
  }

  getSpreadDetector(): SpreadDetector | undefined {
    return this.spreadDetector;
  }

  // ── Private Validation Helpers ─────────────────────────────────────────────

  private calculateBasketNotional(basket: MultiLegArbitrageBasket): number {
    if (basket.totalNotionalUsd && basket.totalNotionalUsd > 0) {
      return basket.totalNotionalUsd;
    }
    return basket.legs.reduce((sum: number, leg: ArbitrageBasketLeg) => {
      const notional = leg.notionalUsd ?? leg.amount * leg.price;
      return sum + notional;
    }, 0);
  }

  private verifyLiveCredentials(
    basket: MultiLegArbitrageBasket,
    context?: ArbitrageRiskContext,
  ): boolean {
    if (process.env.LIVE_TRADING_ENABLED !== 'true') {
      return false;
    }

    for (const leg of basket.legs) {
      const venue = leg.venue.toLowerCase();

      // Check if credentials explicitly supplied in context
      if (context?.credentials?.[leg.venue] === true) {
        continue;
      }
      if (
        typeof context?.credentials?.[leg.venue] === 'object' &&
        context.credentials[leg.venue] !== null
      ) {
        continue;
      }

      if (venue.includes('poly')) {
        const hasPoly =
          Boolean(process.env.POLYMARKET_API_KEY) &&
          Boolean(process.env.POLYMARKET_PRIVATE_KEY);
        if (!hasPoly) return false;
      } else if (venue.includes('binance')) {
        const hasBinance =
          Boolean(process.env.BINANCE_API_KEY) &&
          Boolean(process.env.BINANCE_API_SECRET);
        if (!hasBinance) return false;
      } else if (venue.includes('bybit')) {
        const hasBybit =
          Boolean(process.env.BYBIT_API_KEY) &&
          Boolean(process.env.BYBIT_API_SECRET);
        if (!hasBybit) return false;
      } else if (venue.includes('kucoin')) {
        const hasKucoin =
          Boolean(process.env.KUCOIN_API_KEY) &&
          Boolean(process.env.KUCOIN_API_SECRET) &&
          Boolean(process.env.KUCOIN_PASSPHRASE || process.env.KUCOIN_PASSWORD);
        if (!hasKucoin) return false;
      } else {
        // Generic CEX venue: fail closed if live mode requested without credentials
        const envKey = `${venue.toUpperCase()}_API_KEY`;
        const envSecret = `${venue.toUpperCase()}_API_SECRET`;
        if (!process.env[envKey] || !process.env[envSecret]) {
          return false;
        }
      }
    }

    return true;
  }

  private parseSymbolAssets(symbol: string): { baseAsset: string; quoteAsset: string } {
    const upper = symbol.toUpperCase();
    const sep = ['/', '-', '_'].find((s) => upper.includes(s));
    if (sep) {
      const [base, quote] = upper.split(sep);
      return { baseAsset: base, quoteAsset: quote };
    }
    return { baseAsset: upper, quoteAsset: 'USD' };
  }

  private isQuoteEquivalent(asset: string, quoteAsset: string): boolean {
    const a = asset.toUpperCase();
    const q = quoteAsset.toUpperCase();
    if (a === q) return true;
    const USD_EQUIVALENTS = new Set(['USD', 'USDC', 'USDT', 'DAI', 'BUSD', 'FDUSD']);
    if (USD_EQUIVALENTS.has(a) && USD_EQUIVALENTS.has(q)) return true;
    return false;
  }

  private verifyVenueBalances(
    basket: MultiLegArbitrageBasket,
    context?: ArbitrageRiskContext,
  ): { ok: boolean; details?: Record<string, unknown> } {
    const balances = context?.venueBalances;

    // In live mode: balances are mandatory (fail closed)
    if (this.config.mode === 'live') {
      if (!balances) {
        logger.warn('[ArbitrageRiskGuard] Live mode requires venue balance snapshot', {
          mode: 'live',
        });
        return {
          ok: false,
          details: { error: 'Missing venue balance data in live mode' },
        };
      }
    } else {
      // In paper mode: if no balances provided, assume sufficient for simulation
      if (!balances) {
        return { ok: true };
      }
    }

    // Verify balances per leg
    for (const leg of basket.legs) {
      const { baseAsset, quoteAsset } = this.parseSymbolAssets(leg.symbol);
      const isBuy = leg.side.toLowerCase() === 'buy';

      // Look up balance record by venue:asset or venue
      const balanceRecord =
        balances[`${leg.venue}:${isBuy ? quoteAsset : baseAsset}`] ??
        balances[`${leg.venue}/${isBuy ? quoteAsset : baseAsset}`] ??
        balances[`${leg.venue}:${isBuy ? baseAsset : quoteAsset}`] ??
        balances[leg.venue];

      if (balanceRecord === undefined) {
        if (this.config.mode === 'live') {
          return {
            ok: false,
            details: {
              venue: leg.venue,
              error: `No balance found for venue ${leg.venue} in live mode`,
            },
          };
        }
        continue;
      }

      const requiredNotional = leg.notionalUsd ?? leg.amount * leg.price;

      if (typeof balanceRecord === 'number') {
        const available = balanceRecord;
        if (available < requiredNotional) {
          logger.warn('[ArbitrageRiskGuard] Insufficient balance on venue', {
            venue: leg.venue,
            available,
            requiredNotional,
          });
          return {
            ok: false,
            details: {
              venue: leg.venue,
              available,
              requiredNotional,
            },
          };
        }
      } else {
        const snapshot = balanceRecord as VenueBalanceSnapshot;
        const snapshotAssetUpper = snapshot.asset.toUpperCase();
        const baseUpper = baseAsset.toUpperCase();

        if (isBuy) {
          // BUY leg requires quote asset
          if (!this.isQuoteEquivalent(snapshot.asset, quoteAsset)) {
            logger.warn('[ArbitrageRiskGuard] Asset mismatch on venue for buy leg', {
              venue: leg.venue,
              asset: snapshot.asset,
              expectedAsset: quoteAsset,
            });
            return {
              ok: false,
              details: {
                venue: leg.venue,
                available: snapshot.free,
                requiredNotional,
                asset: snapshot.asset,
                expectedAsset: quoteAsset,
                error: `Asset mismatch: buy leg requires quote asset ${quoteAsset}, but venue provided ${snapshot.asset}`,
              },
            };
          }

          const available = snapshot.free;
          if (available < requiredNotional) {
            logger.warn('[ArbitrageRiskGuard] Insufficient balance on venue', {
              venue: leg.venue,
              available,
              requiredNotional,
            });
            return {
              ok: false,
              details: {
                venue: leg.venue,
                available,
                requiredNotional,
              },
            };
          }
        } else {
          // SELL leg requires base asset (or quote asset equivalent if denominated in USD)
          if (snapshotAssetUpper === baseUpper) {
            // Balance denominated in base asset units (e.g. BTC)
            const available = snapshot.free;
            const requiredAmount = leg.amount;
            if (available < requiredAmount) {
              logger.warn('[ArbitrageRiskGuard] Insufficient base asset balance on venue', {
                venue: leg.venue,
                available,
                requiredAmount,
                requiredNotional,
              });
              return {
                ok: false,
                details: {
                  venue: leg.venue,
                  available,
                  requiredAmount,
                  requiredNotional,
                  asset: snapshot.asset,
                  expectedAsset: baseAsset,
                },
              };
            }
          } else if (this.isQuoteEquivalent(snapshot.asset, quoteAsset)) {
            // Balance denominated in quote asset units (e.g. USDT)
            const available = snapshot.free;
            if (available < requiredNotional) {
              logger.warn('[ArbitrageRiskGuard] Insufficient balance on venue', {
                venue: leg.venue,
                available,
                requiredNotional,
              });
              return {
                ok: false,
                details: {
                  venue: leg.venue,
                  available,
                  requiredNotional,
                },
              };
            }
          } else {
            // Asset matches neither base asset nor quote asset
            logger.warn('[ArbitrageRiskGuard] Asset mismatch on venue for sell leg', {
              venue: leg.venue,
              asset: snapshot.asset,
              expectedAsset: baseAsset,
            });
            return {
              ok: false,
              details: {
                venue: leg.venue,
                available: snapshot.free,
                requiredNotional,
                asset: snapshot.asset,
                expectedAsset: baseAsset,
                error: `Asset mismatch: sell leg requires base asset ${baseAsset} or quote asset ${quoteAsset}, but venue provided ${snapshot.asset}`,
              },
            };
          }
        }
      }
    }

    return { ok: true };
  }
}
