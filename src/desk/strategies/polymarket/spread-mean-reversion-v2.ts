/**
 * Spread Mean Reversion V2 — migrated to BasePolymarketStrategy.
 *
 * Tracks the yes/no price spread within a single binary market. In a fair
 * binary market, yes + no should equal ~1.0. When the spread deviates
 * (yes + no != 1.0), trades toward restoring equilibrium.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import { BasePolymarketStrategy, type BaseStrategyConfig, type StrategyDeps } from './base-polymarket-strategy';

export interface SpreadMeanReversionConfig extends BaseStrategyConfig {
  spreadWindow: number;
  spreadThreshold: number;
  spreadEmaAlpha: number;
}

export const DEFAULT_CONFIG: SpreadMeanReversionConfig = {
  minVolume: 5000,
  takeProfitPct: 0.02,
  stopLossPct: 0.015,
  maxHoldMs: 10 * 60_000,
  maxPositions: 5,
  cooldownMs: 60_000,
  positionSize: '8',
  spreadWindow: 20,
  spreadThreshold: 0.02,
  spreadEmaAlpha: 0.1,
};

const STRATEGY_NAME = 'spread-mean-reversion' as StrategyName;

export function calcSpread(yesPrice: number, noPrice: number): number {
  return yesPrice + noPrice;
}

export function calcSpreadDeviation(spread: number): number {
  return spread - 1.0;
}

export function updateSpreadEma(prev: number | null, value: number, alpha: number): number {
  if (prev === null) return value;
  if (alpha <= 0) return prev;
  if (alpha >= 1) return value;
  return alpha * value + (1 - alpha) * prev;
}

export function determineCheapSide(yesPrice: number, noPrice: number): 'yes' | 'no' {
  return yesPrice <= noPrice ? 'yes' : 'no';
}

export function isSpreadSignal(deviation: number, threshold: number): boolean {
  return Math.abs(deviation) > threshold;
}

export class SpreadMeanReversionStrategy extends BasePolymarketStrategy {
  private readonly cfg: SpreadMeanReversionConfig;
  private readonly spreadHistory = new Map<string, number[]>();
  private readonly spreadEmaState = new Map<string, number>();

  constructor(deps: StrategyDeps, configOverride?: Partial<SpreadMeanReversionConfig>) {
    const cfg: SpreadMeanReversionConfig = { ...DEFAULT_CONFIG, ...configOverride };
    super(deps, cfg, STRATEGY_NAME);
    this.cfg = cfg;
  }

  private recordSpread(conditionId: string, spread: number): void {
    let history = this.spreadHistory.get(conditionId);
    if (!history) {
      history = [];
      this.spreadHistory.set(conditionId, history);
    }
    history.push(spread);
    if (history.length > this.cfg.spreadWindow) {
      history.splice(0, history.length - this.cfg.spreadWindow);
    }
  }

  private getSpreadHistory(conditionId: string): number[] {
    return this.spreadHistory.get(conditionId) ?? [];
  }

  private updateSpreadEmaState(conditionId: string, spread: number): number {
    const prev = this.spreadEmaState.get(conditionId) ?? null;
    const ema = updateSpreadEma(prev, spread, this.cfg.spreadEmaAlpha);
    this.spreadEmaState.set(conditionId, ema);
    return ema;
  }

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    for (const market of markets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (this.hasPosition(market.conditionId) || this.isOnCooldown(market.conditionId)) continue;
      if ((market.volume ?? 0) < this.cfg.minVolume) continue;

      try {
        const yesBook = await this.deps.clob.getOrderBook(market.yesTokenId);
        const yesBa = this.bestBidAsk(yesBook);
        if (yesBa.mid <= 0 || yesBa.mid >= 1) continue;

        let noMid: number;
        if (market.noTokenId) {
          const noBook = await this.deps.clob.getOrderBook(market.noTokenId);
          noMid = this.bestBidAsk(noBook).mid;
        } else {
          noMid = 1 - yesBa.mid;
        }
        if (noMid <= 0 || noMid >= 1) continue;

        const spread = calcSpread(yesBa.mid, noMid);
        const deviation = calcSpreadDeviation(spread);

        this.recordSpread(market.conditionId, spread);
        if (this.getSpreadHistory(market.conditionId).length < 2) continue;

        const spreadEma = this.updateSpreadEmaState(market.conditionId, spread);
        if (!isSpreadSignal(deviation, this.cfg.spreadThreshold)) continue;
        if (Math.abs(deviation) <= Math.abs(calcSpreadDeviation(spreadEma))) continue;

        const side = determineCheapSide(yesBa.mid, noMid);
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? yesBa.ask : (1 - yesBa.bid);
        const posSize = parseFloat(this.cfg.positionSize);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice, posSize);

        logger.info('Entry position', STRATEGY_NAME, {
          conditionId: market.conditionId,
          side,
          entryPrice: entryPrice.toFixed(4),
          spread: spread.toFixed(4),
          deviation: deviation.toFixed(4),
          spreadEma: spreadEma.toFixed(4),
          size: posSize.toFixed(2),
        });
      } catch (err) {
        logger.debug('Scan error', STRATEGY_NAME, { market: market.conditionId, err: String(err) });
      }
    }
  }
}

export interface SpreadMeanReversionDeps extends StrategyDeps {
  config?: Partial<SpreadMeanReversionConfig>;
}

export function createSpreadMeanReversionTick(deps: SpreadMeanReversionDeps): () => Promise<void> {
  const strategy = new SpreadMeanReversionStrategy(deps, deps.config);
  return strategy.toTickFn();
}
