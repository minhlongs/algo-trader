/**
 * Taker arbitrage episode simulators for the Polymarket walk-forward OOS
 * evaluator (`POLY-ALPHA-HUNTER-V4` Stage S5, candidates 1-3).
 *
 * `naive_mid_arber` prices the pair off mid prices and so assumes the mid is
 * executable — it is the deliberately wrong baseline. `executable_ask_fee_arber`
 * prices the pair at the displayed asks and subtracts both taker fees before
 * sizing, and pays the visible-ask penalty when the book is thinner than the leg.
 */

import { calcTakerFee, type PolymarketCategory } from './polymarket-fee-calculator';
import type { SyntheticMarketSnapshot } from './polymarket-oos-synthetic-market';
import type { EpisodeOutcome } from './polymarket-oos-maker-episode-simulator';

const NO_TRADE: EpisodeOutcome = { traded: false, grossPnl: 0, fees: 0, unwindLoss: 0, netPnl: 0 };

/**
 * The naive baseline: quote off mids, assume the whole leg lifts the displayed ask.
 * Used to show what naive mid-quoting flatters away — it books an edge the
 * executable spread and the taker fee both erase.
 */
export function simulateNaiveArbEpisode(
  snap: SyntheticMarketSnapshot,
  pairCount: number,
  category: PolymarketCategory,
): EpisodeOutcome {
  const yesMid = (snap.yesBid + snap.yesAsk) / 2;
  const noMid = (snap.noBid + snap.noAsk) / 2;
  if (yesMid + noMid >= 0.985) return NO_TRADE;
  const execYesAsk = snap.yesAskTokens >= pairCount ? snap.yesAsk : snap.yesAsk + 0.015;
  const execNoAsk = snap.noAskTokens >= pairCount ? snap.noAsk : snap.noAsk + 0.015;
  const feeYes = pairCount * execYesAsk * calcTakerFee(category, snap.yesAsk);
  if (snap.leg2Reject) {
    const unwindLoss = pairCount * (execYesAsk - snap.yesBid);
    const fees = feeYes + pairCount * snap.yesBid * calcTakerFee(category, snap.yesAsk);
    return { traded: true, grossPnl: 0, fees, unwindLoss, netPnl: -unwindLoss - fees };
  }
  const grossPnl = pairCount * (1 - (execYesAsk + execNoAsk));
  const fees = feeYes + pairCount * execNoAsk * calcTakerFee(category, snap.noAsk);
  return { traded: true, grossPnl, fees, unwindLoss: 0, netPnl: grossPnl - fees };
}

/**
 * The fee-aware taker: size on the executable ask spread net of both taker fees,
 * and reject the episode when the net edge falls under the configured floor.
 */
export function simulateExecutableAskFeeArbEpisode(
  snap: SyntheticMarketSnapshot,
  pairCount: number,
  minNetSpread: number,
  category: PolymarketCategory,
): EpisodeOutcome {
  if (snap.yesAskTokens < pairCount || snap.noAskTokens < pairCount) return NO_TRADE;
  const combinedAsk = snap.yesAsk + snap.noAsk;
  const estFeePerPair = snap.yesAsk * calcTakerFee(category, snap.yesAsk)
    + snap.noAsk * calcTakerFee(category, snap.noAsk);
  if (1 - combinedAsk - estFeePerPair < minNetSpread) return NO_TRADE;

  const feeYes = pairCount * snap.yesAsk * calcTakerFee(category, snap.yesAsk);
  if (snap.leg2Reject) {
    const unwindLoss = pairCount * (snap.yesAsk - snap.yesBid);
    const fees = feeYes + pairCount * snap.yesBid * calcTakerFee(category, snap.yesAsk);
    return { traded: true, grossPnl: 0, fees, unwindLoss, netPnl: -unwindLoss - fees };
  }
  const grossPnl = pairCount * (1 - combinedAsk);
  const fees = feeYes + pairCount * snap.noAsk * calcTakerFee(category, snap.noAsk);
  return { traded: true, grossPnl, fees, unwindLoss: 0, netPnl: grossPnl - fees };
}
