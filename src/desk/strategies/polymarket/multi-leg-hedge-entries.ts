/**
 * Multi-Leg Hedge — Entry logic
 *
 * Extracted from multi-leg-hedge.ts to keep files under 200 lines.
 * Body moved VERBATIM from scanEntries (lines 216-351); only closure-state
 * references were rewritten as `ctx.` references.
 */
import type { GammaMarketGroup } from '../../polymarket/gamma-client';
import { logger } from '../../core/logger';
import {
  type HedgePosition,
  STRATEGY_NAME,
  calcEventDeviation,
  calcHedgeSize,
  shouldEnterHedge,
  bestMid,
} from './multi-leg-hedge-config';
import type { MultiLegHedgeTickContext } from './multi-leg-hedge-exits';

// ── Helpers ─────────────────────────────────────────────────────────────────

function isOnCooldown(cooldowns: Map<string, number>, eventId: string): boolean {
  const until = cooldowns.get(eventId) ?? 0;
  return Date.now() < until;
}

function hasPositionFor(positions: HedgePosition[], eventId: string): boolean {
  return positions.some(p => p.eventId === eventId);
}

// ── Entry logic ─────────────────────────────────────────────────────────────

export async function scanEntriesFor(
  ctx: MultiLegHedgeTickContext,
  events: GammaMarketGroup[],
): Promise<void> {
  if (ctx.positions.length >= ctx.cfg.maxPositions) return;

  for (const event of events) {
    if (ctx.positions.length >= ctx.cfg.maxPositions) break;
    if (hasPositionFor(ctx.positions, event.id)) continue;
    if (isOnCooldown(ctx.cooldowns, event.id)) continue;

    // Filter to active, open markets
    const activeMarkets = event.markets.filter(
      m => m.yesTokenId && !m.closed && !m.resolved && m.active,
    );

    // Check min/max market count
    if (activeMarkets.length < ctx.cfg.minMarkets) continue;
    if (activeMarkets.length > ctx.cfg.maxMarkets) continue;

    const prices = activeMarkets.map(m => m.yesPrice);
    const deviation = calcEventDeviation(prices);
    const signal = shouldEnterHedge(deviation, ctx.cfg);
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
      const baseSize = parseFloat(ctx.cfg.positionSize);
      const size = calcHedgeSize(baseSize, deviation, ctx.cfg.deviationThreshold);

      // Primary leg
      const primarySide: 'yes' | 'no' = signal === 'overpriced' ? 'no' : 'yes';
      const primaryTokenId = primarySide === 'yes'
        ? primaryMarket.yesTokenId
        : (primaryMarket.noTokenId ?? primaryMarket.yesTokenId);

      const primaryBook = await ctx.clob.getOrderBook(primaryMarket.yesTokenId);
      const primaryMid = bestMid(primaryBook);
      const entryPrice = primarySide === 'yes'
        ? (primaryBook.asks.length > 0 ? parseFloat(primaryBook.asks[0].price) : primaryMid)
        : (1 - (primaryBook.bids.length > 0 ? parseFloat(primaryBook.bids[0].price) : primaryMid));

      const primaryOrder = await ctx.orderManager.placeOrder({
        tokenId: primaryTokenId,
        side: 'buy',
        price: entryPrice.toFixed(4),
        size: String(Math.round(size / entryPrice)),
        orderType: 'GTC',
      });

      // Hedge leg (optional)
      let hedgeLeg: HedgePosition['hedgeLeg'] = null;
      if (ctx.cfg.enableHedge && hedgeMarket) {
        try {
          // Hedge is the opposite side from primary
          const hedgeSide: 'yes' | 'no' = signal === 'overpriced' ? 'yes' : 'no';
          const hedgeTokenId = hedgeSide === 'yes'
            ? hedgeMarket.yesTokenId
            : (hedgeMarket.noTokenId ?? hedgeMarket.yesTokenId);

          const hedgeBook = await ctx.clob.getOrderBook(hedgeMarket.yesTokenId);
          const hedgeMid = bestMid(hedgeBook);
          const hedgeEntryPrice = hedgeSide === 'yes'
            ? (hedgeBook.asks.length > 0 ? parseFloat(hedgeBook.asks[0].price) : hedgeMid)
            : (1 - (hedgeBook.bids.length > 0 ? parseFloat(hedgeBook.bids[0].price) : hedgeMid));

          const hedgeOrder = await ctx.orderManager.placeOrder({
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

      ctx.positions.push({
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

      ctx.eventBus.emit('trade.executed', {
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