/** Polymarket Walk-Forward Out-of-Sample (OOS) & Stress Evaluator (70/30 split + markout kill gate). */

import {
  calcTakerFeeRate,
  DEFAULT_CLOB_V2_CATEGORY,
  type PolymarketCategory,
  type PolymarketFeeSchedule,
} from './polymarket-fee-calculator';
import { simulateExecutableAskFeeArbEpisode, simulateNaiveArbEpisode } from './polymarket-oos-arb-episode-simulator';
import { simulateMakerEpisode, type EpisodeOutcome } from './polymarket-oos-maker-episode-simulator';
import { generateEpisode, type SyntheticMarketSnapshot } from './polymarket-oos-synthetic-market';

export interface WalkForwardConfig {
  seed: number;
  episodes: number;
  inSampleFraction?: number;
  legSizeUsdc?: number;
  minNetSpread?: number;
  /** Published per-market fee schedule; takes precedence for taker-arb candidates when supplied. */
  schedule?: PolymarketFeeSchedule;
  category?: PolymarketCategory;
  competitiveDilutionFactor?: number;
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
  makerMarkoutCoverageRatio?: number;
  passesMakerMarkoutKillCriterion?: boolean;
}

export interface WalkForwardEvaluationReport {
  seed: number;
  episodes: number;
  inSampleCount: number;
  outOfSampleCount: number;
  schedule?: PolymarketFeeSchedule;
  category: PolymarketCategory;
  candidates: Record<CandidateId, CandidateEvaluationMetrics>;
}

const CANDIDATE_IDS: CandidateId[] = [
  'no_trade_baseline', 'naive_mid_arb', 'executable_ask_fee_arb', 'log_odds_maker_mm_v2',
];

const NO_TRADE: EpisodeOutcome = { traded: false, grossPnl: 0, fees: 0, unwindLoss: 0, netPnl: 0 };

function simulateScheduleArbEpisode(
  snap: SyntheticMarketSnapshot,
  candidateId: 'naive_mid_arb' | 'executable_ask_fee_arb',
  shares: number,
  minNetSpread: number,
  schedule: PolymarketFeeSchedule,
): EpisodeOutcome {
  const feeRateYes = calcTakerFeeRate(schedule, snap.yesAsk);
  const feeRateNo = calcTakerFeeRate(schedule, snap.noAsk);
  if (candidateId === 'naive_mid_arb') {
    const yesMid = (snap.yesBid + snap.yesAsk) / 2;
    const noMid = (snap.noBid + snap.noAsk) / 2;
    if (yesMid + noMid >= 0.985) return NO_TRADE;
    const execYesAsk = snap.yesAskTokens >= shares ? snap.yesAsk : snap.yesAsk + 0.015;
    const execNoAsk = snap.noAskTokens >= shares ? snap.noAsk : snap.noAsk + 0.015;
    const feeYes = shares * execYesAsk * feeRateYes;
    if (snap.leg2Reject) {
      const unwindLoss = shares * (execYesAsk - snap.yesBid);
      const fees = feeYes + shares * snap.yesBid * feeRateYes;
      return { traded: true, grossPnl: 0, fees, unwindLoss, netPnl: -unwindLoss - fees };
    }
    const grossPnl = shares * (1 - (execYesAsk + execNoAsk));
    const fees = feeYes + shares * execNoAsk * feeRateNo;
    return { traded: true, grossPnl, fees, unwindLoss: 0, netPnl: grossPnl - fees };
  }
  if (snap.yesAskTokens < shares || snap.noAskTokens < shares) return NO_TRADE;
  const combinedAsk = snap.yesAsk + snap.noAsk;
  const estFeePerPair = snap.yesAsk * feeRateYes + snap.noAsk * feeRateNo;
  if (1 - combinedAsk - estFeePerPair < minNetSpread) return NO_TRADE;
  const feeYes = shares * snap.yesAsk * feeRateYes;
  if (snap.leg2Reject) {
    const unwindLoss = shares * (snap.yesAsk - snap.yesBid);
    const fees = feeYes + shares * snap.yesBid * feeRateYes;
    return { traded: true, grossPnl: 0, fees, unwindLoss, netPnl: -unwindLoss - fees };
  }
  const grossPnl = shares * (1 - combinedAsk);
  const fees = feeYes + shares * snap.noAsk * feeRateNo;
  return { traded: true, grossPnl, fees, unwindLoss: 0, netPnl: grossPnl - fees };
}

