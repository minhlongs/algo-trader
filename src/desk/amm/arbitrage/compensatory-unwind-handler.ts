/**
 * Compensatory Unwind Handler
 * Liquidates filled legs on partial or failed multi-leg bundle execution
 * to eliminate unhedged directional exposure and guarantee net delta returns to 0.00.
 */

import { logger } from '../../../shared/utils/logger';
import { MultiTokenPool } from '../pool/multi-token-pool';
import { ArbitrageType, ExecutionLeg, UnwindResult } from '../types/arbitrage-types';

export type UnwindOrderExecutor = (
  outcomeIndex: number,
  action: 'BUY' | 'SELL',
  size: number
) => Promise<{ price: number; filled: number }>;

export interface UnwindOptions {
  opportunityType?: ArbitrageType;
  pool?: MultiTokenPool;
  unwindExecutor?: UnwindOrderExecutor;
  takerFeeBps?: number;
}

export class CompensatoryUnwindHandler {
  public static async unwindPartialFills(
    legs: ExecutionLeg[],
    options?: UnwindOptions
  ): Promise<UnwindResult> {
    if (!legs || legs.length === 0) {
      return {
        unwoundSets: 0, recoveredUsdc: 0, residualLossUsd: 0, completed: true,
        netResidualPositions: [], residualDeltaExposure: 0, postUnwindLegs: [],
      };
    }

    const filledAmounts = legs.map((l) => l.filledSize);
    const qMatched = Math.min(...filledAmounts);
    const isUnderpriced = options?.opportunityType === 'UNDERPRICED_BASKET';
    const feeRate = (options?.takerFeeBps ?? 10) / 10000;
    let [netCashFlow, totalRecovered, allCompleted] = [0, 0, true];

    // Net cash flow: BUY is cash outflow (-), SELL is cash inflow (+)
    for (const leg of legs) {
      netCashFlow += leg.action === 'BUY'
        ? -leg.filledSize * leg.avgFillPrice
        : leg.filledSize * leg.avgFillPrice;
    }

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
      let unwindPrice = leg.avgFillPrice;

      try {
        if (options?.unwindExecutor) {
          const res = await options.unwindExecutor(outcomeIdx, unwindAction, surplus);
          unwindPrice = res.price;
          liquidatedSize = res.filled;
          if (liquidatedSize < surplus) allCompleted = false;
          const delta = unwindAction === 'SELL'
            ? liquidatedSize * unwindPrice * (1 - feeRate)
            : -liquidatedSize * unwindPrice * (1 + feeRate);
          netCashFlow += delta;
          if (unwindAction === 'SELL') totalRecovered += delta;
        } else if (options?.pool) {
          const spot = options.pool.getSpotPrices()[outcomeIdx] ?? leg.avgFillPrice;
          const tradeAmount = unwindAction === 'SELL' ? surplus : surplus * spot;
          const tradeRes = options.pool.executeTrade({
            poolId: options.pool.poolId, outcomeIndex: outcomeIdx, action: unwindAction, amount: tradeAmount,
          });
          unwindPrice = tradeRes.effectivePrice;
          liquidatedSize = surplus;
          if (unwindAction === 'SELL') {
            netCashFlow += tradeRes.outputAmount;
            totalRecovered += tradeRes.outputAmount;
          } else {
            netCashFlow -= tradeRes.inputAmount;
          }
        } else {
          unwindPrice = unwindAction === 'SELL' ? leg.avgFillPrice * 0.98 : leg.avgFillPrice * 1.02;
          liquidatedSize = surplus;
          const delta = unwindAction === 'SELL'
            ? liquidatedSize * unwindPrice * (1 - feeRate)
            : -liquidatedSize * unwindPrice * (1 + feeRate);
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

    const netResidualPositions = postUnwindLegs.map((l) => l.filledSize);
    const maxPos = Math.max(...netResidualPositions);
    const minPos = Math.min(...netResidualPositions);
    const residualDeltaExposure = Math.abs(maxPos - minPos);
    const residualLossUsd = Math.max(0, -netCashFlow);
    const finalCompleted = allCompleted && residualDeltaExposure < 1e-6;

    logger.info('[CompensatoryUnwindHandler] Unwind execution completed', {
      qMatched,
      totalRecovered: Number(totalRecovered.toFixed(4)),
      residualLossUsd: Number(residualLossUsd.toFixed(4)),
      residualDeltaExposure: Number(residualDeltaExposure.toFixed(6)),
      completed: finalCompleted,
    });

    return {
      unwoundSets: qMatched,
      recoveredUsdc: Number(totalRecovered.toFixed(4)),
      residualLossUsd: Number(residualLossUsd.toFixed(4)),
      completed: finalCompleted,
      netResidualPositions,
      residualDeltaExposure: Number(residualDeltaExposure.toFixed(6)),
      postUnwindLegs,
    };
  }

  public static verifyZeroDeltaExposure(legsOrPositions: ExecutionLeg[] | number[]): boolean {
    if (!legsOrPositions || legsOrPositions.length === 0) return true;
    const values = typeof legsOrPositions[0] === 'number'
      ? (legsOrPositions as number[])
      : (legsOrPositions as ExecutionLeg[]).map((l) => l.filledSize);
    return Math.abs(Math.max(...values) - Math.min(...values)) < 1e-6;
  }
}
