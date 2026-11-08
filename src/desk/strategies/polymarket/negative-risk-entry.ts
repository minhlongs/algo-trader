/**
 * Negative Risk Scanner — entry scanner.
 *
 * Scans trending Gamma markets for negative-risk arb opportunities and places
 * buy orders on both legs when the sum of best asks is below the threshold.
 *
 * The raw ask sum alone overstates the edge: a CLOB V2 taker BUY deducts its
 * fee in outcome shares, so the mergeable pair count comes in short of what
 * was ordered and the effective pair cost sits above the quoted sum. Entry is
 * therefore gated on the fee-adjusted pair cost and the resulting net edge,
 * not on `yesAsk + noAsk` by itself.
 */

import { logger } from '../../core/logger';
import { STRATEGY_NAME, setCooldown, isOnCooldown } from './negative-risk-types';
import type { ScannerRuntime, ArbPosition } from './negative-risk-types';
import { getBestAsk, usdcToTokens } from './order-book-utils';
import type { GammaMarket } from '../../polymarket/gamma-client';
import {
  calcQuadraticTakerFeeRateV2,
  calcQuadraticTakerFeeV2,
  classifyMarketCategory,
  computeTakerBuyNetSharesAndMergeablePairs,
  type PolymarketCategory,
} from '../../polymarket/polymarket-fee-calculator';

/**
 * Scan for new entry opportunities across trending markets.
 * Places buy orders on qualifying markets and records positions.
 */
