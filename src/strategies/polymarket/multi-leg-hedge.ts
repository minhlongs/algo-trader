/**
 * Multi-Leg Hedge strategy for Polymarket event groups.
 *
 * Within a Polymarket event group (e.g., "Who will win the election?"), the sum
 * of all outcome YES prices should equal ~1.0. When total probability deviates
 * significantly from 1.0, there is an arbitrage/hedging opportunity.
 *
 * Signal logic:
 *   deviation = Σ(yesPrices) - 1.0
 *
 *   |deviation| > deviationThreshold:
 *     deviation > 0 (overpriced) → SELL most overpriced leg (buy NO)
 *     deviation < 0 (underpriced) → BUY most underpriced leg (buy YES)
 *
 *   Optionally hedge with offsetting position on second-most mispriced leg.
 */
import type { ClobClient } from '../../polymarket/clob-client.js';
import type { OrderManager } from '../../polymarket/order-manager.js';
import type { EventBus } from '../../events/event-bus.js';
import type { GammaClient, GammaMarket, GammaMarketGroup } from '../../polymarket/gamma-client.js';
import type { StrategyName } from '../../core/types.js';
import { logger } from '../../core/logger.js';

// ── Config ───────────────────────────────────────────────────────────────────

export interface MultiLegHedgeConfig {
  /** Min deviation from 1.0 to trigger entry (default 0.05 = 5%) */
  deviationThreshold: number;
  /** Exit when deviation returns within this (default 0.02) */
  convergenceThreshold: number;
  /** Min markets in event to trade (default 2) */
  minMarkets: number;
  /** Skip events with too many legs (default 10) */
  maxMarkets: number;
  /** Take-profit as fraction (default 0.02 = 2%) */
  takeProfitPct: number;
  /** Stop-loss as fraction (default 0.03 = 3%) */
  stopLossPct: number;
  /** Max hold time in ms (default 1800000 = 30 min) */
  maxHoldMs: number;
  /** Max concurrent positions (default 4) */
  maxPositions: number;
  /** Per-event cooldown after exit (ms) (default 180000 = 3 min) */
  cooldownMs: number;
  /** Base trade size in USDC (default '25') */
  positionSize: string;
  /** Open offsetting leg (default true) */
  enableHedge: boolean;
}

const DEFAULT_CONFIG: MultiLegHedgeConfig = {
  deviationThreshold: 0.05,
  convergenceThreshold: 0.02,
  minMarkets: 2,
  maxMarkets: 10,
  takeProfitPct: 0.02,
  stopLossPct: 0.03,
  maxHoldMs: 1_800_000,
  maxPositions: 4,
  cooldownMs: 180_000,
  positionSize: '25',
  enableHedge: true,
};

const STRATEGY_NAME: StrategyName = 'multi-leg-hedge';

// ── Internal types ───────────────────────────────────────────────────────────

interface HedgePosition {
  eventId: string;
  primaryLeg: {
    tokenId: string;
    conditionId: string;
    side: 'yes' | 'no';
    entryPrice: number;
    orderId: string;
  };
  hedgeLeg: {
    tokenId: string;
    conditionId: string;
    side: 'yes' | 'no';
    entryPrice: number;
    orderId: string;
  } | null;
  sizeUsdc: number;
  entryDeviation: number;
  openedAt: number;
}

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/** Calculate deviation of sum of YES prices from 1.0. */
export function calcEventDeviation(prices: number[]): number {
  if (prices.length === 0) return 0;
  const sum = prices.reduce((s, p) => s + p, 0);
  return sum - 1.0;
}

/** Find the most mispriced market in an event group. Rank 0 = most mispriced. */
export function findMostMispriced(
  markets: { id: string; yesPrice: number }[],
): { id: string; yesPrice: number; rank: number } {
  if (markets.length === 0) {
    return { id: '', yesPrice: 0, rank: -1 };
  }
  // Sort by distance from fair value (1/n). Furthest is most mispriced.
  const fairValue = 1 / markets.length;
  const sorted = [...markets].sort(
    (a, b) => Math.abs(b.yesPrice - fairValue) - Math.abs(a.yesPrice - fairValue),
  );
  return { id: sorted[0].id, yesPrice: sorted[0].yesPrice, rank: 0 };
}

