/**
 * Queue Position & Fill Simulator
 * Computes probabilistic fills accounting for queue priority and transit latency jitter.
 *
 * @module desk/simulation/queue-fill-simulator
 */

import type {
  LatencyJitterConfig,
  PassiveOrderContext,
  QueueFillEstimate,
} from './queue-fill-simulator-types';

export class QueueFillSimulator {
  private readonly meanLatencyMs: number;
  private readonly stdDevLatencyMs: number;
  private readonly cancellationRatePerSec: number;

  public constructor(config: LatencyJitterConfig) {
    this.meanLatencyMs = Math.max(1, config.meanLatencyMs);
    this.stdDevLatencyMs = Math.max(0.1, config.stdDevLatencyMs);
    this.cancellationRatePerSec = config.cancellationRatePerSec ?? 0.20; // 20% cancellation rate default
  }

  public simulateFill(order: PassiveOrderContext, horizonMs: number = 5000): QueueFillEstimate {
    // 1. Generate deterministic pseudo-jitter for transit latency
    const transitLatency = this.sampleTransitLatency(order.orderId);

    // 2. Adjust volume ahead for stochastic order cancellations ahead in queue
    const horizonSec = horizonMs / 1000;
    const cancelFactor = Math.exp(-this.cancellationRatePerSec * horizonSec);
    const effectiveVolAhead = order.volumeAhead * cancelFactor;

    // 3. Expected depletion rate via incoming trades
    const tradeDepletionPerSec = Math.max(1, order.historicalTradeRatePerSec);
    const expectedTimeToDepleteSec = effectiveVolAhead / tradeDepletionPerSec;
    const estimatedWaitTimeMs = Math.round(expectedTimeToDepleteSec * 1000 + transitLatency);

    // 4. Probability of fill within the horizon
    let fillProbability = 0;
    if (horizonMs > transitLatency) {
      const netHorizonSec = (horizonMs - transitLatency) / 1000;
      const expectedTradesInHorizon = tradeDepletionPerSec * netHorizonSec;
      if (effectiveVolAhead <= 0) {
        fillProbability = 1.0;
      } else {
        // CDF approximation of Poisson / Exponential arrival
        const lambdaRatio = expectedTradesInHorizon / Math.max(1, effectiveVolAhead);
        fillProbability = Math.max(0, Math.min(1.0, 1.0 - Math.exp(-lambdaRatio)));
      }
    }

    const isLikelyFilled = fillProbability >= 0.70 && estimatedWaitTimeMs <= horizonMs;

    return {
      queuePositionAhead: Math.round(effectiveVolAhead),
      estimatedWaitTimeMs,
      fillProbability: Math.round(fillProbability * 1000) / 1000,
      simulatedTransitLatencyMs: Math.round(transitLatency * 100) / 100,
      isLikelyFilled,
    };
  }

  private sampleTransitLatency(seedKey: string): number {
    // Deterministic hash-based normal distribution sample
    let hash = 0;
    for (let i = 0; i < seedKey.length; i++) {
      hash = (hash << 5) - hash + seedKey.charCodeAt(i);
      hash |= 0;
    }
    const u1 = Math.max(1e-6, Math.abs((hash % 1000) / 1000));
    const u2 = Math.max(1e-6, Math.abs(((hash >> 3) % 1000) / 1000));

    // Box-Muller transform
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const sample = this.meanLatencyMs + z * this.stdDevLatencyMs;
    return Math.max(1.0, sample);
  }
}
