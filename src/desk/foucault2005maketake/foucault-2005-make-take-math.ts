import { Foucault2005MakeTakeInput, Foucault2005MakeTakeOutput } from './types';

/**
 * Wave 329: Foucault, Kadan & Kandel (2005) Limit Order Book as a Market for Liquidity.
 * Computes equilibrium make-vs-take cutoff spread, expected waiting cost, and book resiliency.
 */
export class FoucaultKadanKandel2005MakeTake {
  public evaluate(input: Foucault2005MakeTakeInput): Foucault2005MakeTakeOutput {
    const lambda = Math.max(1e-4, input.orderArrivalRatePerSec);
    const delta = Math.max(0, input.waitingCostBpsPerSec);
    const theta = Math.min(0.99, Math.max(0.01, input.proportionPatientTraders));
    const tick = Math.max(0.01, input.tickSizeBps);

    const effectiveTakeProb = Math.max(0.05, 1 - theta * 0.65);
    const expectedTimeToFillSec = Number((1 / (lambda * effectiveTakeProb)).toFixed(4));
    const expectedWaitingCostBps = Number((delta * expectedTimeToFillSec).toFixed(4));

    const feeWedgeBps = input.takerFeeBps + input.makerRebateBps;
    const cutoffSpreadBps = Number(
      Math.max(tick, expectedWaitingCostBps + tick - feeWedgeBps).toFixed(4),
    );
    const netMakeAdvantageBps = Number(
      (input.currentSpreadBps - cutoffSpreadBps).toFixed(4),
    );
    const resiliencyRatePerSec = Number((lambda * theta).toFixed(4));

    const optimalAction =
      netMakeAdvantageBps >= tick
        ? 'LIMIT_MAKE_IMPROVE'
        : netMakeAdvantageBps >= 0
          ? 'LIMIT_MAKE_JOIN'
          : 'MARKET_TAKE_IMMEDIATE';

    return {
      cutoffSpreadBps,
      expectedTimeToFillSec,
      expectedWaitingCostBps,
      netMakeAdvantageBps,
      resiliencyRatePerSec,
      optimalAction,
    };
  }
}
