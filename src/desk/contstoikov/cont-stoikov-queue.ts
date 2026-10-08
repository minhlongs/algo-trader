import { ContStoikovRates } from './cont-stoikov-types';

export class ContStoikovQueue {
  /**
   * Calculates the absorption probability of a queue order getting executed
   * before the queue depletes or moves away in a continuous-time birth-death Markov chain.
   * State k represents the number of orders ahead of the trader (k = 0 means at the front).
   */
  public static calculateAbsorptionProbability(
    position: number,
    depth: number,
    rates: ContStoikovRates
  ): { prob: number; expectedTime: number } {
    const { orderCancelRate: theta, marketExecutionRate: mu } = rates;

    if (position <= 0 || depth <= 0) {
      throw new Error('Position and depth must be strictly positive');
    }
    if (position > depth) {
      throw new Error('Position cannot exceed total queue depth');
    }

    // Number of contracts ahead of our order: k = position - 1
    const ordersAhead = position - 1;
    if (ordersAhead === 0) {
      const execRate = mu;
      const totalRate = mu + theta;
      const prob = totalRate > 0 ? execRate / totalRate : 1.0;
      const expectedTime = totalRate > 0 ? 1.0 / totalRate : 0.0;
      return { prob, expectedTime };
    }

    // Iterative Markovian progression for Birth-Death queue
    // For each position ahead, rate of moving forward is (mu + i * theta)
    let totalExpectedTime = 0.0;
    let cumulativeProb = 1.0;

    for (let i = ordersAhead; i >= 0; i--) {
      const serviceRate = mu + i * theta;
      if (serviceRate <= 0) continue;
      const stepTime = 1.0 / serviceRate;
      totalExpectedTime += stepTime;
      // Prob of execution vs cancellation of entire ahead queue
      const probStep = mu / (mu + Math.max(1e-6, i * theta));
      cumulativeProb *= probStep;
    }

    return {
      prob: Math.min(1.0, Math.max(0.0, cumulativeProb)),
      expectedTime: totalExpectedTime,
    };
  }
}
