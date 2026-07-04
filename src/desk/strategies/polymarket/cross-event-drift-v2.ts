/**
 * Cross-Event Drift V2 — extends BasePolymarketStrategy.
 *
 * When one market in an event group moves significantly, other correlated
 * markets should follow. Catches the "drift" — trades the lagging market
 * expecting it to catch up to the leader. Uses gamma.getEvents().
 *
 * Custom exit: convergence (laggard caught up to ≥50% of leader's move).
 */

import type { GammaClient, GammaMarket, GammaMarketGroup } from '../../polymarket/gamma-client';
import type { KellyPositionSizer } from '../../polymarket/kelly-position-sizer';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type OpenPosition,
  type StrategyDeps,
} from './base-polymarket-strategy';

// ── Config ───────────────────────────────────────────────────────────────────

export interface CrossEventDriftConfig extends BaseStrategyConfig {
  driftThreshold: number;
  followThreshold: number;
  minCorrelation: number;
  lookbackPeriods: number;
  returnWindow: number;
  sizeUsdc: number;
  scanLimit: number;
}

export const DEFAULT_CONFIG: CrossEventDriftConfig = {
  driftThreshold: 0.03,
  followThreshold: 0.005,
  minCorrelation: 0.3,
  lookbackPeriods: 15,
  returnWindow: 5,
  sizeUsdc: 25,
  scanLimit: 8,
  minVolume: 0,
  takeProfitPct: 0.02,
  stopLossPct: 0.015,
  maxHoldMs: 10 * 60_000,
  maxPositions: 5,
  cooldownMs: 90_000,
  positionSize: '25',
};

const STRATEGY_NAME: StrategyName = 'cross-event-drift';

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function calcReturn(prices: number[], window: number): number {
  if (prices.length < 2 || window < 2) return 0;
  const n = Math.min(window, prices.length);
  const start = prices[prices.length - n];
  const end = prices[prices.length - 1];
  if (start === 0) return 0;
  return (end - start) / start;
}

export function calcCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  let sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) { sumA += a[i]; sumB += b[i]; }
  const meanA = sumA / n, meanB = sumB / n;
  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const dA = a[i] - meanA, dB = b[i] - meanB;
    cov += dA * dB; varA += dA * dA; varB += dB * dB;
  }
  const denom = Math.sqrt(varA * varB);
  return denom === 0 ? 0 : cov / denom;
}

export function findLeaderLaggards(
  marketReturns: Map<string, number>,
  driftThreshold: number,
  followThreshold: number,
): { leader: { id: string; ret: number } | null; laggards: string[] } {
  let leader: { id: string; ret: number } | null = null;
  for (const [id, ret] of marketReturns) {
    if (Math.abs(ret) >= driftThreshold) {
      if (!leader || Math.abs(ret) > Math.abs(leader.ret)) leader = { id, ret };
    }
  }
  if (!leader) return { leader: null, laggards: [] };
  const laggards: string[] = [];
  for (const [id, ret] of marketReturns) {
    if (id !== leader.id && Math.abs(ret) < followThreshold) laggards.push(id);
  }
  return { leader, laggards };
}

// ── Strategy class ───────────────────────────────────────────────────────────

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
    if (arr.length > this.cfg.lookbackPeriods * 2) {
      arr.splice(0, arr.length - this.cfg.lookbackPeriods * 2);
    }
  }

  private getSize(): number {
    return this.kellySizer?.getSize(STRATEGY_NAME).size ?? parseFloat(this.cfg.positionSize);
  }

  /** Convergence exit: laggard caught up to ≥50% of leader's move. */
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
        m => m.yesTokenId && !m.closed && !m.resolved,
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
        } catch { continue; }
      }

      const marketReturns = new Map<string, number>();
      for (const [tokenId] of marketMids) {
        const history = this.priceHistory.get(tokenId);
        if (!history || history.length < this.cfg.returnWindow) continue;
        marketReturns.set(tokenId, calcReturn(history, this.cfg.returnWindow));
      }
      if (marketReturns.size < 2) continue;

      const { leader, laggards } = findLeaderLaggards(
        marketReturns, this.cfg.driftThreshold, this.cfg.followThreshold,
      );
      if (!leader || laggards.length === 0) continue;

      for (const laggardId of laggards) {
        if (this.getPositionCount() >= this.cfg.maxPositions) break;
        if (this.hasPosition(
          activeMarkets.find(m => m.yesTokenId === laggardId)?.conditionId ?? '',
        )) continue;
        const laggardConditionId = activeMarkets.find(m => m.yesTokenId === laggardId)?.conditionId;
        if (!laggardConditionId || this.isOnCooldown(laggardConditionId)) continue;

        const leaderHistory = this.priceHistory.get(leader.id)?.slice(-this.cfg.lookbackPeriods) ?? [];
        const laggardHistory = this.priceHistory.get(laggardId)?.slice(-this.cfg.lookbackPeriods) ?? [];
        if (calcCorrelation(leaderHistory, laggardHistory) < this.cfg.minCorrelation) continue;

        const side: 'yes' | 'no' = leader.ret > 0 ? 'yes' : 'no';
        const laggardMarket = activeMarkets.find(m => m.yesTokenId === laggardId);
        if (!laggardMarket) continue;

        const tokenId = side === 'yes' ? laggardId : (laggardMarket.noTokenId ?? laggardId);
        try {
          const book = await this.deps.clob.getOrderBook(tokenId);
          const ba = this.bestBidAsk(book);
          const entryPrice = ba.ask;

          await this.enterPosition(tokenId, laggardConditionId, side, entryPrice, this.getSize());
          this.leaderReturns.set(laggardConditionId, leader.ret);

          logger.debug('Cross-event drift entry', this.strategyName, {
            conditionId: laggardConditionId, side,
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

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface CrossEventDriftDeps extends StrategyDeps {
  kellySizer?: KellyPositionSizer;
  config?: Partial<CrossEventDriftConfig>;
}

export function createCrossEventDriftTick(deps: CrossEventDriftDeps): () => Promise<void> {
  const { kellySizer, config, ...baseDeps } = deps;
  const strategy = new CrossEventDriftStrategy(baseDeps, config, kellySizer);
  return strategy.toTickFn();
}
