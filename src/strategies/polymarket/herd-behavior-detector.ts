/**
 * Herd Behavior Detector strategy for Polymarket binary markets.
 *
 * Detects herd behavior by measuring the correlation of price movements across
 * multiple unrelated markets. When many unrelated markets move in the same
 * direction simultaneously, it signals panic/euphoria-driven herding. Fades the
 * herd by trading against the crowd once herding peaks.
 *
 * Signal logic:
 *   1. Track price returns across multiple markets
 *   2. Calculate average pairwise correlation of recent returns
 *   3. When avg correlation > herdThreshold -> herding detected
 *   4. Track herding intensity over time with EMA
 *   5. When herding peaks (current < prev) -> fade: trade against the herd direction
 *   6. Herd moving prices up -> BUY NO, herd moving prices down -> BUY YES
 *
 * Pure math helpers live in ./herd-behavior-math-helpers.ts
 */
import type { ClobClient, RawOrderBook } from '../../polymarket/clob-client.js';
import type { OrderManager } from '../../polymarket/order-manager.js';
import type { EventBus } from '../../events/event-bus.js';
import type { GammaClient, GammaMarket } from '../../polymarket/gamma-client.js';
import type { StrategyName } from '../../core/types.js';
import { logger } from '../../core/logger.js';
import {
  calcReturn,
  calcAvgPairwiseCorrelation,
  detectHerdPeak,
  calcHerdDirection,
  updateEma,
} from './herd-behavior-math-helpers.js';

// Re-export pure helpers so existing test imports remain valid
export { calcReturn, calcPearsonR, calcAvgPairwiseCorrelation, detectHerdPeak, calcHerdDirection } from './herd-behavior-math-helpers.js';

// -- Config -------------------------------------------------------------------

export interface HerdBehaviorDetectorConfig {
  /** Minimum avg correlation to consider herding */
  herdThreshold: number;
  /** Number of price snapshots for return calculation */
  returnWindow: number;
  /** Alpha for herd intensity EMA */
  herdEmaAlpha: number;
  /** Minimum number of markets needed for correlation */
  minMarkets: number;
  /** Minimum market volume (USDC) to consider */
  minVolume: number;
  /** Take-profit as fraction (0.025 = 2.5%) */
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

export const DEFAULT_CONFIG: HerdBehaviorDetectorConfig = {
  herdThreshold: 0.6,
  returnWindow: 10,
  herdEmaAlpha: 0.15,
  minMarkets: 5,
  minVolume: 5000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 15 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '10',
};

const STRATEGY_NAME = 'herd-behavior-detector' as StrategyName;

// -- Internal types -----------------------------------------------------------

interface OpenPosition {
  tokenId: string;
  conditionId: string;
  side: 'yes' | 'no';
  entryPrice: number;
  sizeUsdc: number;
  orderId: string;
  openedAt: number;
}

// -- Local helpers ------------------------------------------------------------

/** Extract best bid/ask/mid from raw order book. */
function bestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } {
  const bid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
  const ask = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
  return { bid, ask, mid: (bid + ask) / 2 };
}

// -- Dependencies -------------------------------------------------------------

export interface HerdBehaviorDetectorDeps {
  clob: ClobClient;
  orderManager: OrderManager;
  eventBus: EventBus;
  gamma: GammaClient;
  config?: Partial<HerdBehaviorDetectorConfig>;
}

// -- Tick factory -------------------------------------------------------------

