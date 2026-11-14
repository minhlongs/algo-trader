/**
 * Primary-Source News-to-Probability Latency — decision path (Strategy 4 + 6).
 *
 * Grades pending detections, checks NTP clock drift, verifies fresh primary
 * bulletins via dual-stream + optional arbiter consensus, and sweeps the
 * deadline ladder at `p_max` (consuming a sealed Market-Blind posterior
 * `p_post(E) - theta_safety` when supplied, or `maxEntryPricePusd` otherwise).
 */

import type { GammaEvent, GammaMarket } from '../../../polymarket/gamma-client';
import type { FeeScheduleResolver } from '../../../polymarket/fee-schedule-resolver';
import { verifySealedForecastReceipt } from '../../../polymarket/market-blind/market-blind-prospective-ledger';
import { logger } from '../../../core/logger';
import { BasePolymarketStrategy, type OpenPosition, type StrategyDeps } from '../base-polymarket-strategy';
import { DEFAULT_CONFIG, STRATEGY_NAME, type ArbitrationCheckFn, type Bulletin, type MarketBlindPosteriorEvaluator, type NewsFill, type NewsStreams, type PrimarySourceNewsLatencyConfig } from './primary-source-news-latency-types';
import { DEFAULT_NEWS_STREAMS, noArbitrationChecks, rssBulletinSource, unknownClockOffset, type BulletinSource, type ClockOffsetProbe } from './primary-source-news-latency-sources';
import { capitalSplit, clockOffsetLocked, clusterCapitalWithinEnvelope, holdWindowOpen, isFresh, ladderLegCountOk, usableCheck, withinDetectionBudget } from './primary-source-news-latency-math';
import { buildLadder, verifyBulletin } from './primary-source-news-latency-detector';
import { NewsLatencyBook } from './primary-source-news-latency-state';
import { NewsLadderExecutor } from './primary-source-news-latency-executor';
import { gradeDetection } from './primary-source-news-latency-grader';
import { recycleInBand } from './primary-source-news-latency-recycler';

export type { PrimarySourceNewsLatencyConfig, Bulletin, MarketCheck, LadderLeg, NewsFill, NewsStreams, NewsClassifier, NewsStreamVerdict, MarketBlindEventPosterior, MarketBlindPosteriorEvaluator } from './primary-source-news-latency-types';
export { DEFAULT_CONFIG, STRATEGY_NAME } from './primary-source-news-latency-types';
export * from './primary-source-news-latency-math';
export * from './primary-source-news-latency-sources';
export { verifyBulletin, buildLadder, ladderMarkets, type Verification, type LadderOptions } from './primary-source-news-latency-detector';

/** `StrategyDeps` is fixed at four members, so injected seams ride alongside it. */
export interface PrimarySourceNewsLatencyDeps extends StrategyDeps {
  feeResolver?: FeeScheduleResolver;
  bulletins?: BulletinSource;
  arbitrationChecks?: ArbitrationCheckFn;
  streams?: NewsStreams;
  clockOffset?: ClockOffsetProbe;
  clock?: () => number;
  marketBlindEvaluator?: MarketBlindPosteriorEvaluator;
}

export class PrimarySourceNewsLatencyStrategy extends BasePolymarketStrategy {
  private readonly cfg: PrimarySourceNewsLatencyConfig;
  private readonly seams: Required<Omit<PrimarySourceNewsLatencyDeps, keyof StrategyDeps | 'feeResolver' | 'marketBlindEvaluator'>>;
  private readonly feeResolver?: FeeScheduleResolver;
  private readonly marketBlindEvaluator?: MarketBlindPosteriorEvaluator;
  readonly book = new NewsLatencyBook();
  private readonly executor: NewsLadderExecutor;

