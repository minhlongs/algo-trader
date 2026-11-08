/**
 * Polymarket Walk-Forward Out-of-Sample (OOS) & Stress Evaluator (Stage S5 + CLOB V2)
 *
 * Deterministic walk-forward protocol (70% in-sample, 30% out-of-sample + stressed regime)
 * incorporating executable ask spread, category-aware taker fees (`calcTakerFee`),
 * CLOB V2 maker rebate (`calcMakerRebateV2`), Log-Odds A-S quoting (`log_odds_maker_mm_v2`),
 * top-of-book depth constraints, and Leg-2 rejection unwind slippage risk.
 */

import { calcMakerRebateV2, calcTakerFee, type PolymarketCategory } from './polymarket-fee-calculator';
import {
  advanceConservativeMakerQueue,
  LogOddsAvellanedaStoikovMarketMaker,
} from './log-odds-avellaneda-stoikov-mm';

export interface WalkForwardConfig {
  seed: number;
  episodes: number;
  inSampleFraction?: number;
  legSizeUsdc?: number;
  minNetSpread?: number;
  category?: PolymarketCategory;
}

export type CandidateId =
  | 'no_trade_baseline'
  | 'naive_mid_arb'
  | 'executable_ask_fee_arb'
  | 'log_odds_maker_mm_v2';

export interface CandidateEvaluationMetrics {
  candidateId: CandidateId;
  inSampleTrades: number;
  inSampleNetPnlUsdc: number;
  oosTrades: number;
  oosGrossPnlUsdc: number;
  oosFeesUsdc: number;
  oosLegUnwindLossUsdc: number;
  oosNetPnlUsdc: number;
  oosWinRate: number;
  stressedNetPnlUsdc: number;
}

export interface WalkForwardEvaluationReport {
  seed: number;
  episodes: number;
  inSampleCount: number;
  outOfSampleCount: number;
  category: PolymarketCategory;
  candidates: Record<CandidateId, CandidateEvaluationMetrics>;
}

interface SyntheticMarketSnapshot {
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  yesAskTokens: number;
  noAskTokens: number;
  leg2Reject: boolean;
}

const LOG_ODDS_MM = new LogOddsAvellanedaStoikovMarketMaker();

function nextRand(state: { s: number }): number {
  state.s = (state.s * 1664525 + 1013904223) >>> 0;
  return state.s / 0x100000000;
}

function generateEpisode(rng: { s: number }, stressed: boolean): SyntheticMarketSnapshot {
  const baseYesMid = 0.35 + nextRand(rng) * 0.30;
  const trueArbOpportunity = nextRand(rng) < (stressed ? 0.18 : 0.28);
  const trueDislocation = trueArbOpportunity
    ? 0.042 + nextRand(rng) * 0.025
    : (nextRand(rng) - 0.35) * 0.032;
  const baseNoMid = Math.max(0.05, Math.min(0.95, 1 - baseYesMid - trueDislocation));
  const halfSpread = (stressed ? 0.011 : 0.006) + nextRand(rng) * 0.008;
  const thinBook = nextRand(rng) < (stressed ? 0.35 : 0.20);
  return {
    yesBid: Math.max(0.01, baseYesMid - halfSpread),
    yesAsk: Math.min(0.99, baseYesMid + halfSpread),
    noBid: Math.max(0.01, baseNoMid - halfSpread),
    noAsk: Math.min(0.99, baseNoMid + halfSpread),
    yesAskTokens: thinBook ? 15 : 200,
    noAskTokens: thinBook ? 15 : 200,
    leg2Reject: nextRand(rng) < (stressed ? 0.16 : 0.05),
  };
}

