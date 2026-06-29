// SPDX-License-Identifier: MIT
/**
 * VWAP Deviation Sniper strategy for Polymarket binary markets.
 *
 * Detects significant price deviations from the Volume-Weighted Average Price (VWAP)
 * and trades mean reversion. When price deviates more than N standard deviations
 * from VWAP, it's considered oversold (below) or overbought (above) and the strategy
 * takes the opposite position anticipating reversion to fair value.
 *
 * Signal logic:
 *   1. Track rolling window of prices and volumes
 *   2. Calculate VWAP = Σ(price × volume) / Σ(volume)
 *   3. Calculate rolling mean and std dev of prices (or VWAP values)
 *   4. Compute z-score = (currentPrice - mean) / stdDev
 *   5. If z-score < -threshold → oversold → BUY YES
 *   6. If z-score > threshold → overbought → BUY NO
 *   7. Exit when price reverts to mean (|z-score| < exitThreshold) or TP/SL hit
 */

import type { ClobClient, RawOrderBook } from '../../../polymarket/clob-client.js';
import type { OrderManager } from '../../../polymarket/order-manager.js';
import type { EventBus } from '../../../events/event-bus.js';
import type { GammaClient, GammaMarket } from '../../../polymarket/gamma-client.js';
import type { StrategyName } from '../../../core/types.js';
import { logger } from '../../../core/logger.js';

// ── Config ───────────────────────────────────────────────────────────────────

export interface VwapDeviationSniperConfig {
  /** VWAP calculation window (number of price/volume snapshots) */
  vwapWindow: number;
  /** Minimum periods required before generating signal */
  minPeriods: number;
  /** Z-score threshold for entry (e.g., 2.0 = 2 std devs) */
  deviationThreshold: number;
  /** Z-score threshold for exit (e.g., 0.5 = close to mean) */
  exitThreshold: number;
  /** Minimum market volume (USDC) to consider */
  minVolume: number;
  /** Take-profit as fraction (0.03 = 3%) */
  takeProfitPct: number;
  /** Stop-loss as fraction (0.02 = 2%) */
  stopLossPct: number;
  /** Max hold time in ms before forced exit */
  maxHoldMs: number;
  /** Max concurrent positions */
  maxPositions: number;
  /** Per-market cooldown after exit (ms) */
  cooldownMs: number;
  /** Base trade size in USDC */
  positionSize: string;
}

export const DEFAULT_CONFIG: VwapDeviationSniperConfig = {
  vwapWindow: 20,
  minPeriods: 10,
  deviationThreshold: 2.0,
  exitThreshold: 0.5,
  minVolume: 5000,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 20 * 60_000, // 20 minutes
  maxPositions: 4,
  cooldownMs: 120_000, // 2 minutes
  positionSize: '12',
};

const STRATEGY_NAME: StrategyName = 'vwap-deviation-sniper';

// ── Internal types ───────────────────────────────────────────────────────────

interface OpenPosition {
  tokenId: string;
  conditionId: string;
  side: 'yes' | 'no';
  entryPrice: number;
  sizeUsdc: number;
  orderId: string;
  openedAt: number;
}

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/**
 * Calculate Volume-Weighted Average Price.
 * VWAP = Σ(price × volume) / Σ(volume)
 * Returns 0 if insufficient data or zero total volume.
 */
export function calcVWAP(prices: number[], volumes: number[]): number {
  if (prices.length === 0 || volumes.length === 0) return 0;
  if (prices.length !== volumes.length) return 0;

  let sumPV = 0;
  let sumV = 0;

  for (let i = 0; i < prices.length; i++) {
    const price = prices[i];
    const volume = volumes[i];
    if (volume <= 0) continue; // skip zero/negative volume
    sumPV += price * volume;
    sumV += volume;
  }

  if (sumV === 0) return 0;
  return sumPV / sumV;
}

/**
 * Calculate price deviation from VWAP.
 * deviation = (price - vwap) / vwap
 * Returns 0 if vwap is 0.
 */
export function calcDeviation(price: number, vwap: number): number {
  if (vwap === 0) return 0;
  return (price - vwap) / vwap;
}

/**
 * Calculate population standard deviation.
 * stdDev = sqrt(Σ(x - mean)² / n)
 * Returns 0 if insufficient data.
 */
export function calcStdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  let sumSq = 0;
  for (const x of values) {
    const diff = x - mean;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / values.length);
}

/**
 * Calculate z-score of a value given a historical series.
 * z = (value - mean(history)) / stdDev(history)
 * Returns 0 if stdDev is 0 or insufficient history.
 */
export function calcZScore(value: number, history: number[]): number {
  if (history.length < 2) return 0;
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const stdDev = calcStdDev(history, mean);
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

/**
 * Determine trading signal based on z-score and threshold.
 * - z-score < -threshold → oversold → 'yes'
 * - z-score > threshold → overbought → 'no'
 * - otherwise → null (no trade)
 */
export function determineSignal(
  zScore: number,
  threshold: number,
): 'yes' | 'no' | null {
  if (zScore < -threshold) return 'yes';
  if (zScore > threshold) return 'no';
  return null;
}

/** Extract best bid/ask/mid from raw order book. */
function bestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } {
  const bid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
  const ask = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
  return { bid, ask, mid: (bid + ask) / 2 };
}

