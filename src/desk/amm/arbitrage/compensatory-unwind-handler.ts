/**
 * Compensatory Unwind Handler
 * Liquidates filled legs on partial or failed multi-leg bundle execution
 * to eliminate unhedged directional exposure and guarantee net delta returns to 0.00.
 */

import { logger } from '../../../shared/utils/logger';
import { ExecutionLeg, UnwindResult } from '../types/arbitrage-types';
import {
  type UnwindOrderExecutor,
  type UnwindOptions,
  createEmptyUnwindResult,
  computeInitialCashFlow,
  computeUnwindCashDelta,
  computeFallbackUnwindPrice,
  buildFinalUnwindResult,
  verifyZeroDeltaExposure as verifyZeroDeltaExposureMath,
} from './compensatory-unwind-math';

export type { UnwindOrderExecutor, UnwindOptions };

export class CompensatoryUnwindHandler {
  public static async unwindPartialFills(
    legs: ExecutionLeg[],
    options?: UnwindOptions
  ): Promise<UnwindResult> {
    if (!legs || legs.length === 0) {
      return createEmptyUnwindResult();
    }

    const qMatched = Math.min(...legs.map((l) => l.filledSize));
    const isUnderpriced = options?.opportunityType === 'UNDERPRICED_BASKET';
    const feeRate = (options?.takerFeeBps ?? 10) / 10000;
    let [netCashFlow, totalRecovered, allCompleted] = [computeInitialCashFlow(legs), 0, true];

    // Handle matched complete sets across all outcomes
    let matchedSetsSettled = false;
    if (qMatched > 0) {
      const poolFee = options?.pool ? options.pool.feeBps / 10000 : 0;
      if (isUnderpriced) {
        const mergedCollateral = qMatched * (1.0 - poolFee);
        netCashFlow += mergedCollateral;
        totalRecovered += mergedCollateral;
        if (options?.pool) options.pool.mergeCompleteSets(qMatched);
        matchedSetsSettled = true;
        logger.info('[CompensatoryUnwindHandler] Merged sets', { qMatched, mergedCollateral });
      } else {
        const mintCost = qMatched * (1.0 + poolFee);
        netCashFlow -= mintCost;
        if (options?.pool) options.pool.mintCompleteSets(qMatched);
        matchedSetsSettled = true;
        logger.info('[CompensatoryUnwindHandler] Minted sets to cover shorts', { qMatched, mintCost });
      }
    }

    const postUnwindLegs: ExecutionLeg[] = [];

    // Unwind surplus inventory for each leg
    for (const leg of legs) {
      const outcomeIdx = leg.outcomeIndex ?? leg.legIndex;
      const surplus = leg.filledSize - qMatched;

      if (surplus <= 0) {
        postUnwindLegs.push({ ...leg, filledSize: matchedSetsSettled ? 0 : qMatched });
        continue;
      }

      const unwindAction: 'BUY' | 'SELL' = leg.action === 'BUY' ? 'SELL' : 'BUY';
      logger.warn('[CompensatoryUnwindHandler] Unwinding surplus leg', {
        legIndex: leg.legIndex, outcomeIndex: outcomeIdx, action: unwindAction, surplusSize: surplus,
      });

      let liquidatedSize = 0;

      try {
        if (options?.unwindExecutor) {
          const res = await options.unwindExecutor(outcomeIdx, unwindAction, surplus);
          liquidatedSize = res.filled;
          if (liquidatedSize < surplus) allCompleted = false;
          const delta = computeUnwindCashDelta(unwindAction, liquidatedSize, res.price, feeRate);
          netCashFlow += delta;
          if (unwindAction === 'SELL') totalRecovered += delta;
        } else if (options?.pool) {
          const spot = options.pool.getSpotPrices()[outcomeIdx] ?? leg.avgFillPrice;
          const tradeAmount = unwindAction === 'SELL' ? surplus : surplus * spot;
          const tradeRes = options.pool.executeTrade({
            poolId: options.pool.poolId, outcomeIndex: outcomeIdx, action: unwindAction, amount: tradeAmount,
          });
          liquidatedSize = surplus;
          if (unwindAction === 'SELL') {
            netCashFlow += tradeRes.outputAmount;
            totalRecovered += tradeRes.outputAmount;
          } else {
            netCashFlow -= tradeRes.inputAmount;
          }
        } else {
          const unwindPrice = computeFallbackUnwindPrice(unwindAction, leg.avgFillPrice);
          liquidatedSize = surplus;
          const delta = computeUnwindCashDelta(unwindAction, liquidatedSize, unwindPrice, feeRate);
          netCashFlow += delta;
          if (unwindAction === 'SELL') totalRecovered += delta;
        }
      } catch (err) {
        allCompleted = false;
        logger.error('[CompensatoryUnwindHandler] Failed to unwind leg', {
          legIndex: leg.legIndex, error: err instanceof Error ? err.message : String(err),
        });
      }

      const remainingSurplus = surplus - liquidatedSize;
      const finalFilled = (matchedSetsSettled ? 0 : qMatched) + remainingSurplus;
      postUnwindLegs.push({ ...leg, filledSize: finalFilled });
    }

    const result = buildFinalUnwindResult(qMatched, totalRecovered, netCashFlow, allCompleted, postUnwindLegs);
    logger.info('[CompensatoryUnwindHandler] Unwind execution completed', {
      qMatched,
      totalRecovered: result.recoveredUsdc,
      residualLossUsd: result.residualLossUsd,
      residualDeltaExposure: result.residualDeltaExposure,
      completed: result.completed,
    });
    return result;
  }

  public static verifyZeroDeltaExposure(legsOrPositions: ExecutionLeg[] | number[]): boolean {
    return verifyZeroDeltaExposureMath(legsOrPositions);
  }
}
