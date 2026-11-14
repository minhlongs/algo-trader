/**
 * Event-level NegRisk bundle arbitrage — decision path (report: "Strategy 2").
 *
 * Queries Gamma events directly, excludes 5-minute crypto/binary contracts,
 * prices every leg off its real ask book, and gates bundle conversion through
 * optional `CtfEthCallPreflight` (`eth_call` simulation) before settling.
 */

import type { GammaEvent, GammaMarket } from '../../../polymarket/gamma-client';
import type { FeeScheduleResolver } from '../../../polymarket/fee-schedule-resolver';
import type { CtfEthCallPreflight } from '../../../polymarket/ctf-eth-call-preflight';
import { isFiveMinuteCryptoMarket } from '../../../polymarket/five-minute-crypto-guard';
import type { Poly1271SessionSigner } from '../../../polymarket/poly1271-session-signer';
import { logger } from '../../../core/logger';
import { BasePolymarketStrategy, type StrategyDeps } from '../base-polymarket-strategy';
import {
  DEFAULT_CONFIG,
  STRATEGY_NAME,
  type NegRiskBundleConfig,
} from './negrisk-bundle-arbitrage-types';
import {
  bundleableMarkets,
  noImplications,
  priceEvent,
  type ImplicationGraphFn,
} from './negrisk-bundle-arbitrage-event-pricer';
import { BundleBook, type BasketTelemetry } from './negrisk-bundle-arbitrage-state';
import { BundleLegExecutor } from './negrisk-bundle-arbitrage-leg-executor';
import { capitalWithinEnvelope } from './negrisk-bundle-arbitrage-math';
import {
  eventVolume,
  settleOrRecordBundle,
  type BundlePreflightStats,
} from './negrisk-bundle-arbitrage-settlement';

export type {
  BundleLeg, BundleLegPlacement, BundleProjection, BundleQuote, NegRiskBundleConfig,
} from './negrisk-bundle-arbitrage-types';
export type { BundlePreflightStats } from './negrisk-bundle-arbitrage-settlement';
export { DEFAULT_CONFIG, STRATEGY_NAME } from './negrisk-bundle-arbitrage-types';
export * from './negrisk-bundle-arbitrage-math';

/** `StrategyDeps` is fixed at four members, so pilot-ready seams ride alongside it. */
export interface NegRiskBundleArbitrageDeps extends StrategyDeps {
  feeResolver?: FeeScheduleResolver;
  implications?: ImplicationGraphFn;
  ctfPreflight?: CtfEthCallPreflight;
  sessionSigner?: Poly1271SessionSigner;
}

export class NegRiskBundleArbitrageStrategy extends BasePolymarketStrategy {
  private readonly cfg: NegRiskBundleConfig;
  private readonly feeResolver?: FeeScheduleResolver;
  private readonly implications: ImplicationGraphFn;
  private readonly ctfPreflight?: CtfEthCallPreflight;
  private readonly sessionSigner?: Poly1271SessionSigner;
  private readonly book = new BundleBook();
  private readonly legs: BundleLegExecutor;
  private readonly preflightStats: BundlePreflightStats = {
    preflightPassed: 0,
    preflightBlocked: 0,
    excludedFiveMinuteEvents: 0,
  };

  constructor(deps: NegRiskBundleArbitrageDeps, config: Partial<NegRiskBundleConfig> = {}) {
    const fullConfig: NegRiskBundleConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
    this.feeResolver = deps.feeResolver;
    this.implications = deps.implications ?? noImplications;
    this.ctfPreflight = deps.ctfPreflight;
    this.sessionSigner = deps.sessionSigner;
    this.legs = new BundleLegExecutor({
      clob: deps.clob,
      orderManager: deps.orderManager,
      strategyName: this.strategyName,
      config: fullConfig,
      book: this.book,
    });
  }

  getSessionSigner(): Poly1271SessionSigner | undefined {
    return this.sessionSigner;
  }

