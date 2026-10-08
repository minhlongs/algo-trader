import { describe, it, expect } from 'vitest';
import { QueuePriorityEstimator } from '../../../../src/desk/queuepos/queue-priority-estimator';
import { LimitOrderPlacement, QueueDynamicsParameters } from '../../../../src/desk/queuepos/queuepos-types';

describe('LOB Queue Priority & Fill Probability Desk Suite', () => {
  it('estimates higher fill probability and lower fill time when placed closer to the front', () => {
    const estimator = new QueuePriorityEstimator();

    const dynamics: QueueDynamicsParameters = {
      tradeExecutionRatePerSec: 100, // 100 shares/sec executed
      cancellationRatePerSec: 50,    // 50 shares/sec cancelled
      adverseSelectionProbability: 0.20,
    };

    const frontPlacement: LimitOrderPlacement = {
      orderId: 'ORD_FRONT',
      price: 150.00,
      quantity: 100,
      side: 'BUY',
      aheadVolumeInQueue: 100, // Only 100 shares ahead
    };

    const deepPlacement: LimitOrderPlacement = {
      orderId: 'ORD_DEEP',
      price: 150.00,
      quantity: 100,
      side: 'BUY',
      aheadVolumeInQueue: 2000, // 2,000 shares ahead
    };

    const frontRes = estimator.estimateFillProbability(frontPlacement, dynamics, 5.0);
    const deepRes = estimator.estimateFillProbability(deepPlacement, dynamics, 5.0);

    expect(frontRes.fillProbabilityWithinHorizon).toBeGreaterThan(deepRes.fillProbabilityWithinHorizon);
    expect(frontRes.estimatedFillTimeSec).toBeLessThan(deepRes.estimatedFillTimeSec);
    expect(frontRes.expectedExecutedShares).toBeGreaterThan(deepRes.expectedExecutedShares);
  });
});
