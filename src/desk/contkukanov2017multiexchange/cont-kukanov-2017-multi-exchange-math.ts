import {
  ContKukanov2017Input,
  ContKukanov2017Output,
  VenueAllocationSlice,
} from './types';

function normalCdfApprox(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-0.5 * z * z);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + 1.330274429 * t))));
  return z >= 0 ? 1 - p : p;
}

/**
 * Wave 327: Cont & Kukanov (2017) Optimal Order Placement Across Multiple Exchanges.
 * Solves marginal fill probability conditions across heterogeneous fee/rebate venues.
 */
export class ContKukanov2017MultiExchange {
  public evaluate(input: ContKukanov2017Input): ContKukanov2017Output {
    const Q = Math.max(1e-6, input.targetQuantity);
    const lambdaU = Math.max(0.1, input.underfillPenaltyBps);
    const lambdaO = Math.max(0.1, input.overfillPenaltyBps);
    const targetTailProb = lambdaO / (lambdaU + lambdaO);

    const rawScores = input.venues.map((v) => {
      const std = Math.max(1e-6, v.expectedOutflowStd);
      const zFill = (v.expectedOutflowMean - v.queueDepthUnits) / std;
      const baseFillProb = Math.min(0.999, Math.max(0.001, normalCdfApprox(zFill)));
      const feeAdvantageBps = v.halfSpreadBps + v.takerFeeBps + v.makerRebateBps;
      const score = Math.max(0.01, baseFillProb * Math.max(0.1, feeAdvantageBps));
      return { venue: v, baseFillProb, feeAdvantageBps, score };
    });

    const scoreSum = rawScores.reduce((acc, item) => acc + item.score, 0) || 1;
    const overAllocationFactor = 1 + Math.max(0, 0.5 - targetTailProb) * 0.25;
    const totalLimitPool = Q * overAllocationFactor;

    const allocations: VenueAllocationSlice[] = rawScores.map((item) => {
      const limitAllocationUnits = Number(((totalLimitPool * item.score) / scoreSum).toFixed(4));
      const std = Math.max(1e-6, item.venue.expectedOutflowStd);
      const zEffective =
        (item.venue.expectedOutflowMean -
          (item.venue.queueDepthUnits + 0.5 * limitAllocationUnits)) /
        std;
      const fillProbability = Number(
        Math.min(0.999, Math.max(0.001, normalCdfApprox(zEffective))).toFixed(6),
      );
      const expectedNetFeeBps = Number(
        (
          -fillProbability * item.venue.makerRebateBps +
          (1 - fillProbability) * item.venue.takerFeeBps
        ).toFixed(4),
      );
      return {
        venueId: item.venue.venueId,
        limitAllocationUnits,
        fillProbability,
        expectedNetFeeBps,
      };
    });

    const totalAllocatedUnits = Number(
      allocations.reduce((s, a) => s + a.limitAllocationUnits, 0).toFixed(4),
    );
    const weightedFillProbability = Number(
      (
        allocations.reduce((s, a) => s + a.limitAllocationUnits * a.fillProbability, 0) /
        Math.max(1e-6, totalAllocatedUnits)
      ).toFixed(6),
    );
    const marketSweepReserveUnits = Number(
      Math.max(0, Q - totalAllocatedUnits * weightedFillProbability).toFixed(4),
    );
    const expectedExecutionSavingsBps = Number(
      rawScores
        .reduce(
          (s, item, idx) =>
            s +
            (allocations[idx].limitAllocationUnits / Math.max(1e-6, totalAllocatedUnits)) *
              allocations[idx].fillProbability *
              item.feeAdvantageBps,
          0,
        )
        .toFixed(4),
    );

    const routingRegime =
      weightedFillProbability >= 0.75
        ? 'PASSIVE_MULTI_VENUE'
        : weightedFillProbability >= 0.4
          ? 'HYBRID_LIT_SWEEP'
          : 'URGENT_TAKER_SWEEP';

    return {
      allocations,
      totalAllocatedUnits,
      marketSweepReserveUnits,
      weightedFillProbability,
      expectedExecutionSavingsBps,
      routingRegime,
    };
  }
}
