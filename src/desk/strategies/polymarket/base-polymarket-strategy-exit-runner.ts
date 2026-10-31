/**
 * Exit checking and position removal loop for BasePolymarketStrategy.
 */

import type { RawOrderBook } from '../../polymarket/clob-client';
import type { StrategyName } from '../../core/types';
import type {
  BaseStrategyConfig,
  CustomExitVerdict,
  OpenPosition,
} from './base-polymarket-strategy-types';
import { computePositionGain, evaluateExitCondition } from './base-polymarket-strategy-exits';
import { logger } from '../../core/logger';

export interface ExitCheckContext {
  positions: OpenPosition[];
  config: BaseStrategyConfig;
  strategyName: StrategyName;
  getCurrentPrice: (tokenId: string) => Promise<{ mid: number; bid: number; ask: number; fromCache: boolean }>;
  getCachedOrderbook: (tokenId: string) => RawOrderBook | undefined;
  getCustomExitCondition: (pos: OpenPosition, currentPrice: number, book?: RawOrderBook) => CustomExitVerdict;
  exitPosition: (pos: OpenPosition, currentPrice: number, reason: string) => Promise<void>;
}

export async function processPositionExits(
  ctx: ExitCheckContext,
  now = Date.now(),
): Promise<void> {
  const toRemove: number[] = [];

  for (let i = 0; i < ctx.positions.length; i++) {
    const pos = ctx.positions[i];
    const { mid: currentPrice, fromCache } = await ctx.getCurrentPrice(pos.tokenId);
    const book = ctx.getCachedOrderbook(pos.tokenId);

    if (currentPrice === 0) continue;

    let { shouldExit, reason } = evaluateExitCondition(pos, currentPrice, ctx.config, undefined, now);
    if (!shouldExit) {
      const custom = ctx.getCustomExitCondition(pos, currentPrice, book);
      ({ shouldExit, reason } = evaluateExitCondition(pos, currentPrice, ctx.config, custom, now));
    }

    if (shouldExit) {
      // Only drop the position once the exit is confirmed. `exitPosition` throws
      // on an unfilled or rejected exit; catching here keeps one failing exit from
      // aborting the whole loop while preserving the still-open position.
      try {
        await ctx.exitPosition(pos, currentPrice, reason);
        toRemove.push(i);
      } catch (err) {
        logger.error('Exit failed, position retained', ctx.strategyName, {
          conditionId: pos.conditionId,
          tokenId: pos.tokenId,
          reason,
          err: String(err),
        });
      }
    } else if (fromCache) {
      const gain = computePositionGain(pos, currentPrice);
      logger.debug('Position check (cached price)', ctx.strategyName, {
        conditionId: pos.conditionId,
        currentPrice: currentPrice.toFixed(4),
        gain: (gain * 100).toFixed(2) + '%',
      });
    }
  }

  for (let i = toRemove.length - 1; i >= 0; i--) {
    ctx.positions.splice(toRemove[i], 1);
  }
}
