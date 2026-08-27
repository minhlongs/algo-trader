/**
 * Negative Risk Scanner — exit evaluator.
 *
 * Evaluates open arb positions against take-profit, stop-loss, and max-hold
 * thresholds, and emits sell orders + events when conditions are met.
 */

import { logger } from '../../core/logger';
import { STRATEGY_NAME, setCooldown } from './negative-risk-types';
import type { ScannerRuntime, ArbPosition } from './negative-risk-types';
import { getBestBid, calcExitValue, usdcToTokens } from './order-book-utils';

/**
 * Check all open positions and close those that meet exit criteria.
 * Mutates runtime.positions (deletes closed) and arms cooldowns.
 */
export async function evaluateExits(runtime: ScannerRuntime): Promise<void> {
  const now = Date.now();
  const toClose: string[] = [];

  for (const [conditionId, pos] of runtime.positions.entries()) {
    let shouldExit = false;
    let reason = '';

    try {
      // Fetch current order books for both tokens
      const [yesBook, noBook] = await Promise.all([
        runtime.clob.getOrderBook(pos.yesTokenId),
        runtime.clob.getOrderBook(pos.noTokenId),
      ]);

      const yesBid = getBestBid(yesBook);
      const noBid = getBestBid(noBook);

      if (yesBid <= 0 || noBid <= 0) continue; // no liquidity

      const { pnlPct } = calcExitValue(
        yesBid,
        noBid,
        pos.yesSizeUsdc,
        pos.noSizeUsdc,
        pos.yesEntryPrice,
        pos.noEntryPrice
      );

      // Take profit
      if (pnlPct >= (runtime.cfg.takeProfitPct ?? 0.02)) {
        shouldExit = true;
        reason = `take-profit (${(pnlPct * 100).toFixed(2)}%)`;
      }
      // Stop loss
      else if (-pnlPct >= (runtime.cfg.stopLossPct ?? 0.015)) {
        shouldExit = true;
        reason = `stop-loss (${(pnlPct * 100).toFixed(2)}%)`;
      }
      // Max hold time
      else if (runtime.cfg.maxHoldMs && now - pos.openedAt > runtime.cfg.maxHoldMs) {
        shouldExit = true;
        reason = 'max hold time';
      }

      if (shouldExit) {
        // Place sell orders for both legs
        const yesSizeTokens = usdcToTokens(pos.yesSizeUsdc, pos.yesEntryPrice);
        const noSizeTokens = usdcToTokens(pos.noSizeUsdc, pos.noEntryPrice);

        if (yesSizeTokens > 0) {
          await runtime.orderManager.placeOrder({
            tokenId: pos.yesTokenId,
            side: 'sell',
            price: yesBid.toFixed(4),
            size: String(yesSizeTokens),
            orderType: 'IOC',
          });
        }
        if (noSizeTokens > 0) {
          await runtime.orderManager.placeOrder({
            tokenId: pos.noTokenId,
            side: 'sell',
            price: noBid.toFixed(4),
            size: String(noSizeTokens),
            orderType: 'IOC',
          });
        }

        logger.info('Exit arbitrage position', STRATEGY_NAME, {
          conditionId: pos.conditionId,
          pnlPct: (pnlPct * 100).toFixed(2) + '%',
          reason,
        });

        runtime.eventBus.emit('trade.executed', {
          trade: {
            orderId: pos.yesOrderId,
            marketId: conditionId,
            side: 'sell',
            fillPrice: String(yesBid),
            fillSize: String(pos.yesSizeUsdc),
            fees: '0',
            timestamp: now,
            strategy: STRATEGY_NAME,
          },
        });
        runtime.eventBus.emit('trade.executed', {
          trade: {
            orderId: pos.noOrderId,
            marketId: conditionId,
            side: 'sell',
            fillPrice: String(noBid),
            fillSize: String(pos.noSizeUsdc),
            fees: '0',
            timestamp: now,
            strategy: STRATEGY_NAME,
          },
        });

        toClose.push(conditionId);
      }
    } catch (err) {
      logger.warn('Exit check failed', STRATEGY_NAME, {
        conditionId: pos.conditionId,
        err: String(err),
      });
    }
  }

  for (const conditionId of toClose) {
    runtime.positions.delete(conditionId);
    setCooldown(runtime, conditionId); // apply cooldown after exit
  }
}