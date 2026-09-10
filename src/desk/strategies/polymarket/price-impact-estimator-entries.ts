/**
 * Price Impact Estimator - Entry Scanning Logic
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import { logger } from '../../core/logger';
import {
  STRATEGY_NAME,
  type PriceImpactEstimatorConfig,
  type PriceImpactEstimatorDeps,
} from './price-impact-estimator-types';
import {
  bestBidAsk,
  simulatePriceImpact,
  calcImpactAsymmetry,
  determineSide,
} from './price-impact-estimator-algorithms';
import type { PriceImpactEstimatorState } from './price-impact-estimator-state';

export async function scanPriceImpactEntries(
  markets: GammaMarket[],
  deps: PriceImpactEstimatorDeps,
  cfg: PriceImpactEstimatorConfig,
  state: PriceImpactEstimatorState
): Promise<void> {
  const { clob, orderManager, eventBus } = deps;
  const { positions, hasPosition, isOnCooldown, updateImpactEmaState } = state;

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

      // Simulate price impact on both sides
      const buyFillPrice = simulatePriceImpact(book.asks, cfg.hypotheticalSize);
      const sellFillPrice = simulatePriceImpact(book.bids, cfg.hypotheticalSize);

      // If either side has insufficient liquidity, skip
      if (buyFillPrice === 0 || sellFillPrice === 0) continue;

      // Calculate impacts relative to mid
      const buyImpact = Math.abs(buyFillPrice - ba.mid);
      const sellImpact = Math.abs(sellFillPrice - ba.mid);

      // Calculate asymmetry
      const asymmetry = calcImpactAsymmetry(buyImpact, sellImpact, ba.mid);

      // Update EMA for tracking
      updateImpactEmaState(market.yesTokenId, asymmetry);

      // Check threshold
      if (asymmetry < cfg.asymmetryThreshold) continue;

      // Determine side
      const side = determineSide(buyImpact, sellImpact);
      if (side === null) continue;

      const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);

      // Calculate entry price and size
      const entryPrice = side === 'yes' ? ba.ask : ba.bid;
      if (entryPrice <= 0 || entryPrice >= 1) continue;

      const posSize = parseFloat(cfg.positionSize);
      const shares = Math.round(posSize / entryPrice);
      if (shares <= 0) continue;

      // Place order
      const order = await orderManager.placeOrder({
        tokenId,
        side: 'buy',
        price: entryPrice.toFixed(4),
        size: String(shares),
        orderType: 'GTC',
      });

      // Track position
      positions.push({
        tokenId,
        conditionId: market.conditionId,
        side,
        entryPrice,
        sizeUsdc: posSize,
        orderId: order.id,
        openedAt: Date.now(),
      });

      logger.info('Entry', STRATEGY_NAME, {
        conditionId: market.conditionId,
        side,
        entryPrice: entryPrice.toFixed(4),
        asymmetry: asymmetry.toFixed(4),
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