/** Calculate hedge size proportional to deviation magnitude. */
export function calcHedgeSize(baseSize: number, deviation: number, threshold: number): number {
  if (threshold <= 0) return baseSize;
  const scale = Math.abs(deviation) / threshold;
  return Math.min(baseSize * scale, baseSize);
}

/** Determine whether to enter based on deviation. */
export function shouldEnterHedge(
  deviation: number,
  config: MultiLegHedgeConfig,
): 'overpriced' | 'underpriced' | null {
  if (Math.abs(deviation) <= config.deviationThreshold) return null;
  return deviation > 0 ? 'overpriced' : 'underpriced';
}

// ── Dependencies ─────────────────────────────────────────────────────────────

export interface MultiLegHedgeDeps {
  clob: ClobClient;
  orderManager: OrderManager;
  eventBus: EventBus;
  gamma: GammaClient;
  config?: Partial<MultiLegHedgeConfig>;
}

// ── Tick factory ─────────────────────────────────────────────────────────────

export function createMultiLegHedgeTick(deps: MultiLegHedgeDeps): () => Promise<void> {
  const { clob, orderManager, eventBus, gamma } = deps;
  const cfg: MultiLegHedgeConfig = { ...DEFAULT_CONFIG, ...deps.config };

  const positions: HedgePosition[] = [];
  const cooldowns = new Map<string, number>();

  // ── Helpers ──────────────────────────────────────────────────────────────

  function isOnCooldown(eventId: string): boolean {
    const until = cooldowns.get(eventId) ?? 0;
    return Date.now() < until;
  }

  function hasPositionFor(eventId: string): boolean {
    return positions.some(p => p.eventId === eventId);
  }

  function bestMid(book: { bids: { price: string }[]; asks: { price: string }[] }): number {
    const bid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
    const ask = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
    return (bid + ask) / 2;
  }

  // ── Exit logic ─────────────────────────────────────────────────────────

  async function checkExits(events: GammaMarketGroup[]): Promise<void> {
    const now = Date.now();
    const toRemove: number[] = [];

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      let shouldExit = false;
      let reason = '';

      // Fetch current price for primary leg
      let currentPrice: number;
      try {
        const book = await clob.getOrderBook(pos.primaryLeg.tokenId);
        currentPrice = bestMid(book);
      } catch {
        continue;
      }

      // Take profit
      if (pos.primaryLeg.side === 'yes') {
        const gain = (currentPrice - pos.primaryLeg.entryPrice) / pos.primaryLeg.entryPrice;
        if (gain >= cfg.takeProfitPct) {
          shouldExit = true;
          reason = `take-profit (${(gain * 100).toFixed(2)}%)`;
        } else if (-gain >= cfg.stopLossPct) {
          shouldExit = true;
          reason = `stop-loss (${(gain * 100).toFixed(2)}%)`;
        }
      } else {
        // NO side: profit when price goes down
        const gain = (pos.primaryLeg.entryPrice - currentPrice) / pos.primaryLeg.entryPrice;
        if (gain >= cfg.takeProfitPct) {
          shouldExit = true;
          reason = `take-profit (${(gain * 100).toFixed(2)}%)`;
        } else if (-gain >= cfg.stopLossPct) {
          shouldExit = true;
          reason = `stop-loss (${(gain * 100).toFixed(2)}%)`;
        }
      }

      // Convergence exit: check if deviation returned within convergenceThreshold
      if (!shouldExit) {
        const event = events.find(e => e.id === pos.eventId);
        if (event) {
          const activeMarkets = event.markets.filter(
            m => m.yesTokenId && !m.closed && !m.resolved && m.active,
          );
          const prices = activeMarkets.map(m => m.yesPrice);
          const deviation = calcEventDeviation(prices);
          if (Math.abs(deviation) <= cfg.convergenceThreshold) {
            shouldExit = true;
            reason = `convergence (deviation=${deviation.toFixed(4)})`;
          }
        }
      }

      // Max hold time
      if (!shouldExit && now - pos.openedAt > cfg.maxHoldMs) {
        shouldExit = true;
        reason = 'max hold time';
      }

      if (shouldExit) {
        try {
          // Exit primary leg
          const exitSide = pos.primaryLeg.side === 'yes' ? 'sell' : 'buy';
          await orderManager.placeOrder({
            tokenId: pos.primaryLeg.tokenId,
            side: exitSide,
            price: currentPrice.toFixed(4),
            size: String(Math.round(pos.sizeUsdc / currentPrice)),
            orderType: 'IOC',
          });

          // Exit hedge leg if present
          if (pos.hedgeLeg) {
            try {
              const hedgeBook = await clob.getOrderBook(pos.hedgeLeg.tokenId);
              const hedgeMid = bestMid(hedgeBook);
              const hedgeExitSide = pos.hedgeLeg.side === 'yes' ? 'sell' : 'buy';
              await orderManager.placeOrder({
                tokenId: pos.hedgeLeg.tokenId,
                side: hedgeExitSide,
                price: hedgeMid.toFixed(4),
                size: String(Math.round(pos.sizeUsdc / hedgeMid)),
                orderType: 'IOC',
              });
            } catch {
              // Best-effort hedge exit
            }
          }

          const pnl = pos.primaryLeg.side === 'yes'
            ? (currentPrice - pos.primaryLeg.entryPrice) * (pos.sizeUsdc / pos.primaryLeg.entryPrice)
            : (pos.primaryLeg.entryPrice - currentPrice) * (pos.sizeUsdc / pos.primaryLeg.entryPrice);

          logger.info('Exit position', STRATEGY_NAME, {
            eventId: pos.eventId,
            side: pos.primaryLeg.side,
            pnl: pnl.toFixed(4),
            reason,
          });

          eventBus.emit('trade.executed', {
            trade: {
              orderId: pos.primaryLeg.orderId,
              marketId: pos.primaryLeg.conditionId,
              side: exitSide,
              fillPrice: String(currentPrice),
              fillSize: String(pos.sizeUsdc),
              fees: '0',
              timestamp: Date.now(),
              strategy: STRATEGY_NAME,
            },
          });

          cooldowns.set(pos.eventId, now + cfg.cooldownMs);
          toRemove.push(i);
        } catch (err) {
          logger.warn('Exit failed', STRATEGY_NAME, { eventId: pos.eventId, err: String(err) });
        }
      }
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      positions.splice(toRemove[i], 1);
    }
  }

  // ── Entry logic ────────────────────────────────────────────────────────

  async function scanEntries(events: GammaMarketGroup[]): Promise<void> {
    if (positions.length >= cfg.maxPositions) return;

    for (const event of events) {
      if (positions.length >= cfg.maxPositions) break;
      if (hasPositionFor(event.id)) continue;
      if (isOnCooldown(event.id)) continue;

      // Filter to active, open markets
      const activeMarkets = event.markets.filter(
        m => m.yesTokenId && !m.closed && !m.resolved && m.active,
      );

      // Check min/max market count
      if (activeMarkets.length < cfg.minMarkets) continue;
      if (activeMarkets.length > cfg.maxMarkets) continue;

      const prices = activeMarkets.map(m => m.yesPrice);
      const deviation = calcEventDeviation(prices);
      const signal = shouldEnterHedge(deviation, cfg);
      if (!signal) continue;

      // Sort by mispricing: for overpriced, highest yesPrice first; for underpriced, lowest first
      const sorted = [...activeMarkets].sort((a, b) =>
        signal === 'overpriced'
          ? b.yesPrice - a.yesPrice
          : a.yesPrice - b.yesPrice,
      );

      const primaryMarket = sorted[0];
      const hedgeMarket = sorted.length > 1 ? sorted[1] : null;

      try {
        const baseSize = parseFloat(cfg.positionSize);
        const size = calcHedgeSize(baseSize, deviation, cfg.deviationThreshold);

        // Primary leg
        const primarySide: 'yes' | 'no' = signal === 'overpriced' ? 'no' : 'yes';
        const primaryTokenId = primarySide === 'yes'
          ? primaryMarket.yesTokenId
          : (primaryMarket.noTokenId ?? primaryMarket.yesTokenId);

        const primaryBook = await clob.getOrderBook(primaryMarket.yesTokenId);
        const primaryMid = bestMid(primaryBook);
        const entryPrice = primarySide === 'yes'
          ? (primaryBook.asks.length > 0 ? parseFloat(primaryBook.asks[0].price) : primaryMid)
          : (1 - (primaryBook.bids.length > 0 ? parseFloat(primaryBook.bids[0].price) : primaryMid));

        const primaryOrder = await orderManager.placeOrder({
          tokenId: primaryTokenId,
          side: 'buy',
          price: entryPrice.toFixed(4),
          size: String(Math.round(size / entryPrice)),
          orderType: 'GTC',
        });

        // Hedge leg (optional)
        let hedgeLeg: HedgePosition['hedgeLeg'] = null;
        if (cfg.enableHedge && hedgeMarket) {
          try {
            // Hedge is the opposite side from primary
            const hedgeSide: 'yes' | 'no' = signal === 'overpriced' ? 'yes' : 'no';
            const hedgeTokenId = hedgeSide === 'yes'
              ? hedgeMarket.yesTokenId
              : (hedgeMarket.noTokenId ?? hedgeMarket.yesTokenId);

            const hedgeBook = await clob.getOrderBook(hedgeMarket.yesTokenId);
            const hedgeMid = bestMid(hedgeBook);
            const hedgeEntryPrice = hedgeSide === 'yes'
              ? (hedgeBook.asks.length > 0 ? parseFloat(hedgeBook.asks[0].price) : hedgeMid)
              : (1 - (hedgeBook.bids.length > 0 ? parseFloat(hedgeBook.bids[0].price) : hedgeMid));

            const hedgeOrder = await orderManager.placeOrder({
              tokenId: hedgeTokenId,
              side: 'buy',
              price: hedgeEntryPrice.toFixed(4),
              size: String(Math.round(size / hedgeEntryPrice)),
              orderType: 'GTC',
            });

            hedgeLeg = {
              tokenId: hedgeTokenId,
              conditionId: hedgeMarket.conditionId,
              side: hedgeSide,
              entryPrice: hedgeEntryPrice,
              orderId: hedgeOrder.id,
            };
          } catch {
            // Hedge leg is optional — proceed without it
          }
        }

        positions.push({
          eventId: event.id,
          primaryLeg: {
            tokenId: primaryTokenId,
            conditionId: primaryMarket.conditionId,
            side: primarySide,
            entryPrice,
            orderId: primaryOrder.id,
          },
          hedgeLeg,
          sizeUsdc: size,
          entryDeviation: deviation,
          openedAt: Date.now(),
        });

        logger.info('Entry position', STRATEGY_NAME, {
          eventId: event.id,
          signal,
          deviation: deviation.toFixed(4),
          primaryLeg: { conditionId: primaryMarket.conditionId, side: primarySide },
          hedgeLeg: hedgeLeg ? { conditionId: hedgeLeg.conditionId, side: hedgeLeg.side } : null,
          size,
        });

        eventBus.emit('trade.executed', {
          trade: {
            orderId: primaryOrder.id,
            marketId: primaryMarket.conditionId,
            side: 'buy',
            fillPrice: String(entryPrice),
            fillSize: String(size),
            fees: '0',
            timestamp: Date.now(),
            strategy: STRATEGY_NAME,
          },
        });
      } catch (err) {
        logger.debug('Entry scan error', STRATEGY_NAME, {
          eventId: event.id,
          err: String(err),
        });
      }
    }
  }

  // ── Main tick ──────────────────────────────────────────────────────────

  return async function multiLegHedgeTick(): Promise<void> {
    try {
      const events = await gamma.getEvents(20);

      await checkExits(events);
      await scanEntries(events);

      logger.debug('Tick complete', STRATEGY_NAME, {
        openPositions: positions.length,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  };
}
