/**
 * Polymarket Walk-Forward Out-of-Sample (OOS) & Stress Evaluator
 *
 * Deterministic walk-forward protocol (70% in-sample, 30% out-of-sample + stressed regime)
 * incorporating executable ask spread, category-aware taker fees (`calcTakerFee`),
 * CLOB V2 maker rebate (`calcMakerRebateV2`), competitive liquidity reward dilution,
 * Log-Odds A-S quoting (`log_odds_maker_mm_v2`), top-of-book depth constraints,
 * Leg-2 rejection unwind slippage risk, and the `>= 1.5x` markout kill criterion.
 */

import type { PolymarketCategory } from './polymarket-fee-calculator';
import { simulateExecutableAskFeeArbEpisode, simulateNaiveArbEpisode } from './polymarket-oos-arb-episode-simulator';
import { simulateMakerEpisode, type EpisodeOutcome } from './polymarket-oos-maker-episode-simulator';
import { generateEpisode, type SyntheticMarketSnapshot } from './polymarket-oos-synthetic-market';

export interface WalkForwardConfig {
  seed: number;
  episodes: number;
  inSampleFraction?: number;
  legSizeUsdc?: number;
  minNetSpread?: number;
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
  category: PolymarketCategory;
  candidates: Record<CandidateId, CandidateEvaluationMetrics>;
}

const CANDIDATE_IDS: CandidateId[] = [
  'no_trade_baseline', 'naive_mid_arb', 'executable_ask_fee_arb', 'log_odds_maker_mm_v2',
];

function simulateEpisode(
  snap: SyntheticMarketSnapshot,
  candidateId: CandidateId,
  pairCount: number,
  minNetSpread: number,
  category: PolymarketCategory,
  episodeRngState: number,
  competitiveDilutionFactor?: number,
): EpisodeOutcome {
  if (candidateId === 'no_trade_baseline') {
    return { traded: false, grossPnl: 0, fees: 0, unwindLoss: 0, netPnl: 0 };
  }
  if (candidateId === 'naive_mid_arb') {
    return simulateNaiveArbEpisode(snap, pairCount, category);
  }
  if (candidateId === 'executable_ask_fee_arb') {
    return simulateExecutableAskFeeArbEpisode(snap, pairCount, minNetSpread, category);
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
  const category = cfg.category ?? 'politics';
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
        normalSnaps[i]!, id, legSizeUsdc, minNetSpread, category,
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
          stressedSnaps[i]!, id, legSizeUsdc, minNetSpread, category,
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
  return { seed: cfg.seed, episodes: cfg.episodes, inSampleCount, outOfSampleCount, category, candidates };
}
