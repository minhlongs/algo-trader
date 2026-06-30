/**
 * Information Asymmetry Scanner V2 — extends BasePolymarketStrategy.
 *
 * Detects informed trading by tracking depth depletion rates on each
 * side of the order book. When one side depletes significantly faster
 * than the other, informed traders may have private information.
 * Trades in the direction of the aggressive side.
 *
 * Asks depleting faster → buyers aggressive → BUY YES.
 * Bids depleting faster → sellers aggressive → BUY NO.
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

export interface InfoAsymmetryScannerConfig extends BaseStrategyConfig {
  asymmetryThreshold: number;
  depthWindow: number;
  minDepletionRate: number;
}

export const DEFAULT_CONFIG: InfoAsymmetryScannerConfig = {
  asymmetryThreshold: 0.3,
  depthWindow: 10,
  minDepletionRate: 0.01,
  minVolume: 5000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 12 * 60_000,
  maxPositions: 5,
  cooldownMs: 90_000,
  positionSize: '10',
};

const STRATEGY_NAME = 'info-asymmetry-scanner' as StrategyName;

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function calcTotalDepth(levels: { price: string; size: string }[]): number {
  let total = 0;
  for (const level of levels) total += parseFloat(level.size);
  return total;
}

export function calcDepletionRate(depthHistory: number[]): number {
  if (depthHistory.length < 2) return 0;
  const first = depthHistory[0];
  if (first === 0) return 0;
  const last = depthHistory[depthHistory.length - 1];
  return (first - last) / first;
}

export function calcAsymmetryScore(bidDepletion: number, askDepletion: number): number {
  const sum = bidDepletion + askDepletion;
  if (sum === 0) return 0;
  return (bidDepletion - askDepletion) / sum;
}

export function isInformedFlow(
  asymmetry: number, totalDepletion: number, threshold: number, minDepletion: number,
): boolean {
  return Math.abs(asymmetry) > threshold && totalDepletion > minDepletion;
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class InfoAsymmetryScannerStrategy extends BasePolymarketStrategy {
  private readonly cfg: InfoAsymmetryScannerConfig;
  private readonly bidDepthHistory = new Map<string, number[]>();
  private readonly askDepthHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<InfoAsymmetryScannerConfig> = {}) {
    const fullConfig: InfoAsymmetryScannerConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordDepth(tokenId: string, bidDepth: number, askDepth: number): void {
    let bidHist = this.bidDepthHistory.get(tokenId);
    if (!bidHist) { bidHist = []; this.bidDepthHistory.set(tokenId, bidHist); }
    bidHist.push(bidDepth);
    if (bidHist.length > this.cfg.depthWindow) {
      bidHist.splice(0, bidHist.length - this.cfg.depthWindow);
    }

    let askHist = this.askDepthHistory.get(tokenId);
    if (!askHist) { askHist = []; this.askDepthHistory.set(tokenId, askHist); }
    askHist.push(askDepth);
    if (askHist.length > this.cfg.depthWindow) {
      askHist.splice(0, askHist.length - this.cfg.depthWindow);
    }
  }

  private getBidHistory(tokenId: string): number[] {
    return this.bidDepthHistory.get(tokenId) ?? [];
  }

  private getAskHistory(tokenId: string): number[] {
    return this.askDepthHistory.get(tokenId) ?? [];
  }

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    for (const market of markets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;
      if ((market.volume ?? 0) < this.cfg.minVolume) continue;

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        const bidDepth = calcTotalDepth(book.bids);
        const askDepth = calcTotalDepth(book.asks);

        this.recordDepth(market.yesTokenId, bidDepth, askDepth);

        const bidHist = this.getBidHistory(market.yesTokenId);
        const askHist = this.getAskHistory(market.yesTokenId);
        if (bidHist.length < 2) continue;

        const bidDepletion = calcDepletionRate(bidHist);
        const askDepletion = calcDepletionRate(askHist);
        const asymmetry = calcAsymmetryScore(bidDepletion, askDepletion);
        const totalDepletion = Math.abs(bidDepletion) + Math.abs(askDepletion);

        if (!isInformedFlow(asymmetry, totalDepletion, this.cfg.asymmetryThreshold, this.cfg.minDepletionRate)) continue;

        // Positive asymmetry (asks depleting faster) → buyers aggressive → BUY YES
        const side: 'yes' | 'no' = asymmetry > 0 ? 'yes' : 'no';
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice,
          parseFloat(this.cfg.positionSize));

        logger.debug('Info asymmetry entry', this.strategyName, {
          conditionId: market.conditionId, side,
          entryPrice: entryPrice.toFixed(4),
          asymmetry: asymmetry.toFixed(4),
          bidDepletion: bidDepletion.toFixed(4),
          askDepletion: askDepletion.toFixed(4),
        });
      } catch (err) {
        logger.debug('Scan error', this.strategyName, {
          market: market.conditionId, err: String(err),
        });
      }
    }
  }
}

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface InfoAsymmetryScannerDeps extends StrategyDeps {
  config?: Partial<InfoAsymmetryScannerConfig>;
}

export function createInfoAsymmetryScannerTick(
  deps: InfoAsymmetryScannerDeps,
): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new InfoAsymmetryScannerStrategy(baseDeps, config);
  return strategy.toTickFn();
}
