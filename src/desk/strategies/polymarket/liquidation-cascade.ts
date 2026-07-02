/**
 * Liquidation Cascade Strategy — V2 implementation.
 *
 * Detects price cascades caused by large order book events (simulating
 * liquidations). Monitors rapid price moves with high volume absorption
 * and enters on overshoot, betting on mean reversion after the cascade.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { RawOrderBook } from '../../polymarket/clob-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';

// ── Config ───────────────────────────────────────────────────────────────────

export interface LiquidationCascadeConfig extends BaseStrategyConfig {
  /** Price move threshold (%) to detect a cascade event */
  cascadeMovePct: number;
  /** Volume absorption threshold: fraction of bid/ask depth consumed */
  volumeAbsorptionThreshold: number;
  /** Cooldown after cascade detection (ms) before entering */
  cascadeCooldownMs: number;
  /** Minimum market volume */
  minVolume: number;
  /** Base position size */
  baseSizeUsdc: number;
  /** Markets to scan */
  scanLimit: number;
  /** Window (ticks) for price acceleration calculation */
  accelWindow: number;
}

export const DEFAULT_CONFIG: LiquidationCascadeConfig = {
  cascadeMovePct: 0.03,
  volumeAbsorptionThreshold: 0.5,
  cascadeCooldownMs: 30_000,
  minVolume: 1000,
  baseSizeUsdc: 30,
  scanLimit: 15,
  accelWindow: 3,
  takeProfitPct: 0.025,
  stopLossPct: 0.035,
  maxHoldMs: 5 * 60_000,
  maxPositions: 1,
  cooldownMs: 180_000,
  positionSize: '30',
};

const STRATEGY_NAME: StrategyName = 'liquidation-cascade';

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Compute percentage price change between two prices.
 */
export function calcPriceChangePct(prev: number, curr: number): number {
  if (prev <= 0) return 0;
  return (curr - prev) / prev;
}

/**
 * Estimate volume absorbed during a cascade by comparing book depth.
 * Returns fraction of the thinner side that was consumed.
 */
export function calcVolumeAbsorption(
  prevBook: RawOrderBook,
  currBook: RawOrderBook,
  direction: 'up' | 'down',
): number {
  if (direction === 'down') {
    // Price fell: bids were consumed (buy-side liquidations)
    const prevBidDepth = prevBook.bids.slice(0, 5).reduce((s, l) => s + parseFloat(l.size), 0);
    const currBidDepth = currBook.bids.slice(0, 5).reduce((s, l) => s + parseFloat(l.size), 0);
    const consumed = prevBidDepth - currBidDepth;
    return prevBidDepth > 0 ? Math.max(0, consumed / prevBidDepth) : 0;
  } else {
    // Price rose: asks were consumed (sell-side liquidations)
    const prevAskDepth = prevBook.asks.slice(0, 5).reduce((s, l) => s + parseFloat(l.size), 0);
    const currAskDepth = currBook.asks.slice(0, 5).reduce((s, l) => s + parseFloat(l.size), 0);
    const consumed = prevAskDepth - currAskDepth;
    return prevAskDepth > 0 ? Math.max(0, consumed / prevAskDepth) : 0;
  }
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class LiquidationCascadeStrategy extends BasePolymarketStrategy {
  private readonly cfg: LiquidationCascadeConfig;
  private readonly prevBooks = new Map<string, RawOrderBook>();
  private readonly priceHistory = new Map<string, number[]>();
  private readonly cascadeTimestamps = new Map<string, number>();

  constructor(deps: StrategyDeps, config: Partial<LiquidationCascadeConfig> = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordPrice(tokenId: string, price: number): void {
    let h = this.priceHistory.get(tokenId);
    if (!h) { h = []; this.priceHistory.set(tokenId, h); }
    h.push(price);
    if (h.length > this.cfg.accelWindow * 5) h.splice(0, h.length - this.cfg.accelWindow * 5);
  }

  private wasRecentCascade(tokenId: string): boolean {
    const ts = this.cascadeTimestamps.get(tokenId) ?? 0;
    return Date.now() - ts < this.cfg.cascadeCooldownMs;
  }

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    for (const market of markets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;
      if (market.volume < this.cfg.minVolume) continue;

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        this.recordPrice(market.yesTokenId, ba.mid);
        const prevBook = this.prevBooks.get(market.yesTokenId);

        if (!prevBook) {
          this.prevBooks.set(market.yesTokenId, book);
          continue;
        }

        const prevPrice = this.bestBidAsk(prevBook).mid;
        const priceChange = calcPriceChangePct(prevPrice, ba.mid);

        // Need minimum price move to consider cascade
        if (Math.abs(priceChange) < this.cfg.cascadeMovePct) {
          this.prevBooks.set(market.yesTokenId, book);
          continue;
        }

        const direction = priceChange > 0 ? 'up' : 'down';
        const absorption = calcVolumeAbsorption(prevBook, book, direction);

        // Accelerating price (checking recent history for acceleration)
        const prices = this.priceHistory.get(market.yesTokenId) ?? [];
        let acceleration = 0;
        if (prices.length >= this.cfg.accelWindow + 1) {
          const recent = prices.slice(-this.cfg.accelWindow);
          const changes = recent.slice(1).map((p, i) => calcPriceChangePct(recent[i]!, p));
          acceleration = changes.length > 0
            ? changes.reduce((s, c) => s + Math.abs(c), 0) / changes.length
            : 0;
        }

        const isCascade = absorption >= this.cfg.volumeAbsorptionThreshold
          || acceleration > this.cfg.cascadeMovePct * 1.5;

        if (!isCascade) {
          this.prevBooks.set(market.yesTokenId, book);
          continue;
        }

        this.cascadeTimestamps.set(market.yesTokenId, Date.now());
        logger.info('Cascade detected', STRATEGY_NAME, {
          conditionId: market.conditionId,
          direction, priceChangePct: (priceChange * 100).toFixed(2),
          absorption: (absorption * 100).toFixed(1),
          acceleration: (acceleration * 100).toFixed(2),
        });

        // Wait for cascade cooldown before entering (let the dust settle)
        if (this.wasRecentCascade(market.yesTokenId)) continue;

        // Enter mean-reversion: if cascade was down, bet yes; if up, bet no
        const side = direction === 'down' ? 'yes' : 'no';
        if (side === 'no' && !market.noTokenId) continue;

        const tokenId = side === 'yes' ? market.yesTokenId : market.noTokenId!;
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice, this.cfg.baseSizeUsdc);

        logger.debug('Cascade reversion entry', STRATEGY_NAME, {
          conditionId: market.conditionId, side,
          priceChangePct: (priceChange * 100).toFixed(2),
          absorption: (absorption * 100).toFixed(1),
        });

        this.prevBooks.set(market.yesTokenId, book);
      } catch (err) {
        logger.debug('Scan error', STRATEGY_NAME, { market: market.conditionId, err: String(err) });
      }
    }
  }

  async execute(): Promise<void> {
    try {
      await this.checkExits();
      const markets = await this.deps.gamma.getTrending(this.cfg.scanLimit);
      await this.scanEntries(markets);
      logger.debug('Tick complete', STRATEGY_NAME, {
        openPositions: this.positions.length,
        trackedMarkets: this.prevBooks.size,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  }
}

// ── Legacy factory ───────────────────────────────────────────────────────────

export function createLiquidationCascadeTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new LiquidationCascadeStrategy(deps);
  return strategy.toTickFn();
}
