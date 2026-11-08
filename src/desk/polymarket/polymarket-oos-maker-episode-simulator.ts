/**
 * Log-Odds Avellaneda-Stoikov maker episode simulator for the Polymarket
 * walk-forward OOS evaluator (`POLY-ALPHA-HUNTER-V4` Stage S5, Strategy 5).
 *
 * A passive maker only books a fill when (a) the book shows enough depth for a
 * full pair, (b) its own minimum net spread clears, and (c) the conservative queue
 * simulation says the queue ahead of it actually clears this episode. The fill is
 * then partial: it is capped by the queue simulator, never by the requested leg.
 *
 * The decisive cost is adverse selection. A maker that fills has by definition
 * just absorbed the informed side of the trade, so the mid it filled against moves
 * against it by the realized drift since the quote was posted. Without this term
 * the maker books only spread + rebate and mathematically cannot lose.
 */

import type { PolymarketCategory } from './polymarket-fee-calculator';
import { calcMakerRebateV2, calcQuadraticTakerFeeRateV2 } from './polymarket-fee-calculator';
import {
  advanceConservativeMakerQueue,
  LogOddsAvellanedaStoikovMarketMaker,
} from './log-odds-avellaneda-stoikov-mm';
import type { SyntheticMarketSnapshot } from './polymarket-oos-synthetic-market';
import { nextRand, type LinearCongruentialState } from './polymarket-oos-deterministic-rng';

/** One simulated episode outcome shared by every walk-forward candidate. */
export interface EpisodeOutcome {
  traded: boolean;
  grossPnl: number;
  fees: number;
  unwindLoss: number;
  netPnl: number;
}

const LOG_ODDS_MM = new LogOddsAvellanedaStoikovMarketMaker();

export function simulateMakerEpisode(
  snap: SyntheticMarketSnapshot,
  pairCount: number,
  minNetSpread: number,
  category: PolymarketCategory,
  candidateRng: LinearCongruentialState,
): EpisodeOutcome {
  const noTrade: EpisodeOutcome = { traded: false, grossPnl: 0, fees: 0, unwindLoss: 0, netPnl: 0 };
  if (snap.yesAskTokens < pairCount || snap.noAskTokens < pairCount) return noTrade;

  const yesMid = (snap.yesBid + snap.yesAsk) / 2;
  const quote = LOG_ODDS_MM.quotePair({
    midProbability: yesMid, yangZhangVarianceDaily: 0.04, inventoryShares: 0, ofiNormalized: 0.10, currentVpin: 0.25,
  });
  if (quote.halfSpreadProbability * 2 < minNetSpread) return noTrade;

  // Trades that clear the level ahead of us at this price point, from the snapshot:
  // deep books churn enough volume to reach our resting quote, thin ones mostly do not.
  const levelTradeShares = Math.round(
    snap.yesAskTokens * 0.08 + nextRand(candidateRng) * snap.yesAskTokens * 0.22,
  );
  // Batch cancels clear the queue ahead of us by at most the conservative progress ratio.
  const queueSim = advanceConservativeMakerQueue(
    snap.queueAheadShares, levelTradeShares, Math.round(snap.yesAskTokens * 0.15), 0.20,
  );
  if (!queueSim.queueClearedForOurFill || queueSim.filledShares < 1) return noTrade;

  const filledLegs = Math.min(pairCount, queueSim.filledShares);
  const rebate = calcMakerRebateV2(category, yesMid, filledLegs * 2);
  const spreadCapture = filledLegs * (quote.askProbability - quote.bidProbability) * 0.35;
  const feeRateYes = calcQuadraticTakerFeeRateV2(category, snap.yesAsk);
  // Slightly biased downward (0.48 rather than 0.50): a resting quote is
  // disproportionately hit by the informed side, so adverse selection costs more
  // than the drift it wins back.
  const adverseDrift = (nextRand(candidateRng) - 0.48) * 0.06 * 1.25;
  const filledBidProb = quote.bidProbability + adverseDrift;
  const inventoryResidual = filledLegs * (filledBidProb - quote.bidProbability);

  if (snap.leg2Reject) {
    // The resting leg fills and the other side does not: residual stock is bought
    // back across the book at the bid, paying the taker fee on the way out.
    const unwindFees = filledLegs * Math.max(0, filledBidProb) * feeRateYes;
    return {
      traded: true,
      grossPnl: spreadCapture + rebate,
      fees: unwindFees,
      unwindLoss: Math.max(0, -inventoryResidual),
      netPnl: spreadCapture + rebate - unwindFees + inventoryResidual,
    };
  }
  return {
    traded: true, grossPnl: spreadCapture + rebate, fees: 0, unwindLoss: 0,
    netPnl: spreadCapture + rebate - Math.max(0, inventoryResidual),
  };
}
