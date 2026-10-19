import type {
  Lehalle2019AdverseSelectionInput,
  Lehalle2019AdverseSelectionOutput,
} from './types';

export class Lehalle2019AdverseSelection {
  /**
   * Lehalle & Mounjid (2019) Limit Order Strategic Placement with Adverse Selection
   * in a Queue-Reactive LOB:
   * Evaluates sweep-induced adverse selection cost vs earned half-spread.
   */
  static evaluate(
    input: Lehalle2019AdverseSelectionInput
  ): Lehalle2019AdverseSelectionOutput {
    const halfSpread = Math.max(0, input.halfSpreadTicks);
    const mu = Math.max(0, input.cancelRatePerSecMu);
    const lambda = Math.max(0, input.marketSweepRatePerSecLambda);
    const postMove = Math.max(0, input.postDepletionMidMoveTicks);
    const holdCost = Math.max(0, input.queueHoldingCostTicks);

    const totalDepletionRate = Math.max(1e-9, mu + lambda);
    const sweepFillProbability = lambda / totalDepletionRate;
    const expectedAdverseSelectionTicks = sweepFillProbability * postMove;
    const netQueueValueTicks =
      halfSpread - expectedAdverseSelectionTicks - holdCost;

    const regime =
      netQueueValueTicks > 0.1
        ? 'POSITIVE_QUEUE_VALUE'
        : netQueueValueTicks < -0.05
          ? 'TOXIC_CANCEL_IMMEDIATELY'
          : 'NEUTRAL_MARGINAL';

    return {
      sweepFillProbability: Number(sweepFillProbability.toFixed(6)),
      expectedAdverseSelectionTicks: Number(
        expectedAdverseSelectionTicks.toFixed(6)
      ),
      netQueueValueTicks: Number(netQueueValueTicks.toFixed(6)),
      regime,
    };
  }
}
