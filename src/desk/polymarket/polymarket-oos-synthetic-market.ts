/**
 * Synthetic market snapshot generator for the Polymarket walk-forward OOS
 * evaluator (`POLY-ALPHA-HUNTER-V4` Stage S5).
 *
 * Only the four quantities that actually decide a candidate's outcome are
 * modelled — the two-sided executable ask, the depth behind it, the queue
 * resting ahead of a passive quote, and the Leg-2 rejection probability.
 * Everything else the strategy reads (mid probability, tier depth) is derived
 * from these, so an episode cannot hide a fill behind an unmodelled knob.
 */

import { nextRand, type LinearCongruentialState } from './polymarket-oos-deterministic-rng';

export interface SyntheticMarketSnapshot {
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  yesAskTokens: number;
  noAskTokens: number;
  /** Shares already resting ahead of a passive quote at our chosen level */
  queueAheadShares: number;
  leg2Reject: boolean;
}

/**
 * Builds one episode. `stressed` widens spreads, thins the book, lengthens the
 * queue, and raises both the arb frequency and the Leg-2 rejection rate, so the
 * stressed cohort is a genuinely worse market rather than the same one re-drawn.
 */
export function generateEpisode(rng: LinearCongruentialState, stressed: boolean): SyntheticMarketSnapshot {
  const baseYesMid = 0.35 + nextRand(rng) * 0.30;
  const trueArbOpportunity = nextRand(rng) < (stressed ? 0.18 : 0.28);
  const trueDislocation = trueArbOpportunity
    ? 0.042 + nextRand(rng) * 0.025
    : (nextRand(rng) - 0.35) * 0.032;
  const baseNoMid = Math.max(0.05, Math.min(0.95, 1 - baseYesMid - trueDislocation));
  const halfSpread = (stressed ? 0.011 : 0.006) + nextRand(rng) * 0.008;
  const thinBook = nextRand(rng) < (stressed ? 0.35 : 0.20);
  const displayedTokens = thinBook ? 15 : 200;
  // Queue depth is what actually decides whether a passive fill arrives: tie it to
  // displayed depth so thin books also queue ahead, and keep it far below the
  // default 25-share leg so the simulator regularly clears *and* regularly blocks.
  const queueAheadShares = Math.round(
    4 + nextRand(rng) * (thinBook ? 20 : 60),
  );
  return {
    yesBid: Math.max(0.01, baseYesMid - halfSpread),
    yesAsk: Math.min(0.99, baseYesMid + halfSpread),
    noBid: Math.max(0.01, baseNoMid - halfSpread),
    noAsk: Math.min(0.99, baseNoMid + halfSpread),
    yesAskTokens: displayedTokens,
    noAskTokens: displayedTokens,
    queueAheadShares,
    leg2Reject: nextRand(rng) < (stressed ? 0.16 : 0.05),
  };
}