  constructor(deps: PrimarySourceNewsLatencyDeps, config: Partial<PrimarySourceNewsLatencyConfig> = {}) {
    const fullConfig: PrimarySourceNewsLatencyConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
    this.feeResolver = deps.feeResolver;
    this.marketBlindEvaluator = deps.marketBlindEvaluator;
    this.seams = {
      bulletins: deps.bulletins ?? rssBulletinSource,
      arbitrationChecks: deps.arbitrationChecks ?? noArbitrationChecks,
      streams: deps.streams ?? DEFAULT_NEWS_STREAMS,
      clockOffset: deps.clockOffset ?? unknownClockOffset,
      clock: deps.clock ?? Date.now,
    };
    this.executor = new NewsLadderExecutor({ orderManager: deps.orderManager, strategyName: this.strategyName, config: fullConfig });
  }

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
    const resolved = await this.resolvePosteriorConfig(event, bulletin, now);
    if (!resolved) return;
    const { effectiveConfig, posteriorAllowsTrade } = resolved;
    const legs = await buildLadder(event, now, { clob: this.deps.clob, feeResolver: this.feeResolver, strategyName: this.strategyName, config: effectiveConfig });
    if (!ladderLegCountOk(legs.length, effectiveConfig)) return;
    this.book.recordDetection({ eventId: event.id, bulletinId: bulletin.id, conditionIds: legs.map((l) => l.conditionId), detectedAtMs: now });
    const latencyMs = this.seams.clock() - bulletin.publishedAtMs;
    const inBudget = withinDetectionBudget(latencyMs, effectiveConfig.detectionBudgetMs);
    logger.info('News detection', this.strategyName, { eventId: event.id, bulletinId: bulletin.id, legs: legs.length, latencyMs, inBudget, mayTrade: mayTrade && posteriorAllowsTrade, verifyMs: verification.elapsedMs });
    if (!mayTrade || !posteriorAllowsTrade || !inBudget) return;
    if (!clusterCapitalWithinEnvelope(effectiveConfig.clusterCapitalPusd, effectiveConfig.minClusterCapitalPusd, effectiveConfig.maxClusterCapitalPusd)) return;
    const sweepExec = effectiveConfig === this.cfg
      ? this.executor
      : new NewsLadderExecutor({ orderManager: this.deps.orderManager, strategyName: this.strategyName, config: effectiveConfig });
    const fills = await sweepExec.sweep(legs, capitalSplit(effectiveConfig.clusterCapitalPusd, legs.length), now);
    for (const fill of fills) this.recordFill(fill, legs.find((l) => l.tokenId === fill.tokenId)?.expiryMs ?? 0);
    this.setCooldown(event.id, now);
  }

  private async resolvePosteriorConfig(
    event: GammaEvent,
    bulletin: Bulletin,
    nowMs: number,
  ): Promise<{ effectiveConfig: PrimarySourceNewsLatencyConfig; posteriorAllowsTrade: boolean } | null> {
    if (!this.marketBlindEvaluator) return { effectiveConfig: this.cfg, posteriorAllowsTrade: true };
    try {
      const mb = await this.marketBlindEvaluator({ event, bulletin, nowMs });
      if (!mb) return { effectiveConfig: this.cfg, posteriorAllowsTrade: false };
      verifySealedForecastReceipt(mb.receipt);
      if ((mb.receipt.questionId !== event.id && mb.receipt.questionId !== event.slug) || mb.receipt.loggedAtMs > nowMs) {
        logger.warn('Market-blind receipt event/timestamp mismatch', this.strategyName, { eventId: event.id, questionId: mb.receipt.questionId });
        return null;
      }
      const theta = mb.thetaSafety ?? this.cfg.posteriorSafetyMarginPusd;
      const validWSkill = typeof mb.wSkill === 'number' && Number.isFinite(mb.wSkill) && mb.wSkill >= 0;
      if (!Number.isFinite(mb.pPost) || mb.pPost <= 0 || mb.pPost >= 1 || !Number.isFinite(theta) || theta < 0 || !validWSkill) {
        logger.warn('Invalid market-blind posterior parameters', this.strategyName, { eventId: event.id });
        return null;
      }
      const pMax = Math.min(this.cfg.maxEntryPricePusd, Math.max(0, mb.pPost - theta));
      return { effectiveConfig: { ...this.cfg, maxEntryPricePusd: pMax }, posteriorAllowsTrade: mb.wSkill! > 0 };
    } catch (err) {
      logger.warn('Market-blind posterior rejected', this.strategyName, { eventId: event.id, err: String(err) });
      return null;
    }
  }

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