function simulateEpisode(
  snap: SyntheticMarketSnapshot,
  candidateId: CandidateId,
  pairCount: number,
  minNetSpread: number,
  category: PolymarketCategory,
): { traded: boolean; grossPnl: number; fees: number; unwindLoss: number; netPnl: number } {
  if (candidateId === 'no_trade_baseline') return { traded: false, grossPnl: 0, fees: 0, unwindLoss: 0, netPnl: 0 };
  const feeRateYes = calcTakerFee(category, snap.yesAsk);
  const feeRateNo = calcTakerFee(category, snap.noAsk);

  if (candidateId === 'log_odds_maker_mm_v2') {
    if (snap.yesAskTokens < pairCount || snap.noAskTokens < pairCount || snap.leg2Reject) {
      return { traded: false, grossPnl: 0, fees: 0, unwindLoss: 0, netPnl: 0 };
    }
    const yesMid = (snap.yesBid + snap.yesAsk) / 2;
    const quote = LOG_ODDS_MM.quotePair({
      midProbability: yesMid, yangZhangVarianceDaily: 0.04, inventoryShares: 0, ofiNormalized: 0.10, currentVpin: 0.25,
    });
    const queueSim = advanceConservativeMakerQueue(20, pairCount + 16, 20, 0.20);
    if (!queueSim.queueClearedForOurFill || quote.halfSpreadProbability * 2 < minNetSpread) {
      return { traded: false, grossPnl: 0, fees: 0, unwindLoss: 0, netPnl: 0 };
    }
    const filled = Math.min(pairCount, queueSim.filledShares);
    const rebate = calcMakerRebateV2(category, yesMid, filled * 2);
    const grossPnl = filled * (quote.askProbability - quote.bidProbability) * 0.35 + rebate;
    return { traded: true, grossPnl, fees: 0, unwindLoss: 0, netPnl: grossPnl };
  }

  if (candidateId === 'naive_mid_arb') {
    const yesMid = (snap.yesBid + snap.yesAsk) / 2;
    const noMid = (snap.noBid + snap.noAsk) / 2;
    if (yesMid + noMid >= 0.985) return { traded: false, grossPnl: 0, fees: 0, unwindLoss: 0, netPnl: 0 };
    const execYesAsk = snap.yesAskTokens >= pairCount ? snap.yesAsk : snap.yesAsk + 0.015;
    const execNoAsk = snap.noAskTokens >= pairCount ? snap.noAsk : snap.noAsk + 0.015;
    const feeYes = pairCount * execYesAsk * feeRateYes;
    if (snap.leg2Reject) {
      const unwindLoss = pairCount * (execYesAsk - snap.yesBid);
      const fees = feeYes + pairCount * snap.yesBid * feeRateYes;
      return { traded: true, grossPnl: 0, fees, unwindLoss, netPnl: -unwindLoss - fees };
    }
    const grossPnl = pairCount * (1 - (execYesAsk + execNoAsk));
    const fees = feeYes + pairCount * execNoAsk * feeRateNo;
    return { traded: true, grossPnl, fees, unwindLoss: 0, netPnl: grossPnl - fees };
  }

  if (snap.yesAskTokens < pairCount || snap.noAskTokens < pairCount) {
    return { traded: false, grossPnl: 0, fees: 0, unwindLoss: 0, netPnl: 0 };
  }
  const combinedAsk = snap.yesAsk + snap.noAsk;
  const estFeePerPair = snap.yesAsk * feeRateYes + snap.noAsk * feeRateNo;
  if (1 - combinedAsk - estFeePerPair < minNetSpread) {
    return { traded: false, grossPnl: 0, fees: 0, unwindLoss: 0, netPnl: 0 };
  }
  const feeYes = pairCount * snap.yesAsk * feeRateYes;
  if (snap.leg2Reject) {
    const unwindLoss = pairCount * (snap.yesAsk - snap.yesBid);
    const fees = feeYes + pairCount * snap.yesBid * feeRateYes;
    return { traded: true, grossPnl: 0, fees, unwindLoss, netPnl: -unwindLoss - fees };
  }
  const grossPnl = pairCount * (1 - combinedAsk);
  const fees = feeYes + pairCount * snap.noAsk * feeRateNo;
  return { traded: true, grossPnl, fees, unwindLoss: 0, netPnl: grossPnl - fees };
}

export function runPolymarketWalkForwardEvaluation(cfg: WalkForwardConfig): WalkForwardEvaluationReport {
  const inSampleCount = Math.floor(cfg.episodes * (cfg.inSampleFraction ?? 0.7));
  const outOfSampleCount = cfg.episodes - inSampleCount;
  const legSizeUsdc = cfg.legSizeUsdc ?? 25;
  const minNetSpread = cfg.minNetSpread ?? 0.012;
  const category = cfg.category ?? 'politics';
  const rngNormal = { s: cfg.seed >>> 0 };
  const rngStress = { s: (cfg.seed ^ 0x9e3779b9) >>> 0 };
  const normalSnaps = Array.from({ length: cfg.episodes }, () => generateEpisode(rngNormal, false));
  const stressedSnaps = Array.from({ length: cfg.episodes }, () => generateEpisode(rngStress, true));
  const ids: CandidateId[] = ['no_trade_baseline', 'naive_mid_arb', 'executable_ask_fee_arb', 'log_odds_maker_mm_v2'];
  const candidates = {} as Record<CandidateId, CandidateEvaluationMetrics>;

  for (const id of ids) {
    let inSampleTrades = 0, inSampleNetPnlUsdc = 0, oosTrades = 0, oosWins = 0;
    let oosGrossPnlUsdc = 0, oosFeesUsdc = 0, oosLegUnwindLossUsdc = 0, oosNetPnlUsdc = 0, stressedNetPnlUsdc = 0;
    for (let i = 0; i < cfg.episodes; i++) {
      const res = simulateEpisode(normalSnaps[i]!, id, legSizeUsdc, minNetSpread, category);
      if (i < inSampleCount) {
        if (res.traded) inSampleTrades++;
        inSampleNetPnlUsdc += res.netPnl;
      } else {
        if (res.traded) {
          oosTrades++;
          if (res.netPnl > 0) oosWins++;
        }
        oosGrossPnlUsdc += res.grossPnl;
        oosFeesUsdc += res.fees;
        oosLegUnwindLossUsdc += res.unwindLoss;
        oosNetPnlUsdc += res.netPnl;
        stressedNetPnlUsdc += simulateEpisode(stressedSnaps[i]!, id, legSizeUsdc, minNetSpread, category).netPnl;
      }
    }
    const r4 = (x: number): number => Number(x.toFixed(4));
    candidates[id] = {
      candidateId: id, inSampleTrades, inSampleNetPnlUsdc: r4(inSampleNetPnlUsdc), oosTrades,
      oosGrossPnlUsdc: r4(oosGrossPnlUsdc), oosFeesUsdc: r4(oosFeesUsdc),
      oosLegUnwindLossUsdc: r4(oosLegUnwindLossUsdc), oosNetPnlUsdc: r4(oosNetPnlUsdc),
      oosWinRate: oosTrades > 0 ? r4(oosWins / oosTrades) : 0, stressedNetPnlUsdc: r4(stressedNetPnlUsdc),
    };
  }
  return { seed: cfg.seed, episodes: cfg.episodes, inSampleCount, outOfSampleCount, category, candidates };
}
