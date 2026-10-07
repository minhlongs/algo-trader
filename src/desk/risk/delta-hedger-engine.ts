/**
 * Automated Prediction Market Delta Hedger
 *
 * Evaluates binary outcome directional delta and produces rebalancing
 * hedge orders when exposure breaches the risk tolerance boundary.
 *
 * @module desk/risk/delta-hedger-engine
 */

import { randomUUID } from 'crypto';
import type {
  DeltaExposureSummary,
  HedgeOrderAction,
  MarketPosition,
} from './delta-hedger-types';

export class DeltaHedgerEngine {
  private readonly toleranceDelta: number;
  private readonly maxOrderSize: number;

  constructor(options?: { toleranceDelta?: number; maxOrderSize?: number }) {
    this.toleranceDelta = options?.toleranceDelta ?? 50; // delta units
    this.maxOrderSize = options?.maxOrderSize ?? 10000;
  }

  public calculateDelta(positions: readonly MarketPosition[]): DeltaExposureSummary {
    let netDelta = 0;
    let grossNotional = 0;

    for (const pos of positions) {
      grossNotional += pos.quantity * pos.currentPrice;
      const prob = Math.min(1, Math.max(0, pos.impliedProbability));
      if (pos.side === 'YES') {
        netDelta += pos.quantity * prob;
      } else {
        netDelta -= pos.quantity * (1 - prob);
      }
    }

    const isNeutral = Math.abs(netDelta) <= this.toleranceDelta;
    let requiredHedgeQuantity = 0;
    let recommendedHedgeSide: DeltaExposureSummary['recommendedHedgeSide'] = 'NONE';

    if (!isNeutral) {
      requiredHedgeQuantity = Math.abs(netDelta);
      if (netDelta > 0) {
        // Portfolio is long delta -> sell YES or buy NO
        recommendedHedgeSide = 'BUY_NO';
      } else {
        // Portfolio is short delta -> buy YES or sell NO
        recommendedHedgeSide = 'BUY_YES';
      }
    }

    return {
      netDelta,
      grossNotional,
      toleranceThreshold: this.toleranceDelta,
      isNeutral,
      requiredHedgeQuantity,
      recommendedHedgeSide,
    };
  }

  public generateHedgeAction(
    positions: readonly MarketPosition[],
    referencePrice: number
  ): HedgeOrderAction | null {
    const summary = this.calculateDelta(positions);
    if (summary.isNeutral || summary.requiredHedgeQuantity <= 0) {
      return null;
    }

    const clampedQuantity = Math.min(summary.requiredHedgeQuantity, this.maxOrderSize);
    const urgency = Math.abs(summary.netDelta) > this.toleranceDelta * 2 ? 'IMMEDIATE' : 'PASSIVE';

    const symbol = positions[0]?.symbol || 'PRED-MKT';

    if (summary.recommendedHedgeSide === 'BUY_NO') {
      return {
        actionId: `hedge-${randomUUID()}`,
        symbol,
        side: 'BUY',
        outcome: 'NO',
        targetQuantity: clampedQuantity,
        limitPrice: Math.min(1, Math.max(0, 1 - referencePrice)),
        urgency,
      };
    }

    return {
      actionId: `hedge-${randomUUID()}`,
      symbol,
      side: 'BUY',
      outcome: 'YES',
      targetQuantity: clampedQuantity,
      limitPrice: Math.min(1, Math.max(0, referencePrice)),
      urgency,
    };
  }
}
