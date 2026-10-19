import type {
  Cont2011OrderBookQueuingInput,
  Cont2011OrderBookQueuingOutput,
} from './types';

export class Cont2011OrderBookQueuing {
  /**
   * Cont, Stoikov & Talreja (2010) / Cont & de Larrard (2011) Stochastic Order Book
   * Queuing Model:
   * Evaluates probability that best ask depletes before best bid (up-tick probability)
   * in the heavy-traffic / balanced diffusion limit: P(up) = q_bid / (q_bid + q_ask).
   */
  static evaluate(
    input: Cont2011OrderBookQueuingInput
  ): Cont2011OrderBookQueuingOutput {
    const qBid = Math.max(1e-6, input.bidQueueSizeLots);
    const qAsk = Math.max(1e-6, input.askQueueSizeLots);
    const lambda = Math.max(0, input.limitArrivalRateLambda);
    const mu = Math.max(1e-6, input.marketPlusCancelDepletionRateMu);

    const netDriftRatePerQueue = lambda - mu;
    const totalDepth = qBid + qAsk;
    const queueImbalanceRatio = (qBid - qAsk) / totalDepth;
    const upTickProbability = qBid / totalDepth;
    const expectedMidMoveSign = 2 * upTickProbability - 1;

    const regime =
      upTickProbability >= 0.6
        ? 'UPWARD_PRESSURE'
        : upTickProbability <= 0.4
          ? 'DOWNWARD_PRESSURE'
          : 'BALANCED_SYMMETRIC';

    return {
      netDriftRatePerQueue: Number(netDriftRatePerQueue.toFixed(6)),
      queueImbalanceRatio: Number(queueImbalanceRatio.toFixed(6)),
      upTickProbability: Number(upTickProbability.toFixed(6)),
      expectedMidMoveSign: Number(expectedMidMoveSign.toFixed(6)),
      regime,
    };
  }
}
