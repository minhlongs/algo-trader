import { ContStoikovQueue } from './cont-stoikov-queue';
import {
  ContStoikovFillProbability,
  ContStoikovQueueState,
  ContStoikovRates,
} from './cont-stoikov-types';

export class ContStoikovEngine {
  public estimateFillProbability(
    state: ContStoikovQueueState,
    rates: ContStoikovRates
  ): ContStoikovFillProbability {
    const { queuePosition, queueDepth } = state;
    const { orderArrivalRate, orderCancelRate, marketExecutionRate } = rates;

    if (orderArrivalRate < 0 || orderCancelRate < 0 || marketExecutionRate <= 0) {
      throw new Error('Rates must be non-negative and execution rate must be strictly positive');
    }

    const { prob, expectedTime } = ContStoikovQueue.calculateAbsorptionProbability(
      queuePosition,
      queueDepth,
      rates
    );

    return {
      fillProbability: Number(prob.toFixed(4)),
      expectedTimeSec: Number(expectedTime.toFixed(4)),
      queuePosition,
      queueDepth,
    };
  }
}
