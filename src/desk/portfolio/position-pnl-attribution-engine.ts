/**
 * Position PnL Attribution Engine
 *
 * Breaks down portfolio performance into discrete economic components:
 * directional alpha, market-maker spread capture, and fee friction.
 *
 * @module desk/portfolio/position-pnl-attribution-engine
 */

import type {
  PositionAttributionInput,
  PnLAttributionBreakdown,
} from './position-pnl-attribution-types';

export class PositionPnLAttributionEngine {
  public computeAttribution(input: PositionAttributionInput): PnLAttributionBreakdown {
    const costBasisUsd = input.quantity * input.entryPrice;
    const currentValueUsd = input.quantity * input.exitOrMarkPrice;
    const totalGrossPnLUsd = currentValueUsd - costBasisUsd;

    const spreadCaptured = input.spreadCapturedPerUnit ?? 0;
    const spreadPnLUsd = input.quantity * spreadCaptured;
    const alphaPnLUsd = totalGrossPnLUsd - spreadPnLUsd;

    const totalNetPnLUsd = totalGrossPnLUsd - input.feesPaidUsd;
    const returnOnCostPct = costBasisUsd > 0 ? (totalNetPnLUsd / costBasisUsd) * 100 : 0;

    return {
      positionId: input.positionId,
      totalGrossPnLUsd: Math.round(totalGrossPnLUsd * 100) / 100,
      totalNetPnLUsd: Math.round(totalNetPnLUsd * 100) / 100,
      alphaPnLUsd: Math.round(alphaPnLUsd * 100) / 100,
      spreadPnLUsd: Math.round(spreadPnLUsd * 100) / 100,
      feeFrictionUsd: Math.round(input.feesPaidUsd * 100) / 100,
      returnOnCostPct: Math.round(returnOnCostPct * 100) / 100,
    };
  }

  public aggregatePortfolio(attributions: readonly PnLAttributionBreakdown[]): {
    totalNetPnLUsd: number;
    totalAlphaPnLUsd: number;
    totalSpreadPnLUsd: number;
    totalFeeFrictionUsd: number;
  } {
    let totalNet = 0;
    let totalAlpha = 0;
    let totalSpread = 0;
    let totalFees = 0;

    for (const a of attributions) {
      totalNet += a.totalNetPnLUsd;
      totalAlpha += a.alphaPnLUsd;
      totalSpread += a.spreadPnLUsd;
      totalFees += a.feeFrictionUsd;
    }

    return {
      totalNetPnLUsd: Math.round(totalNet * 100) / 100,
      totalAlphaPnLUsd: Math.round(totalAlpha * 100) / 100,
      totalSpreadPnLUsd: Math.round(totalSpread * 100) / 100,
      totalFeeFrictionUsd: Math.round(totalFees * 100) / 100,
    };
  }
}
