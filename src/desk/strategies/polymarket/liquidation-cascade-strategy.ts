/**
 * Concrete strategy class and tick factory for Liquidation Cascade.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { RawOrderBook } from '../../polymarket/clob-client';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  LiquidationCascadeConfig,
  DEFAULT_CONFIG,
  STRATEGY_NAME,
} from './liquidation-cascade-types';
import {
  calcPriceChangePct,
  calcVolumeAbsorption,
} from './liquidation-cascade-math';

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

export function createLiquidationCascadeTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new LiquidationCascadeStrategy(deps);
  return strategy.toTickFn();
}