export function createHerdBehaviorDetectorTick(deps: HerdBehaviorDetectorDeps): () => Promise<void> {
  const { clob, orderManager, eventBus, gamma } = deps;
  const cfg: HerdBehaviorDetectorConfig = { ...DEFAULT_CONFIG, ...deps.config };

  // Per-market state
  const priceHistory = new Map<string, number[]>();
  const positions: OpenPosition[] = [];
  const cooldowns = new Map<string, number>();

  // Global herd state
  let prevHerdEma: number | null = null;
  let currentHerdEma: number | null = null;

  // -- State helpers ----------------------------------------------------------

  function recordPrice(tokenId: string, price: number): void {
    let history = priceHistory.get(tokenId);
    if (!history) {
      history = [];
      priceHistory.set(tokenId, history);
    }
    history.push(price);
    if (history.length > cfg.returnWindow + 1) {
      history.splice(0, history.length - (cfg.returnWindow + 1));
    }
  }

  function getPrices(tokenId: string): number[] {
    return priceHistory.get(tokenId) ?? [];
  }

  function isOnCooldown(tokenId: string): boolean {
    return Date.now() < (cooldowns.get(tokenId) ?? 0);
  }

  function hasPosition(tokenId: string): boolean {
    return positions.some(p => p.tokenId === tokenId);
  }

  // -- Exit logic -------------------------------------------------------------

  async function checkExits(): Promise<void> {
    const now = Date.now();
    const toRemove: number[] = [];

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      let shouldExit = false;
      let reason = '';

      let currentPrice: number;
      try {
        const book = await clob.getOrderBook(pos.tokenId);
        currentPrice = bestBidAsk(book).mid;
      } catch {
        continue; // skip if price unavailable
      }

      if (pos.side === 'yes') {
        const gain = (currentPrice - pos.entryPrice) / pos.entryPrice;
        if (gain >= cfg.takeProfitPct) { shouldExit = true; reason = `take-profit (${(gain * 100).toFixed(2)}%)`; }
        else if (-gain >= cfg.stopLossPct) { shouldExit = true; reason = `stop-loss (${(gain * 100).toFixed(2)}%)`; }
      } else {
        const gain = (pos.entryPrice - currentPrice) / pos.entryPrice;
        if (gain >= cfg.takeProfitPct) { shouldExit = true; reason = `take-profit (${(gain * 100).toFixed(2)}%)`; }
        else if (-gain >= cfg.stopLossPct) { shouldExit = true; reason = `stop-loss (${(gain * 100).toFixed(2)}%)`; }
      }

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
          logger.warn('Exit failed', STRATEGY_NAME, { tokenId: pos.tokenId, err: String(err) });
        }
      }
    }

    // Remove closed positions in reverse order to preserve indices
    for (let i = toRemove.length - 1; i >= 0; i--) {
      positions.splice(toRemove[i], 1);
    }
  }

  // -- Entry logic ------------------------------------------------------------

  async function scanEntries(markets: GammaMarket[]): Promise<void> {
    if (positions.length >= cfg.maxPositions) return;

    // 1. Collect prices for all valid markets
    const validMarkets: GammaMarket[] = [];

    for (const market of markets) {
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if ((market.volume ?? 0) < cfg.minVolume) continue;

      try {
        const book = await clob.getOrderBook(market.yesTokenId);
        const ba = bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        recordPrice(market.yesTokenId, ba.mid);
        validMarkets.push(market);
      } catch (err) {
        logger.debug('Fetch error', STRATEGY_NAME, { market: market.conditionId, err: String(err) });
      }
    }

    if (validMarkets.length < cfg.minMarkets) return;

    // 2. Build return series for each market
    const returnSeries: number[][] = [];
    const marketReturns: { market: GammaMarket; ret: number }[] = [];

    for (const market of validMarkets) {
      const prices = getPrices(market.yesTokenId!);
      if (prices.length < 2) continue;

      const returns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        returns.push(prices[i - 1] === 0 ? 0 : (prices[i] - prices[i - 1]) / prices[i - 1]);
      }
      if (returns.length > 0) {
        returnSeries.push(returns);
        marketReturns.push({ market, ret: calcReturn(prices) });
      }
    }

    // 3. Calculate avg pairwise correlation and update herd EMA
    const avgCorr = calcAvgPairwiseCorrelation(returnSeries);
    prevHerdEma = currentHerdEma;
    currentHerdEma = updateEma(currentHerdEma, avgCorr, cfg.herdEmaAlpha);

    if (prevHerdEma === null || currentHerdEma === null) return;
    if (!detectHerdPeak(prevHerdEma, currentHerdEma, cfg.herdThreshold)) return;

    // 4. Fade the herd: trade against crowd direction
    const direction = calcHerdDirection(marketReturns.map(mr => mr.ret));
    if (direction === 'flat') return;

    const fadeSide: 'yes' | 'no' = direction === 'up' ? 'no' : 'yes';

    // 5. Enter positions on the most extreme movers
    for (const { market } of marketReturns) {
      if (positions.length >= cfg.maxPositions) break;
      if (!market.yesTokenId) continue;
      if (hasPosition(market.yesTokenId)) continue;
      if (market.noTokenId && hasPosition(market.noTokenId)) continue;
      if (isOnCooldown(market.yesTokenId)) continue;

      const prices = getPrices(market.yesTokenId);
      if (prices.length === 0) continue;
      const currentMid = prices[prices.length - 1];

      const tokenId = fadeSide === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
      const entryPrice = fadeSide === 'yes' ? currentMid : (1 - currentMid);
      if (entryPrice <= 0 || entryPrice >= 1) continue;

      try {
        const posSize = parseFloat(cfg.positionSize);
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
          side: fadeSide,
          entryPrice,
          sizeUsdc: posSize,
          orderId: order.id,
          openedAt: Date.now(),
        });

        logger.info('Entry position', STRATEGY_NAME, {
          conditionId: market.conditionId,
          side: fadeSide,
          entryPrice: entryPrice.toFixed(4),
          avgCorrelation: avgCorr.toFixed(4),
          herdEma: currentHerdEma.toFixed(4),
          direction,
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
        logger.debug('Entry error', STRATEGY_NAME, { market: market.conditionId, err: String(err) });
      }
    }
  }

  // -- Main tick --------------------------------------------------------------

  return async function herdBehaviorDetectorTick(): Promise<void> {
    try {
      await checkExits();
      const markets = await gamma.getTrending(15);
      await scanEntries(markets);

      logger.debug('Tick complete', STRATEGY_NAME, {
        openPositions: positions.length,
        trackedMarkets: priceHistory.size,
        herdEma: currentHerdEma?.toFixed(4) ?? 'n/a',
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  };
}
