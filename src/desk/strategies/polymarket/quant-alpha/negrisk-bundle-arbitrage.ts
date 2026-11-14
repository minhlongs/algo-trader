/**
 * Event-level NegRisk bundle arbitrage — decision path (report: "Strategy 2").
 *
 * Queries Gamma events directly, prices every leg off its real ask book, and
 * settles exhaustive complete baskets on the paper ledger once per bundle.
 */

import type { GammaEvent, GammaMarket } from '../../../polymarket/gamma-client';
import type { FeeScheduleResolver } from '../../../polymarket/fee-schedule-resolver';
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
import { BundleBook, type BasketTelemetry, type BundleFill } from './negrisk-bundle-arbitrage-state';
import { BundleLegExecutor } from './negrisk-bundle-arbitrage-leg-executor';
import { capitalWithinEnvelope } from './negrisk-bundle-arbitrage-math';

export type {
  BundleLeg, BundleLegPlacement, BundleProjection, BundleQuote, NegRiskBundleConfig,
} from './negrisk-bundle-arbitrage-types';
export { DEFAULT_CONFIG, STRATEGY_NAME } from './negrisk-bundle-arbitrage-types';
export * from './negrisk-bundle-arbitrage-math';

/** `StrategyDeps` is fixed at four members, so the resolver rides alongside it. */
export interface NegRiskBundleArbitrageDeps extends StrategyDeps {
  feeResolver?: FeeScheduleResolver;
  implications?: ImplicationGraphFn;
}

export class NegRiskBundleArbitrageStrategy extends BasePolymarketStrategy {
  private readonly cfg: NegRiskBundleConfig;
  private readonly feeResolver?: FeeScheduleResolver;
  private readonly implications: ImplicationGraphFn;
  private readonly book = new BundleBook();
  private readonly legs: BundleLegExecutor;

  constructor(deps: NegRiskBundleArbitrageDeps, config: Partial<NegRiskBundleConfig> = {}) {
    const fullConfig: NegRiskBundleConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
    this.feeResolver = deps.feeResolver;
    this.implications = deps.implications ?? noImplications;
    this.legs = new BundleLegExecutor({
      clob: deps.clob,
      orderManager: deps.orderManager,
      strategyName: this.strategyName,
      config: fullConfig,
      book: this.book,
    });
  }

  /** The trending-market argument cannot describe an event; Gamma is asked directly. */
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

  /** One event, from kill check to leg placement. */
  private async consider(event: GammaEvent, now: number): Promise<void> {
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
      // A leg book that cannot be read is not a leg priced at zero.
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
    await this.record(event.id, now);
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

  /** Attempted vs. converted basket counts for KPI governance. */
  getBasketTelemetry(): Readonly<BasketTelemetry> {
    return this.book.basketTelemetry;
  }

  /** Kills a cluster whose outcome list grew or whose failfast rate blew up. */
  private enforceKillSwitch(event: GammaEvent, outcomeCount: number): void {
    if (!this.book.isOpen(event.id) || this.book.isKilled(event.id)) return;
    const reason = this.book.killReason(event.id, outcomeCount, this.cfg);
    if (!reason) return;
    this.book.markKilled(event.id);
    logger.warn('Bundle cluster killed', this.strategyName, { eventId: event.id, reason, outcomeCount });
  }

  /** Release partial records older than maxHoldMs once base TP/SL has had its window. */
  private retireStale(now: number): void {
    for (const record of this.book.activeRecords) {
      if (!record.killed && now - record.openedAtMs > this.cfg.maxHoldMs) {
        this.book.retire(record.eventId);
      }
    }
  }

  /** Emits fills, settles complete baskets on the paper ledger, and tracks residuals. */
  private async record(eventId: string, nowMs: number): Promise<void> {
    const fills = this.book.filledLegs(eventId);
    for (const fill of fills) this.emitFill(fill);
    if (this.book.isComplete(eventId)) {
      const qty = this.book.convertibleQuantity(eventId);
      const released = this.book.convert(eventId, this.cfg);
      if (released > 0) {
        await this.deps.orderManager.settleBundleConversion?.({
          legs: fills.map((f) => ({ tokenId: f.tokenId, aggressive: f.aggressive })),
          quantity: qty,
          payoutPerBundlePusd: 1 - this.cfg.conversionVaultFeePusd,
          timestamp: new Date(nowMs).toISOString(),
        });
        logger.info('Bundle converted on paper', this.strategyName, { eventId, releasedPusd: released });
      }
    }
    for (const position of this.book.toPositions(eventId)) this.positions.push(position);
    if (this.book.isComplete(eventId)) this.book.retire(eventId);
  }

  private emitFill(fill: BundleFill): void {
    this.emitTrade({
      orderId: fill.orderId,
      marketId: fill.conditionId,
      side: 'buy',
      fillPrice: fill.price.toFixed(4),
      fillSize: (fill.quantity * fill.price).toFixed(2),
      fees: fill.fees ?? '0',
      timestamp: fill.atMs,
      strategy: this.strategyName,
    });
  }
}

/** Volume an event carries, so the base class volume floor still means something. */
function eventVolume(event: GammaEvent): number {
  let total = 0;
  for (const market of event.markets) total += market.volume ?? 0;
  return total;
}

export function createNegRiskBundleArbitrageTick(
  deps: NegRiskBundleArbitrageDeps,
): () => Promise<void> {
  const strategy = new NegRiskBundleArbitrageStrategy(deps);
  return strategy.toTickFn();
}
