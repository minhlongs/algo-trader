/**
 * Cross-Event Drift Strategy Class
 * Exploits price divergence between correlated event markets on Polymarket.
 */

import type { GammaMarket, GammaMarketGroup } from '../../polymarket/gamma-client';
import type { KellyPositionSizer } from '../../polymarket/kelly-position-sizer';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type OpenPosition,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  type CrossEventDriftConfig,
  DEFAULT_CONFIG,
  STRATEGY_NAME,
} from './cross-event-drift-types';
import { calcReturn, calcCorrelation, findLeaderLaggards } from './cross-event-drift-math';

export class CrossEventDriftStrategy extends BasePolymarketStrategy {
  private readonly cfg: CrossEventDriftConfig;
  private readonly kellySizer?: KellyPositionSizer;
  private readonly priceHistory = new Map<string, number[]>();
  /** Tracks the leader's return at entry for convergence exit detection. */
  private readonly leaderReturns = new Map<string, number>();

  constructor(
    deps: StrategyDeps,
    config: Partial<CrossEventDriftConfig> = {},
    kellySizer?: KellyPositionSizer,
  ) {
    const fullConfig: CrossEventDriftConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
    this.kellySizer = kellySizer;
  }

  /** Required by abstract base — unused; real entry uses scanEventEntries. */
  protected async scanEntries(_markets: GammaMarket[]): Promise<void> { /* no-op */ }

  private recordPrice(tokenId: string, price: number): void {
    let arr = this.priceHistory.get(tokenId);
    if (!arr) { arr = []; this.priceHistory.set(tokenId, arr); }
    arr.push(price);
    const maxLen = this.cfg.lookbackPeriods * 2;
    if (arr.length > maxLen) arr.splice(0, arr.length - maxLen);
  }

  private getSize(): number {
    return this.kellySizer?.getSize(STRATEGY_NAME).size ?? parseFloat(this.cfg.positionSize);
  }

  /** Convergence exit: laggard caught up to >=50% of leader's move. */
  protected getCustomExitCondition(pos: OpenPosition): { exit: boolean; reason: string } {
    const history = this.priceHistory.get(pos.tokenId);
    if (!history || history.length < this.cfg.returnWindow) return { exit: false, reason: '' };
    const laggardReturn = calcReturn(history, this.cfg.returnWindow);
    const leaderReturn = this.leaderReturns.get(pos.conditionId);
    if (leaderReturn === undefined) return { exit: false, reason: '' };
    if (Math.abs(laggardReturn) >= Math.abs(leaderReturn) * 0.5) {
      return {
        exit: true,
        reason: `convergence (laggard=${(laggardReturn * 100).toFixed(2)}%, leader=${(leaderReturn * 100).toFixed(2)}%)`,
      };
    }
    return { exit: false, reason: '' };
  }

  private async scanEventEntries(events: GammaMarketGroup[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    for (const event of events) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;

      const activeMarkets = event.markets.filter(
        (m) => m.yesTokenId && !m.closed && !m.resolved,
      );
      if (activeMarkets.length < 2) continue;

      const marketMids = new Map<string, number>();
      for (const m of activeMarkets) {
        try {
          const book = await this.deps.clob.getOrderBook(m.yesTokenId!);
          const ba = this.bestBidAsk(book);
          if (ba.mid <= 0 || ba.mid >= 1) continue;
          this.recordPrice(m.yesTokenId!, ba.mid);
          marketMids.set(m.yesTokenId!, ba.mid);
        } catch {
          continue;
        }
      }

      const marketReturns = new Map<string, number>();
      for (const [tokenId] of marketMids) {
        const history = this.priceHistory.get(tokenId);
        if (!history || history.length < this.cfg.returnWindow) continue;
        marketReturns.set(tokenId, calcReturn(history, this.cfg.returnWindow));
      }
      if (marketReturns.size < 2) continue;

      const { leader, laggards } = findLeaderLaggards(
        marketReturns,
        this.cfg.driftThreshold,
        this.cfg.followThreshold,
      );
      if (!leader || laggards.length === 0) continue;

      for (const laggardId of laggards) {
        if (this.getPositionCount() >= this.cfg.maxPositions) break;
        const laggardMarket = activeMarkets.find((m) => m.yesTokenId === laggardId);
        if (!laggardMarket || !laggardMarket.conditionId) continue;
        const laggardConditionId = laggardMarket.conditionId;
        if (this.hasPosition(laggardConditionId) || this.isOnCooldown(laggardConditionId)) continue;

        const leaderHistory =
          this.priceHistory.get(leader.id)?.slice(-this.cfg.lookbackPeriods) ?? [];
        const laggardHistory =
          this.priceHistory.get(laggardId)?.slice(-this.cfg.lookbackPeriods) ?? [];
        if (calcCorrelation(leaderHistory, laggardHistory) < this.cfg.minCorrelation) continue;

        const side: 'yes' | 'no' = leader.ret > 0 ? 'yes' : 'no';
        const tokenId = side === 'yes' ? laggardId : (laggardMarket.noTokenId ?? laggardId);
        try {
          const book = await this.deps.clob.getOrderBook(tokenId);
          const ba = this.bestBidAsk(book);
          const entryPrice = ba.ask;

          await this.enterPosition(tokenId, laggardConditionId, side, entryPrice, this.getSize());
          this.leaderReturns.set(laggardConditionId, leader.ret);

          logger.debug('Cross-event drift entry', this.strategyName, {
            conditionId: laggardConditionId,
            side,
            entryPrice: entryPrice.toFixed(4),
            leaderReturn: (leader.ret * 100).toFixed(2) + '%',
            correlation: calcCorrelation(leaderHistory, laggardHistory).toFixed(3),
          });
        } catch (err) {
          logger.debug('Entry failed', this.strategyName, { tokenId, err: String(err) });
        }
      }
    }
  }

  async execute(): Promise<void> {
    try {
      await this.checkExits();
      const events = await this.deps.gamma.getEvents(this.cfg.scanLimit);
      await this.scanEventEntries(events);
      logger.debug('Tick complete', this.strategyName, {
        openPositions: this.positions.length,
        trackedMarkets: this.priceHistory.size,
      });
    } catch (err) {
      logger.error('Tick failed', this.strategyName, { err: String(err) });
    }
  }
}
