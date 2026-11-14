/**
 * Negative Risk Scanner — exit evaluator.
 *
 * Evaluates open arb positions against take-profit, stop-loss, and max-hold
 * thresholds, and emits sell orders + CLOB V2 taker fee events when conditions
 * are met.
 */

import { logger } from '../../core/logger';
import { STRATEGY_NAME, setCooldown } from './negative-risk-types';
import type { ScannerRuntime } from './negative-risk-types';
import { getBestBid, calcExitValue, usdcToTokens } from './order-book-utils';
import {
  calcQuadraticTakerFeeV2,
  type PolymarketCategory,
} from '../../polymarket/polymarket-fee-calculator';

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
      const [yesBook, noBook] = await Promise.all([
        runtime.clob.getOrderBook(pos.yesTokenId),
        runtime.clob.getOrderBook(pos.noTokenId),
      ]);

      const yesBid = getBestBid(yesBook);
      const noBid = getBestBid(noBook);

      if (yesBid <= 0 || noBid <= 0) continue;

      const { pnlPct } = calcExitValue(
        yesBid,
        noBid,
        pos.yesSizeUsdc,
        pos.noSizeUsdc,
        pos.yesEntryPrice,
        pos.noEntryPrice,
      );

      if (pnlPct >= (runtime.cfg.takeProfitPct ?? 0.02)) {
        shouldExit = true;
        reason = `take-profit (${(pnlPct * 100).toFixed(2)}%)`;
      } else if (-pnlPct >= (runtime.cfg.stopLossPct ?? 0.015)) {
        shouldExit = true;
        reason = `stop-loss (${(pnlPct * 100).toFixed(2)}%)`;
      } else if (runtime.cfg.maxHoldMs && now - pos.openedAt > runtime.cfg.maxHoldMs) {
        shouldExit = true;
        reason = 'max hold time';
      }

      if (shouldExit) {
        const yesSizeTokens = pos.yesTokens ?? usdcToTokens(pos.yesSizeUsdc, pos.yesEntryPrice);
        const noSizeTokens = pos.noTokens ?? usdcToTokens(pos.noSizeUsdc, pos.noEntryPrice);
        const category: PolymarketCategory = pos.category ?? 'politics';

        const yesSellOrder =
          yesSizeTokens > 0
            ? await runtime.orderManager.placeOrder({
                tokenId: pos.yesTokenId,
                side: 'sell',
                price: yesBid.toFixed(4),
                size: String(yesSizeTokens),
                orderType: 'IOC',
              })
            : undefined;
        const noSellOrder =
          noSizeTokens > 0
            ? await runtime.orderManager.placeOrder({
                tokenId: pos.noTokenId,
                side: 'sell',
                price: noBid.toFixed(4),
                size: String(noSizeTokens),
                orderType: 'IOC',
              })
            : undefined;

        const yesFeeUsdc = calcQuadraticTakerFeeV2(category, yesBid, yesSizeTokens) * yesBid;
        const noFeeUsdc = calcQuadraticTakerFeeV2(category, noBid, noSizeTokens) * noBid;

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
            fees: yesSellOrder?.fees ?? yesFeeUsdc.toFixed(6),
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
            fees: noSellOrder?.fees ?? noFeeUsdc.toFixed(6),
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
    setCooldown(runtime, conditionId);
  }
}
