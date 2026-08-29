/**
 * Multi-Leg Hedge — Exit logic
 *
 * Extracted from multi-leg-hedge.ts to keep files under 200 lines.
 * Body moved VERBATIM from checkExits (lines 85-212); only closure-state
 * references were rewritten as `ctx.` references.
 */
import type { ClobClient } from '../../polymarket/clob-client';
import type { OrderManager } from '../../polymarket/order-manager';
import type { EventBus } from '../../events/event-bus';
import type { GammaMarketGroup } from '../../polymarket/gamma-client';
import { logger } from '../../core/logger';
import {
  type HedgePosition,
  type MultiLegHedgeConfig,
  STRATEGY_NAME,
  calcEventDeviation,
  bestMid,
} from './multi-leg-hedge-config';

// ── Structural context ─────────────────────────────────────────────────────

export interface MultiLegHedgeTickContext {
  positions: HedgePosition[];
  cooldowns: Map<string, number>;
  cfg: MultiLegHedgeConfig;
  clob: ClobClient;
  orderManager: OrderManager;
  eventBus: EventBus;
}

// ── Exit logic ──────────────────────────────────────────────────────────────

export async function checkExitsFor(
  ctx: MultiLegHedgeTickContext,
  events: GammaMarketGroup[],
): Promise<void> {
  const now = Date.now();
  const toRemove: number[] = [];

  for (let i = 0; i < ctx.positions.length; i++) {
    const pos = ctx.positions[i];
    let shouldExit = false;
    let reason = '';

    // Fetch current price for primary leg
    let currentPrice: number;
    try {
      const book = await ctx.clob.getOrderBook(pos.primaryLeg.tokenId);
      currentPrice = bestMid(book);
    } catch {
      continue;
    }

    // Take profit
    if (pos.primaryLeg.side === 'yes') {
      const gain = (currentPrice - pos.primaryLeg.entryPrice) / pos.primaryLeg.entryPrice;
      if (gain >= ctx.cfg.takeProfitPct) {
        shouldExit = true;
        reason = `take-profit (${(gain * 100).toFixed(2)}%)`;
      } else if (-gain >= ctx.cfg.stopLossPct) {
        shouldExit = true;
        reason = `stop-loss (${(gain * 100).toFixed(2)}%)`;
      }
    } else {
      // NO side: profit when price goes down
      const gain = (pos.primaryLeg.entryPrice - currentPrice) / pos.primaryLeg.entryPrice;
      if (gain >= ctx.cfg.takeProfitPct) {
        shouldExit = true;
        reason = `take-profit (${(gain * 100).toFixed(2)}%)`;
      } else if (-gain >= ctx.cfg.stopLossPct) {
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
        if (Math.abs(deviation) <= ctx.cfg.convergenceThreshold) {
          shouldExit = true;
          reason = `convergence (deviation=${deviation.toFixed(4)})`;
        }
      }
    }

    // Max hold time
    if (!shouldExit && now - pos.openedAt > ctx.cfg.maxHoldMs) {
      shouldExit = true;
      reason = 'max hold time';
    }

    if (shouldExit) {
      try {
        // Exit primary leg
        const exitSide = pos.primaryLeg.side === 'yes' ? 'sell' : 'buy';
        await ctx.orderManager.placeOrder({
          tokenId: pos.primaryLeg.tokenId,
          side: exitSide,
          price: currentPrice.toFixed(4),
          size: String(Math.round(pos.sizeUsdc / currentPrice)),
          orderType: 'IOC',
        });

        // Exit hedge leg if present
        if (pos.hedgeLeg) {
          try {
            const hedgeBook = await ctx.clob.getOrderBook(pos.hedgeLeg.tokenId);
            const hedgeMid = bestMid(hedgeBook);
            const hedgeExitSide = pos.hedgeLeg.side === 'yes' ? 'sell' : 'buy';
            await ctx.orderManager.placeOrder({
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

        ctx.eventBus.emit('trade.executed', {
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

        ctx.cooldowns.set(pos.eventId, now + ctx.cfg.cooldownMs);
        toRemove.push(i);
      } catch (err) {
        logger.warn('Exit failed', STRATEGY_NAME, { eventId: pos.eventId, err: String(err) });
      }
    }
  }

  for (let i = toRemove.length - 1; i >= 0; i--) {
    ctx.positions.splice(toRemove[i], 1);
  }
}