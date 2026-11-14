/**
 * Primary-Source News-to-Probability Latency — decision path (report: "Strategy 4").
 *
 * One scan: grade old detections, check the clock, read bulletins, and for
 * every event whose compiled arbitration check a fresh bulletin satisfies by
 * absolute two-stream consensus, sweep the deadline ladder at p_max. Shadow
 * mode is the default and stays on until the 15-detection / 0% false-positive
 * gate passes; until then a detection is graded, never traded. A single
 * falsified detection or a measured clock drift above the limit hard-locks it.
 */

import type { GammaEvent, GammaMarket } from '../../../polymarket/gamma-client';
import type { FeeScheduleResolver } from '../../../polymarket/fee-schedule-resolver';
import { logger } from '../../../core/logger';
import { BasePolymarketStrategy, type OpenPosition, type StrategyDeps } from '../base-polymarket-strategy';
import { DEFAULT_CONFIG, STRATEGY_NAME, type ArbitrationCheckFn, type Bulletin, type NewsFill, type NewsStreams, type PrimarySourceNewsLatencyConfig } from './primary-source-news-latency-types';
import { DEFAULT_NEWS_STREAMS, noArbitrationChecks, rssBulletinSource, unknownClockOffset, type BulletinSource, type ClockOffsetProbe } from './primary-source-news-latency-sources';
import { capitalSplit, clockOffsetLocked, clusterCapitalWithinEnvelope, holdWindowOpen, isFresh, ladderLegCountOk, usableCheck, withinDetectionBudget } from './primary-source-news-latency-math';
import { buildLadder, verifyBulletin } from './primary-source-news-latency-detector';
import { NewsLatencyBook } from './primary-source-news-latency-state';
import { NewsLadderExecutor } from './primary-source-news-latency-executor';
import { gradeDetection } from './primary-source-news-latency-grader';
import { recycleInBand } from './primary-source-news-latency-recycler';

export type { PrimarySourceNewsLatencyConfig, Bulletin, MarketCheck, LadderLeg, NewsFill } from './primary-source-news-latency-types';
export { DEFAULT_CONFIG, STRATEGY_NAME } from './primary-source-news-latency-types';
export * from './primary-source-news-latency-math';
export * from './primary-source-news-latency-sources';

/** `StrategyDeps` is fixed at four members, so the injected seams ride alongside it. */
export interface PrimarySourceNewsLatencyDeps extends StrategyDeps {
  feeResolver?: FeeScheduleResolver;
  bulletins?: BulletinSource;
  arbitrationChecks?: ArbitrationCheckFn;
  streams?: NewsStreams;
  clockOffset?: ClockOffsetProbe;
  clock?: () => number;
}

export class PrimarySourceNewsLatencyStrategy extends BasePolymarketStrategy {
  private readonly cfg: PrimarySourceNewsLatencyConfig;
  private readonly seams: Required<Omit<PrimarySourceNewsLatencyDeps, keyof StrategyDeps | 'feeResolver'>>;
  private readonly feeResolver?: FeeScheduleResolver;
  readonly book = new NewsLatencyBook();
  private readonly executor: NewsLadderExecutor;

  constructor(deps: PrimarySourceNewsLatencyDeps, config: Partial<PrimarySourceNewsLatencyConfig> = {}) {
    const fullConfig: PrimarySourceNewsLatencyConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
    this.feeResolver = deps.feeResolver;
    this.seams = {
      bulletins: deps.bulletins ?? rssBulletinSource,
      arbitrationChecks: deps.arbitrationChecks ?? noArbitrationChecks,
      streams: deps.streams ?? DEFAULT_NEWS_STREAMS,
      clockOffset: deps.clockOffset ?? unknownClockOffset,
      clock: deps.clock ?? Date.now,
    };
    this.executor = new NewsLadderExecutor({ orderManager: deps.orderManager, strategyName: this.strategyName, config: fullConfig });
  }

  /** The recycled residual is held to resolution only inside the short UMA window. */
  protected getCustomExitCondition(pos: OpenPosition): { exit: boolean; reason: string } {
    const leg = this.book.ownedLeg(pos.tokenId);
    if (!leg || !leg.recycled) return { exit: false, reason: '' };
    if (holdWindowOpen(leg.expiryMs, this.seams.clock(), this.cfg.holdToResolutionMaxWindowMs)) return { exit: false, reason: '' };
    return { exit: true, reason: 'residual outside resolution window' };
  }

  protected override async checkExits(now = this.seams.clock()): Promise<void> {
    await super.checkExits(now);
  }

  protected override async exitPosition(pos: OpenPosition, currentPrice: number, reason: string): Promise<void> {
    await super.exitPosition(pos, currentPrice, reason);
    this.book.releaseLeg(pos.tokenId);
  }

