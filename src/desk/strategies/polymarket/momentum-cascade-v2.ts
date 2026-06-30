/**
 * Momentum Cascade V2 — extends BasePolymarketStrategy.
 *
 * Detects cascading momentum across related markets within events.
 * When a leader market moves strongly, follower markets tend to follow.
 * Trades the followers before they catch up.
 *
 * Uses gamma.getEvents() instead of getTrending() — overrides execute().
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';

// ── Config ───────────────────────────────────────────────────────────────────

export interface MomentumCascadeConfig extends BaseStrategyConfig {
  momentumWindow: number;
  momentumEmaAlpha: number;
  cascadeThreshold: number;
  followerLagMax: number;
  minMarketsPerEvent: number;
}

export const DEFAULT_CONFIG: MomentumCascadeConfig = {
  momentumWindow: 12,
  momentumEmaAlpha: 0.15,
  cascadeThreshold: 0.03,
  followerLagMax: 0.01,
  minMarketsPerEvent: 2,
  minVolume: 5000,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 15 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '10',
};

const STRATEGY_NAME = 'momentum-cascade' as StrategyName;

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function calcReturn(prices: number[]): number {
  if (prices.length < 2) return 0;
  const first = prices[0];
  if (first === 0) return 0;
  const last = prices[prices.length - 1];
  return (last - first) / first;
}

export function updateMomentumEma(prevEma: number | null, returnVal: number, alpha: number): number {
  if (prevEma === null) return returnVal;
  if (alpha <= 0) return prevEma;
  if (alpha >= 1) return returnVal;
  return alpha * returnVal + (1 - alpha) * prevEma;
}

export function findLeader(momentums: Map<string, number>): { marketId: string; momentum: number } | null {
  let bestId: string | null = null;
  let bestAbs = -1;
  let bestMom = 0;

  for (const [id, mom] of momentums) {
    const abs = Math.abs(mom);
    if (abs > bestAbs) {
      bestId = id;
      bestAbs = abs;
      bestMom = mom;
    }
  }

  if (bestId === null) return null;
  return { marketId: bestId, momentum: bestMom };
}

export function calcCascadeScore(leaderMomentum: number, followerMomentum: number): number {
  return leaderMomentum - followerMomentum;
}

export function isFollowerLagging(followerMomentum: number, lagMax: number): boolean {
  return Math.abs(followerMomentum) < lagMax;
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class MomentumCascadeStrategy extends BasePolymarketStrategy {
  private readonly cfg: MomentumCascadeConfig;
  private readonly priceHistory = new Map<string, number[]>();
  private readonly momentumEmaState = new Map<string, number>();

  constructor(deps: StrategyDeps, config: Partial<MomentumCascadeConfig> = {}) {
    const fullConfig: MomentumCascadeConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  /** Required by abstract base — unused; real entry uses scanEventEntries. */
  protected async scanEntries(_markets: GammaMarket[]): Promise<void> {
    // no-op: overridden execute() uses scanEventEntries instead
  }

  private recordPrice(tokenId: string, price: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) {
      history = [];
      this.priceHistory.set(tokenId, history);
    }
    history.push(price);
    if (history.length > this.cfg.momentumWindow) {
      history.splice(0, history.length - this.cfg.momentumWindow);
    }
  }

  private updateMomentumEmaState(tokenId: string, returnVal: number): number {
    const prev = this.momentumEmaState.get(tokenId) ?? null;
    const ema = updateMomentumEma(prev, returnVal, this.cfg.momentumEmaAlpha);
    this.momentumEmaState.set(tokenId, ema);
    return ema;
  }

  private async scanEventEntries(
    events: { id: string; markets: GammaMarket[] }[],
  ): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    for (const event of events) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;

      const validMarkets = event.markets.filter(m =>
        m.yesTokenId && !m.closed && !m.resolved && (m.volume ?? 0) >= this.cfg.minVolume,
      );
      if (validMarkets.length < this.cfg.minMarketsPerEvent) continue;

      // Build momentum map
      const momentums = new Map<string, number>();
      for (const market of validMarkets) {
        try {
          const book = await this.deps.clob.getOrderBook(market.yesTokenId!);
          const ba = this.bestBidAsk(book);
          if (ba.mid <= 0 || ba.mid >= 1) continue;

          this.recordPrice(market.yesTokenId!, ba.mid);
          const prices = this.priceHistory.get(market.yesTokenId!) ?? [];
          if (prices.length < 2) continue;

          const ret = calcReturn(prices);
          const mom = this.updateMomentumEmaState(market.yesTokenId!, ret);
          momentums.set(market.conditionId, mom);
        } catch (err) {
          logger.debug('Price fetch error', this.strategyName, {
            market: market.conditionId, err: String(err),
          });
        }
      }

      if (momentums.size < this.cfg.minMarketsPerEvent) continue;

      const leader = findLeader(momentums);
      if (!leader) continue;

      // Scan followers for cascade trades
      for (const market of validMarkets) {
        if (this.getPositionCount() >= this.cfg.maxPositions) break;
        if (market.conditionId === leader.marketId) continue;
        if (this.hasPosition(market.conditionId)) continue;
        if (this.isOnCooldown(market.conditionId)) continue;

        const followerMom = momentums.get(market.conditionId);
        if (followerMom === undefined) continue;
        if (!isFollowerLagging(followerMom, this.cfg.followerLagMax)) continue;

        const cascadeScore = calcCascadeScore(leader.momentum, followerMom);
        if (Math.abs(cascadeScore) < this.cfg.cascadeThreshold) continue;

        const side: 'yes' | 'no' = leader.momentum > 0 ? 'yes' : 'no';
        const tokenId = side === 'yes' ? market.yesTokenId! : (market.noTokenId ?? market.yesTokenId!);

        try {
          const book = await this.deps.clob.getOrderBook(tokenId);
          const ba = this.bestBidAsk(book);
          const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

          await this.enterPosition(tokenId, market.conditionId, side, entryPrice,
            parseFloat(this.cfg.positionSize));

          logger.debug('Momentum cascade entry', this.strategyName, {
            leaderMarket: leader.marketId,
            leaderMomentum: leader.momentum.toFixed(4),
            cascadeScore: cascadeScore.toFixed(4),
          });
        } catch (err) {
          logger.debug('Entry error', this.strategyName, {
            market: market.conditionId, err: String(err),
          });
        }
      }
    }
  }

  /** Override execute() — this strategy uses getEvents() instead of getTrending(). */
  async execute(): Promise<void> {
    try {
      await this.checkExits();
      const events = await this.deps.gamma.getEvents(15);
      await this.scanEventEntries(events);
      logger.debug('Tick complete', this.strategyName, {
        openPositions: this.positions.length,
      });
    } catch (err) {
      logger.error('Tick failed', this.strategyName, { err: String(err) });
    }
  }
}

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface MomentumCascadeDeps extends StrategyDeps {
  config?: Partial<MomentumCascadeConfig>;
}

export function createMomentumCascadeTick(deps: MomentumCascadeDeps): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new MomentumCascadeStrategy(baseDeps, config);
  return strategy.toTickFn();
}