  protected async scanEntries(_markets: GammaMarket[]): Promise<void> {
    const now = Date.now();
    this.retireStale(now);
    let events: GammaEvent[];
    try {
      events = await this.deps.gamma.getEvents(this.cfg.eventScanLimit);
    } catch (err) {
      logger.warn('Event scan failed', this.strategyName, { err: String(err) });
      return;
    }
    for (const event of events) {
      if (this.getPositionCount() >= this.cfg.maxPositions) return;
      await this.consider(event, now);
    }
  }

  private async consider(event: GammaEvent, now: number): Promise<void> {
    if (isFiveMinuteCryptoMarket(event)) {
      this.preflightStats.excludedFiveMinuteEvents += 1;
      return;
    }
    const outcomeCount = bundleableMarkets(event).length;
    this.enforceKillSwitch(event, outcomeCount);
    if (this.book.isOpen(event.id) || this.book.isKilled(event.id)) return;
    if (this.isOnCooldown(event.id, now)) return;
    if (eventVolume(event) < this.cfg.minVolume) return;

    let priced: Awaited<ReturnType<typeof priceEvent>>;
    try {
      priced = await priceEvent(event, {
        clob: this.deps.clob,
        feeResolver: this.feeResolver,
        strategyName: this.strategyName,
        config: this.cfg,
        implications: this.implications,
      });
    } catch (err) {
      logger.debug('Event pricing failed', this.strategyName, { eventId: event.id, err: String(err) });
      this.setCooldown(event.id, now);
      return;
    }
    if (!priced) {
      this.setCooldown(event.id, now);
      return;
    }

    const quote = priced.quote;
    const capital = this.cfg.legNotionalPusd * quote.legs.length;
    if (!capitalWithinEnvelope(capital, this.cfg.minCapitalPerEventPusd, this.cfg.maxCapitalPerEventPusd)) {
      this.setCooldown(event.id, now);
      return;
    }

    this.book.open(quote, now);
    const failures = await this.legs.executeQuote(quote, now);
    await settleOrRecordBundle({
      eventId: event.id,
      nowMs: now,
      book: this.book,
      cfg: this.cfg,
      orderManager: this.deps.orderManager,
      strategyName: this.strategyName,
      positions: this.positions,
      emitTrade: this.emitTrade.bind(this),
      ctfPreflight: this.ctfPreflight,
      stats: this.preflightStats,
    });
    logger.info('Bundle leg pass complete', this.strategyName, {
      eventId: event.id,
      legs: quote.legs.length,
      capitalPusd: capital,
      netEdgePusd: quote.netEdgePusd,
      aggressiveFailures: failures,
      makerOptimised: quote.makerOptimisationApplies,
    });
    this.setCooldown(event.id, now);
  }

  getBasketTelemetry(): Readonly<BasketTelemetry> {
    return this.book.basketTelemetry;
  }

  getPreflightTelemetry(): Readonly<BundlePreflightStats> {
    return { ...this.preflightStats };
  }

  private enforceKillSwitch(event: GammaEvent, outcomeCount: number): void {
    if (!this.book.isOpen(event.id) || this.book.isKilled(event.id)) return;
    const reason = this.book.killReason(event.id, outcomeCount, this.cfg);
    if (!reason) return;
    this.book.markKilled(event.id);
    logger.warn('Bundle cluster killed', this.strategyName, { eventId: event.id, reason, outcomeCount });
  }

  private retireStale(now: number): void {
    for (const record of this.book.activeRecords) {
      if (!record.killed && now - record.openedAtMs > this.cfg.maxHoldMs) {
        this.book.retire(record.eventId);
      }
    }
  }
}

export function createNegRiskBundleArbitrageTick(
  deps: NegRiskBundleArbitrageDeps,
): () => Promise<void> {
  return new NegRiskBundleArbitrageStrategy(deps).toTickFn();
}