  /** Trending markets cannot express a ladder; Gamma is asked for events directly. */
  protected async scanEntries(_markets: GammaMarket[]): Promise<void> {
    if (this.book.isLocked()) return;
    const now = this.seams.clock();
    await this.gradePending(now);
    if (this.book.isLocked()) return;
    const offset = await this.seams.clockOffset();
    if (offset !== null && clockOffsetLocked(offset, this.cfg.maxNtpOffsetMs)) {
      this.book.lock('clock-offset', now, `offset ${offset} ms`);
      logger.warn('News latency module locked', this.strategyName, { reason: 'clock-offset', offset });
      return;
    }
    await recycleInBand(this.recycleContext(), now);
    let bulletins: Bulletin[];
    let events: GammaEvent[];
    try {
      bulletins = (await this.seams.bulletins(this.cfg.bulletinPollLimit)).filter((b) => isFresh(b, now, this.cfg.maxBulletinAgeMs));
      events = bulletins.length > 0 ? await this.deps.gamma.getEvents(this.cfg.eventScanLimit) : [];
    } catch (err) {
      logger.warn('News scan failed', this.strategyName, { err: String(err) });
      return;
    }
    const mayTrade = offset !== null && !this.cfg.shadowMode && this.book.shadowGatePassed(this.cfg);
    for (const event of events) {
      if (this.getPositionCount() >= this.cfg.maxPositions) return;
      for (const bulletin of bulletins) await this.consider(event, bulletin, mayTrade);
    }
  }

  private async consider(event: GammaEvent, bulletin: Bulletin, mayTrade: boolean): Promise<void> {
    const check = this.seams.arbitrationChecks(event);
    if (!check || !usableCheck(check) || this.isOnCooldown(event.id, this.seams.clock())) return;
    if (!this.book.markSeen(bulletin.id, event.id)) return;
    const verification = await verifyBulletin(bulletin, check, this.seams.streams, this.cfg, this.seams.clock);
    if (!verification.confirmed) return;
    const now = this.seams.clock();
    const legs = await buildLadder(event, now, { clob: this.deps.clob, feeResolver: this.feeResolver, strategyName: this.strategyName, config: this.cfg });
    if (!ladderLegCountOk(legs.length, this.cfg)) return;
    this.book.recordDetection({ eventId: event.id, bulletinId: bulletin.id, conditionIds: legs.map((l) => l.conditionId), detectedAtMs: now });
    const latencyMs = this.seams.clock() - bulletin.publishedAtMs;
    const inBudget = withinDetectionBudget(latencyMs, this.cfg.detectionBudgetMs);
    logger.info('News detection', this.strategyName, { eventId: event.id, bulletinId: bulletin.id, legs: legs.length, latencyMs, inBudget, mayTrade, verifyMs: verification.elapsedMs });
    if (!mayTrade || !inBudget) return;
    if (!clusterCapitalWithinEnvelope(this.cfg.clusterCapitalPusd, this.cfg.minClusterCapitalPusd, this.cfg.maxClusterCapitalPusd)) return;
    const fills = await this.executor.sweep(legs, capitalSplit(this.cfg.clusterCapitalPusd, legs.length), now);
    for (const fill of fills) this.recordFill(fill, legs.find((l) => l.tokenId === fill.tokenId)?.expiryMs ?? 0);
    this.setCooldown(event.id, now);
  }

  /** A falsified detection locks the module; a confirmed one is settled. */
  private async gradePending(now: number): Promise<void> {
    for (const grade of this.book.pendingGrades()) {
      const outcome = await gradeDetection(grade, this.deps.gamma);
      if (outcome === 'pending') continue;
      this.book.settleGrade(grade);
      if (outcome === 'falsified') {
        this.book.recordFalsePositive(now, `event ${grade.eventId} resolved NO after bulletin ${grade.bulletinId}`);
        logger.warn('News latency module locked', this.strategyName, { reason: 'false-trigger', eventId: grade.eventId });
        return;
      }
    }
  }

  private recordFill(fill: NewsFill, expiryMs: number): void {
    this.book.recordFill(fill, expiryMs);
    this.positions.push({
      tokenId: fill.tokenId, conditionId: fill.conditionId, side: 'yes', entryPrice: fill.price,
      sizeUsdc: fill.quantity * fill.price, tokenQuantity: fill.quantity,
      entryFeesUsdc: parseFloat(fill.fees ?? '0') || 0, orderId: fill.orderId, openedAt: fill.atMs,
    });
    this.emitTrade({ orderId: fill.orderId, marketId: fill.conditionId, side: 'buy', fillPrice: fill.price.toFixed(4),
      fillSize: (fill.quantity * fill.price).toFixed(2), fees: fill.fees ?? '0', timestamp: fill.atMs, strategy: this.strategyName });
  }

  private recycleContext() {
    return {
      book: this.book, positions: this.positions, executor: this.executor, config: this.cfg, strategyName: this.strategyName,
      getBid: async (tokenId: string) => (await this.getCurrentPrice(tokenId)).bid,
      emit: (trade: Parameters<BasePolymarketStrategy['emitTrade']>[0]) => this.emitTrade(trade),
    };
  }
}

export function createPrimarySourceNewsLatencyTick(deps: PrimarySourceNewsLatencyDeps): () => Promise<void> {
  return new PrimarySourceNewsLatencyStrategy(deps).toTickFn();
}
