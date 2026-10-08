import { LimitOrderPlacement, QueueDynamicsParameters, QueuePositionResult } from './queuepos-types';

export class QueuePriorityEstimator {
  public estimateFillProbability(
    placement: LimitOrderPlacement,
    dynamics: QueueDynamicsParameters,
    timeHorizonSec = 5.0
  ): QueuePositionResult {
    const { orderId, quantity, aheadVolumeInQueue } = placement;
    const { tradeExecutionRatePerSec, cancellationRatePerSec, adverseSelectionProbability } = dynamics;

    // Total queue depletion rate ahead of us = execution depletion + cancellations
    const totalDepletionRatePerSec = tradeExecutionRatePerSec + cancellationRatePerSec;

    let estimatedFillTimeSec = Infinity;
    if (totalDepletionRatePerSec > 0) {
      estimatedFillTimeSec = (aheadVolumeInQueue + quantity * 0.5) / totalDepletionRatePerSec;
    }

    // Cumulative Poisson/Exponential arrival probability of depleting ahead volume within time horizon T
    const lambda = totalDepletionRatePerSec;
    const requiredVolume = aheadVolumeInQueue + quantity;

    // Probability that total depleted volume >= requiredVolume by time T:
    // Approximation via mean depletion: expected depletion = lambda * T
    const expectedDepletion = lambda * timeHorizonSec;
    const z = (expectedDepletion - requiredVolume) / Math.sqrt(Math.max(1.0, expectedDepletion));

    // Standard normal cdf approximation
    const fillProb = this.approxNormalCdf(z);

    const expectedExecutedShares = Math.min(quantity, Math.max(0, (expectedDepletion - aheadVolumeInQueue)));

    const adverseSelectionRiskScore = fillProb * adverseSelectionProbability;

    return {
      orderId,
      initialAheadVolume: aheadVolumeInQueue,
      estimatedFillTimeSec: Number(Math.min(9999, estimatedFillTimeSec).toFixed(2)),
      fillProbabilityWithinHorizon: Number(fillProb.toFixed(4)),
      expectedExecutedShares: Number(expectedExecutedShares.toFixed(2)),
      adverseSelectionRiskScore: Number(adverseSelectionRiskScore.toFixed(4)),
    };
  }

  private approxNormalCdf(x: number): number {
    return 1.0 / (1.0 + Math.exp(-1.702 * x));
  }
}
