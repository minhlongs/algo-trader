/**
 * Vol Compression Breakout V2 — extends BasePolymarketStrategy.
 *
 * Detects when realized volatility compresses to unusually low levels
 * (pre-breakout), then trades the initial breakout direction.
 * State machine: compressed → waiting → breakout detected → trade.
 *
 * Custom exit: failed breakout (price reverses back into compression range).
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { KellyPositionSizer } from '../../polymarket/kelly-position-sizer';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';

// ── Config ───────────────────────────────────────────────────────────────────

export interface VolCompressionConfig extends BaseStrategyConfig {
  shortVolWindow: number;
  longVolWindow: number;
  compressionThreshold: number;
  breakoutMultiplier: number;
  atrPeriod: number;
  sizeUsdc: number;
  scanLimit: number;
}

export const DEFAULT_CONFIG: VolCompressionConfig = {
  shortVolWindow: 10,
  longVolWindow: 40,
  compressionThreshold: 0.4,
  breakoutMultiplier: 2.5,
  atrPeriod: 10,
  sizeUsdc: 30,
  scanLimit: 15,
  minVolume: 0,
  takeProfitPct: 0.035,
  stopLossPct: 0.015,
  maxHoldMs: 12 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '30',
};

const STRATEGY_NAME: StrategyName = 'vol-compression-breakout';

// ── Internal types ───────────────────────────────────────────────────────────

interface CompressionEntry {
  compressed: boolean;
  compressedAt: number;
}

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function calcRealizedVol(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  if (returns.length === 0) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}

export function calcATR(prices: number[], period: number): number {
  if (prices.length < 2) return 0;
  const slice = prices.slice(-period - 1);
  if (slice.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < slice.length; i++) sum += Math.abs(slice[i] - slice[i - 1]);
  return sum / (slice.length - 1);
}

export function detectCompression(volShort: number, volLong: number, threshold: number): boolean {
  if (volLong <= 0) return false;
  return (volShort / volLong) < threshold;
}

export function detectBreakout(
  prices: number[], atr: number, multiplier: number,
): 'up' | 'down' | null {
  if (prices.length < 2 || atr <= 0) return null;
  const move = prices[prices.length - 1] - prices[prices.length - 2];
  if (move > multiplier * atr) return 'up';
  if (move < -(multiplier * atr)) return 'down';
  return null;
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class VolCompressionBreakoutStrategy extends BasePolymarketStrategy {
  private readonly cfg: VolCompressionConfig;
  private readonly kellySizer?: KellyPositionSizer;
  private readonly priceHistory = new Map<string, number[]>();
  private readonly compressionState = new Map<string, CompressionEntry>();
  /** Tracks the mid price at entry for failed-breakout exit detection. */
  private readonly compressionMids = new Map<string, number>();

  constructor(
    deps: StrategyDeps,
    config: Partial<VolCompressionConfig> = {},
    kellySizer?: KellyPositionSizer,
  ) {
    const fullConfig: VolCompressionConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
    this.kellySizer = kellySizer && typeof kellySizer.getSize === 'function' ? kellySizer : undefined;
  }

  private recordTick(tokenId: string, price: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) { history = []; this.priceHistory.set(tokenId, history); }
    history.push(price);
    const max = this.cfg.longVolWindow * 3;
    if (history.length > max) history.splice(0, history.length - max);
  }

  private getPrices(tokenId: string, count: number): number[] {
    return (this.priceHistory.get(tokenId) ?? []).slice(-count);
  }

  private getSize(): number {
    return this.kellySizer?.getSize(STRATEGY_NAME).size ?? parseFloat(this.cfg.positionSize);
  }

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    for (const market of markets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        this.recordTick(market.yesTokenId, ba.mid);

        const shortPrices = this.getPrices(market.yesTokenId, this.cfg.shortVolWindow);
        const longPrices = this.getPrices(market.yesTokenId, this.cfg.longVolWindow);
        if (shortPrices.length < this.cfg.shortVolWindow) continue;
        if (longPrices.length < this.cfg.longVolWindow) continue;

        const volShort = calcRealizedVol(shortPrices);
        const volLong = calcRealizedVol(longPrices);
        const isCompressed = detectCompression(volShort, volLong, this.cfg.compressionThreshold);
        const state = this.compressionState.get(market.yesTokenId);

        if (isCompressed && (!state || !state.compressed)) {
          this.compressionState.set(market.yesTokenId, { compressed: true, compressedAt: Date.now() });
          continue; // wait for breakout
        }

        if (!isCompressed && state?.compressed) {
          // Exited compression — check for breakout
          const atrPrices = this.getPrices(market.yesTokenId, this.cfg.atrPeriod + 1);
          const atr = calcATR(atrPrices, this.cfg.atrPeriod);
          const breakoutPrices = this.getPrices(market.yesTokenId, this.cfg.shortVolWindow);
          const breakoutDir = detectBreakout(breakoutPrices, atr, this.cfg.breakoutMultiplier);

          this.compressionState.set(market.yesTokenId, { compressed: false, compressedAt: 0 });
          if (!breakoutDir) continue;

          // Volume confirmation proxy
          if (market.volume24h !== undefined && market.volume !== undefined) {
            if (market.volume > 0 && (market.volume24h / market.volume) < 0.01) continue;
          }

          const side: 'yes' | 'no' = breakoutDir === 'up' ? 'yes' : 'no';
          const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
          const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

          await this.enterPosition(tokenId, market.conditionId, side, entryPrice, this.getSize());
          this.compressionMids.set(market.conditionId, ba.mid);

          logger.debug('Vol compression entry', this.strategyName, {
            conditionId: market.conditionId, side,
            entryPrice: entryPrice.toFixed(4),
            volRatio: (volShort / volLong).toFixed(4), breakoutDir,
          });
        }
        // If still compressed, keep waiting
      } catch (err) {
        logger.debug('Scan error', this.strategyName, { market: market.conditionId, err: String(err) });
      }
    }
  }

  async execute(): Promise<void> {
    try {
      await this.checkExits();
      await this.checkFailedBreakoutExits();
      const markets = await this.deps.gamma.getTrending(this.cfg.scanLimit);
      await this.scanEntries(markets);
      logger.debug('Tick complete', this.strategyName, {
        openPositions: this.positions.length,
        compressedMarkets: Array.from(this.compressionState.values()).filter(s => s.compressed).length,
      });
    } catch (err) {
      logger.error('Tick failed', this.strategyName, { err: String(err) });
    }
  }

  /** Check for failed breakout: price reversed back into compression range within 2 min of entry. */
  private async checkFailedBreakoutExits(): Promise<void> {
    const toRemove: number[] = [];
    const now = Date.now();

    for (let i = 0; i < this.positions.length; i++) {
      const pos = this.positions[i];
      const compressionMid = this.compressionMids.get(pos.conditionId);
      if (compressionMid === undefined || (now - pos.openedAt) >= 2 * 60_000) continue;

      try {
        const book = await this.deps.clob.getOrderBook(pos.tokenId);
        const currentPrice = this.bestBidAsk(book).mid;
        const movedBack = pos.side === 'yes'
          ? currentPrice <= compressionMid
          : currentPrice >= compressionMid;
        if (movedBack) {
          await this.exitPosition(pos, currentPrice, 'failed breakout (reversed into compression range)');
          toRemove.push(i);
        }
      } catch { /* skip */ }
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      const conditionId = this.positions[toRemove[i]].conditionId;
      this.compressionMids.delete(conditionId);
      this.positions.splice(toRemove[i], 1);
    }
  }
}

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface VolCompressionDeps extends StrategyDeps {
  kellySizer?: KellyPositionSizer;
  config?: Partial<VolCompressionConfig>;
}

export function createVolCompressionBreakoutTick(deps: VolCompressionDeps): () => Promise<void> {
  const { kellySizer, config, ...baseDeps } = deps;
  const strategy = new VolCompressionBreakoutStrategy(baseDeps, config, kellySizer);
  return strategy.toTickFn();
}