function simulateEpisode(
  snap: SyntheticMarketSnapshot,
  candidateId: CandidateId,
  pairCount: number,
  minNetSpread: number,
  schedule: PolymarketFeeSchedule | undefined,
  category: PolymarketCategory,
  episodeRngState: number,
  competitiveDilutionFactor?: number,
): EpisodeOutcome {
  if (candidateId === 'no_trade_baseline') return NO_TRADE;
  if (candidateId === 'naive_mid_arb' || candidateId === 'executable_ask_fee_arb') {
    if (schedule) return simulateScheduleArbEpisode(snap, candidateId, pairCount, minNetSpread, schedule);
    return candidateId === 'naive_mid_arb'
      ? simulateNaiveArbEpisode(snap, pairCount, category)
      : simulateExecutableAskFeeArbEpisode(snap, pairCount, minNetSpread, category);
  }
  return simulateMakerEpisode(
    snap,
    pairCount,
    minNetSpread,
    category,
    { s: episodeRngState >>> 0 },
    { competitiveDilutionFactor },
  );
}

export function runPolymarketWalkForwardEvaluation(cfg: WalkForwardConfig): WalkForwardEvaluationReport {
  const inSampleCount = Math.floor(cfg.episodes * (cfg.inSampleFraction ?? 0.7));
  const outOfSampleCount = cfg.episodes - inSampleCount;
  const legSizeUsdc = cfg.legSizeUsdc ?? 25;
  const minNetSpread = cfg.minNetSpread ?? 0.012;
  const category = cfg.category ?? DEFAULT_CLOB_V2_CATEGORY;
  const rngNormal = { s: cfg.seed >>> 0 };
  const rngStress = { s: (cfg.seed ^ 0x9e3779b9) >>> 0 };
  const normalSnaps = Array.from({ length: cfg.episodes }, () => generateEpisode(rngNormal, false));
  const stressedSnaps = Array.from({ length: cfg.episodes }, () => generateEpisode(rngStress, true));
  const candidates = {} as Record<CandidateId, CandidateEvaluationMetrics>;

  for (const id of CANDIDATE_IDS) {
    let inSampleTrades = 0, inSampleNetPnlUsdc = 0, oosTrades = 0, oosWins = 0;
    let oosGrossPnlUsdc = 0, oosFeesUsdc = 0, oosLegUnwindLossUsdc = 0, oosNetPnlUsdc = 0, stressedNetPnlUsdc = 0;
    let oosMakerRevenueUsdc = 0, oosMarkoutLoss60sUsdc = 0;
    for (let i = 0; i < cfg.episodes; i++) {
      const res = simulateEpisode(
        normalSnaps[i]!, id, legSizeUsdc, minNetSpread, cfg.schedule, category,
        (cfg.seed ^ (i * 0x9e3779b9)) >>> 0, cfg.competitiveDilutionFactor,
      );
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
        oosMakerRevenueUsdc += res.makerRevenueUsdc ?? 0;
        oosMarkoutLoss60sUsdc += res.markoutLoss60s ?? 0;
        stressedNetPnlUsdc += simulateEpisode(
          stressedSnaps[i]!, id, legSizeUsdc, minNetSpread, cfg.schedule, category,
          (cfg.seed ^ (i * 0x9e3779b9) ^ 0x85ebca6b) >>> 0, cfg.competitiveDilutionFactor,
        ).netPnl;
      }
    }
    const r4 = (x: number): number => Number(x.toFixed(4));
    const coverageRatio =
      id === 'log_odds_maker_mm_v2' && oosMarkoutLoss60sUsdc > 0
        ? r4(oosMakerRevenueUsdc / oosMarkoutLoss60sUsdc)
        : undefined;
    candidates[id] = {
      candidateId: id, inSampleTrades, inSampleNetPnlUsdc: r4(inSampleNetPnlUsdc), oosTrades,
      oosGrossPnlUsdc: r4(oosGrossPnlUsdc), oosFeesUsdc: r4(oosFeesUsdc),
      oosLegUnwindLossUsdc: r4(oosLegUnwindLossUsdc), oosNetPnlUsdc: r4(oosNetPnlUsdc),
      oosWinRate: oosTrades > 0 ? r4(oosWins / oosTrades) : 0, stressedNetPnlUsdc: r4(stressedNetPnlUsdc),
      ...(id === 'log_odds_maker_mm_v2'
        ? {
            makerMarkoutCoverageRatio: coverageRatio ?? 0,
            passesMakerMarkoutKillCriterion: coverageRatio !== undefined && coverageRatio >= 1.5,
          }
        : {}),
    };
  }
  return {
    seed: cfg.seed,
    episodes: cfg.episodes,
    inSampleCount,
    outOfSampleCount,
    ...(cfg.schedule ? { schedule: cfg.schedule } : {}),
    category,
    candidates,
  };
}