/**
 * Estimate volume from orderbook depth (sum of top N levels).
 * Used as proxy when market volume data is insufficient.
 */
function estimateDepthVolume(book: RawOrderBook, levels: number = 10): number {
  let volume = 0;
  const limit = Math.min(levels, book.bids.length, book.asks.length);
  for (let i = 0; i < limit; i++) {
    volume += parseFloat(book.bids[i].size) + parseFloat(book.asks[i].size);
  }
  return volume;
}

// ── Dependencies ─────────────────────────────────────────────────────────────

export interface VwapDeviationSniperDeps {
  clob: ClobClient;
  orderManager: OrderManager;
  eventBus: EventBus;
  gamma: GammaClient;
  config?: Partial<VwapDeviationSniperConfig>;
}

// ── Tick factory ─────────────────────────────────────────────────────────────

export function createVwapDeviationSniperTick(
  deps: VwapDeviationSniperDeps,
): () => Promise<void> {
  const { clob, orderManager, eventBus, gamma } = deps;
  const cfg: VwapDeviationSniperConfig = {
    ...DEFAULT_CONFIG,
    ...deps.config,
  };

  // Per-market state
  const priceHistory = new Map<string, number[]>();
  const volumeHistory = new Map<string, number[]>();
  const positions: OpenPosition[] = [];
  const cooldowns = new Map<string, number>();

  // ── Helpers ──────────────────────────────────────────────────────────────

  function recordPriceVolume(tokenId: string, price: number, volume: number): void {
    let prices = priceHistory.get(tokenId);
    let volumes = volumeHistory.get(tokenId);

    if (!prices || !volumes) {
      if (!prices) {
        prices = [];
        priceHistory.set(tokenId, prices);
      }
      if (!volumes) {
        volumes = [];
        volumeHistory.set(tokenId, volumes);
      }
    }

    prices.push(price);
    volumes.push(volume);

    // Keep only vwapWindow snapshots
    if (prices.length > cfg.vwapWindow) {
      prices.splice(0, prices.length - cfg.vwapWindow);
      volumes!.splice(0, volumes!.length - cfg.vwapWindow);
    }
  }

  function getPrices(tokenId: string): number[] {
    return priceHistory.get(tokenId) ?? [];
  }

  function getVolumes(tokenId: string): number[] {
    return volumeHistory.get(tokenId) ?? [];
  }

  function isOnCooldown(tokenId: string): boolean {
    const until = cooldowns.get(tokenId) ?? 0;
    return Date.now() < until;
  }

  function hasPosition(tokenId: string): boolean {
    return positions.some(p => p.tokenId === tokenId);
  }

  // ── Exit logic ───────────────────────────────────────────────────────────

  async function checkExits(): Promise<void> {
    const now = Date.now();
    const toRemove: number[] = [];

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      let shouldExit = false;
      let reason = '';

      // Get current price from orderbook
      let currentPrice: number;
      try {
        const book = await clob.getOrderBook(pos.tokenId);
        const ba = bestBidAsk(book);
        currentPrice = ba.mid;
      } catch {
        continue; // skip if can't fetch
      }

      // Get latest VWAP for this token
      const prices = getPrices(pos.tokenId);
      const volumes = getVolumes(pos.tokenId);
      if (prices.length === 0) continue;

      const vwap = calcVWAP(prices, volumes);
      const deviation = calcDeviation(currentPrice, vwap);

      // Take profit / Stop loss (based on entryPrice)
      if (pos.side === 'yes') {
        const gain = (currentPrice - pos.entryPrice) / pos.entryPrice;
        if (gain >= cfg.takeProfitPct) {
          shouldExit = true;
          reason = `take-profit (${(gain * 100).toFixed(2)}%)`;
        } else if (-gain >= cfg.stopLossPct) {
          shouldExit = true;
          reason = `stop-loss (${(gain * 100).toFixed(2)}%)`;
        }
      } else {
        const gain = (pos.entryPrice - currentPrice) / pos.entryPrice;
        if (gain >= cfg.takeProfitPct) {
          shouldExit = true;
          reason = `take-profit (${(gain * 100).toFixed(2)}%)`;
        } else if (-gain >= cfg.stopLossPct) {
          shouldExit = true;
          reason = `stop-loss (${(gain * 100).toFixed(2)}%)`;
        }
      }

      // Mean reversion exit: |deviation| < exitThreshold
      if (!shouldExit && vwap > 0 && Math.abs(deviation) < cfg.exitThreshold) {
        shouldExit = true;
        reason = `mean reversion (deviation: ${deviation.toFixed(4)})`;
      }

      // Max hold time
      if (!shouldExit && now - pos.openedAt > cfg.maxHoldMs) {
        shouldExit = true;
        reason = 'max hold time';
      }

      if (shouldExit) {
        try {
          const exitSide = pos.side === 'yes' ? 'sell' : 'buy';
          await orderManager.placeOrder({
            tokenId: pos.tokenId,
            side: exitSide,
            price: currentPrice.toFixed(4),
            size: String(Math.round(pos.sizeUsdc / currentPrice)),
            orderType: 'IOC',
          });

          const pnl = pos.side === 'yes'
            ? (currentPrice - pos.entryPrice) * (pos.sizeUsdc / pos.entryPrice)
            : (pos.entryPrice - currentPrice) * (pos.sizeUsdc / pos.entryPrice);

          logger.info('Exit position', STRATEGY_NAME, {
            conditionId: pos.conditionId,
            side: pos.side,
            pnl: pnl.toFixed(4),
            reason,
            deviation: deviation.toFixed(4),
            vwap: vwap.toFixed(4),
          });

          eventBus.emit('trade.executed', {
            trade: {
              orderId: pos.orderId,
              marketId: pos.conditionId,
              side: exitSide,
              fillPrice: String(currentPrice),
              fillSize: String(pos.sizeUsdc),
              fees: '0',
              timestamp: Date.now(),
              strategy: STRATEGY_NAME,
            },
          });

          cooldowns.set(pos.tokenId, now + cfg.cooldownMs);
          toRemove.push(i);
        } catch (err) {
          logger.warn('Exit failed', STRATEGY_NAME, {
            tokenId: pos.tokenId,
            err: String(err),
          });
        }
      }
    }

    // Remove closed positions (reverse order)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      positions.splice(toRemove[i], 1);
    }
  }

  // ── Entry logic ──────────────────────────────────────────────────────────

  async function scanEntries(markets: GammaMarket[]): Promise<void> {
    if (positions.length >= cfg.maxPositions) return;

    for (const market of markets) {
      if (positions.length >= cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (hasPosition(market.yesTokenId)) continue;
      if (market.noTokenId && hasPosition(market.noTokenId)) continue;
      if (isOnCooldown(market.yesTokenId)) continue;

      // Check minimum volume
      if ((market.volume ?? 0) < cfg.minVolume) continue;

      try {
        // Fetch orderbook for YES token
        const book = await clob.getOrderBook(market.yesTokenId);
        const ba = bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        // Estimate volume from orderbook depth as proxy for recent activity
        const depthVolume = estimateDepthVolume(book, 10);
        const volume = Math.max(market.volume ?? 0, depthVolume);

        // Record price and volume snapshot
        recordPriceVolume(market.yesTokenId, ba.mid, volume);
        const prices = getPrices(market.yesTokenId);
        const volumes = getVolumes(market.yesTokenId);

        // Need enough data for meaningful statistics
        if (prices.length < cfg.minPeriods) continue;

        // Calculate VWAP
        const vwap = calcVWAP(prices, volumes);
        if (vwap === 0) continue;

        // Calculate z-score of current price relative to price history
        const zScore = calcZScore(ba.mid, prices);

        // Check if deviation exceeds threshold
        const signal = determineSignal(zScore, cfg.deviationThreshold);
        if (signal === null) continue;

        // Determine token and side
        const side: 'yes' | 'no' = signal;
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        // Validate entry price is reasonable
        if (entryPrice <= 0 || entryPrice >= 1) continue;

        const posSize = parseFloat(cfg.positionSize);

        // Place order
        const order = await orderManager.placeOrder({
          tokenId,
          side: 'buy',
          price: entryPrice.toFixed(4),
          size: String(Math.round(posSize / entryPrice)),
          orderType: 'GTC',
        });

        positions.push({
          tokenId,
          conditionId: market.conditionId,
          side,
          entryPrice,
          sizeUsdc: posSize,
          orderId: order.id,
          openedAt: Date.now(),
        });

        logger.info('Entry position', STRATEGY_NAME, {
          conditionId: market.conditionId,
          side,
          entryPrice: entryPrice.toFixed(4),
          vwap: vwap.toFixed(4),
          deviation: calcDeviation(ba.mid, vwap).toFixed(4),
          zScore: zScore.toFixed(4),
          size: posSize.toFixed(2),
        });

        eventBus.emit('trade.executed', {
          trade: {
            orderId: order.id,
            marketId: market.conditionId,
            side: 'buy',
            fillPrice: String(entryPrice),
            fillSize: String(posSize),
            fees: '0',
            timestamp: Date.now(),
            strategy: STRATEGY_NAME,
          },
        });
      } catch (err) {
        logger.debug('Scan error', STRATEGY_NAME, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }

  // ── Main tick ────────────────────────────────────────────────────────────

  return async function vwapDeviationSniperTick(): Promise<void> {
    try {
      // 1. Check exits first
      await checkExits();

      // 2. Discover trending markets
      const markets = await gamma.getTrending(15);

      // 3. Scan for entries
      await scanEntries(markets);

      logger.debug('Tick complete', STRATEGY_NAME, {
        openPositions: positions.length,
        trackedMarkets: priceHistory.size,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  };
}