export async function scanEntries(runtime: ScannerRuntime): Promise<void> {
  let markets: GammaMarket[];
  try {
    markets = await runtime.gamma.getTrending(15);
  } catch (err) {
    logger.debug('Failed to fetch trending markets', STRATEGY_NAME, {
      err: String(err),
    });
    return;
  }

  for (const market of markets) {
    if (!market.yesTokenId || !market.noTokenId) continue;
    if (market.closed || market.resolved) continue;
    if ((market.volume ?? 0) < runtime.cfg.minVolumeUsdc) continue;
    if (runtime.positions.has(market.conditionId)) continue; // already have arb position
    if (isOnCooldown(runtime, market.conditionId)) continue;

    try {
      // Fetch order books for both tokens in parallel
      const [yesBook, noBook] = await Promise.all([
        runtime.clob.getOrderBook(market.yesTokenId),
        runtime.clob.getOrderBook(market.noTokenId),
      ]);

      const yesAsk = getBestAsk(yesBook);
      const noAsk = getBestAsk(noBook);

      // Validate prices
      if (yesAsk <= 0 || yesAsk >= 1 || noAsk <= 0 || noAsk >= 1) continue;

      const totalCost = yesAsk + noAsk;
      if (totalCost >= runtime.cfg.threshold) continue;

      // A taker BUY pays the fee out of received outcome shares, so the price
      // per *mergeable* pair is the ask grossed up by the fee.
      const category: PolymarketCategory = classifyMarketCategory(
        `${market.question ?? ''} ${market.slug ?? ''}`,
      );
      const yesFeeRate = calcQuadraticTakerFeeRateV2(category, yesAsk);
      const noFeeRate = calcQuadraticTakerFeeRateV2(category, noAsk);
      const effectivePairCost =
        yesAsk / (1 - yesFeeRate) + noAsk / (1 - noFeeRate);
      if (effectivePairCost >= runtime.cfg.threshold) continue;

      // Compute token amounts based on maxOpportunitySizeUsdc
      const legSizeUsdc = Math.min(runtime.cfg.maxOpportunitySizeUsdc, 1000); // cap at 1000 to avoid fat finger
      const yesSizeTokens = usdcToTokens(legSizeUsdc, yesAsk);
      const noSizeTokens = usdcToTokens(legSizeUsdc, noAsk);

      if (yesSizeTokens <= 0 || noSizeTokens <= 0) continue;

      // Net edge is priced on the matched pair count (`pairedTokens`) and the
      // shares actually received after Taker-BUY share deduction: each merged
      // pair redeems for $1 while the full upfront USDC cost of those matched
      // pairs is paid at entry.
      const yesFeeUsdc = calcQuadraticTakerFeeV2(category, yesAsk, yesSizeTokens) * yesAsk;
      const noFeeUsdc = calcQuadraticTakerFeeV2(category, noAsk, noSizeTokens) * noAsk;
      const pairedTokens = Math.min(yesSizeTokens, noSizeTokens);
      const parity = computeTakerBuyNetSharesAndMergeablePairs(
        pairedTokens,
        yesAsk,
        noAsk,
        category,
      );
      const pairedNotionalUsdc = pairedTokens * (yesAsk + noAsk);
      const netExpectedProfitUsdc = parity.mergeablePairs - pairedNotionalUsdc;
      if (netExpectedProfitUsdc <= (runtime.cfg.minNetEdgeUsdc ?? 0)) continue;

      // Place buy orders
      const [yesOrder, noOrder] = await Promise.all([
        runtime.orderManager.placeOrder({
          tokenId: market.yesTokenId,
          side: 'buy',
          price: yesAsk.toFixed(4),
          size: String(yesSizeTokens),
          orderType: 'IOC',
        }),
        runtime.orderManager.placeOrder({
          tokenId: market.noTokenId,
          side: 'buy',
          price: noAsk.toFixed(4),
          size: String(noSizeTokens),
          orderType: 'IOC',
        }),
      ]);

      // Record position
      const pos: ArbPosition = {
        conditionId: market.conditionId,
        yesTokenId: market.yesTokenId,
        noTokenId: market.noTokenId,
        yesEntryPrice: yesAsk,
        noEntryPrice: noAsk,
        yesSizeUsdc: legSizeUsdc,
        noSizeUsdc: legSizeUsdc,
        yesOrderId: yesOrder.id,
        noOrderId: noOrder.id,
        openedAt: Date.now(),
      };
      runtime.positions.set(market.conditionId, pos);
      setCooldown(runtime, market.conditionId);

      const lockedProfit = 1 - totalCost;

      logger.info('Arbitrage opportunity detected', STRATEGY_NAME, {
        conditionId: market.conditionId,
        category,
        yesAsk: yesAsk.toFixed(4),
        noAsk: noAsk.toFixed(4),
        totalCost: totalCost.toFixed(4),
        effectivePairCost: effectivePairCost.toFixed(4),
        threshold: runtime.cfg.threshold,
        legSizeUsdc: legSizeUsdc.toFixed(2),
        lockedProfit: lockedProfit.toFixed(4),
        netExpectedProfitUsdc: netExpectedProfitUsdc.toFixed(4),
        yesTokens: yesSizeTokens,
        noTokens: noSizeTokens,
      });

      // Emit events for both legs
      runtime.eventBus.emit('trade.executed', {
        trade: {
          orderId: yesOrder.id,
          marketId: market.conditionId,
          side: 'buy',
          fillPrice: String(yesAsk),
          fillSize: String(legSizeUsdc),
          fees: yesOrder.fees ?? yesFeeUsdc.toFixed(6),
          timestamp: Date.now(),
          strategy: STRATEGY_NAME,
        },
      });
      runtime.eventBus.emit('trade.executed', {
        trade: {
          orderId: noOrder.id,
          marketId: market.conditionId,
          side: 'buy',
          fillPrice: String(noAsk),
          fillSize: String(legSizeUsdc),
          fees: noOrder.fees ?? noFeeUsdc.toFixed(6),
          timestamp: Date.now(),
          strategy: STRATEGY_NAME,
        },
      });
    } catch (err) {
      logger.debug('Entry error', STRATEGY_NAME, {
        market: market.conditionId,
        err: String(err),
      });
    }
  }
}