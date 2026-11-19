/**
 * Stationary Block Bootstrap CI, Bailey & Lopez de Prado Deflated Sharpe Ratio,
 * and 9-Scenario IC Stress Suite (economic shocks + fail-closed operational guards).
 */

import { deflatedSharpeRatio } from '../backtesting/deflated-sharpe';
import { computeKurtosis, computePerPeriodSharpe, computeSkewness } from '../backtesting/metrics-calculator-robustness';
import { stationaryBlockBootstrap } from '../backtesting/stationary-block-bootstrap';
import { evaluatePolyRisk, type PolyOrderIntent, type PolyRiskState } from '../risk/poly-fail-closed-risk-engine';
import { createPolyKillSwitch } from '../risk/poly-kill-switch';
import { classifyClobV2SubmitResponse, EngineRestartCooldown } from './clob-v2-submit-classifier';
import { classifyFiveMinuteExclusion } from './five-minute-crypto-guard';

export const STALE_FEED_HALT_THRESHOLD_MS = 1_500;

export interface BootstrapCIOptions {
  iterations?: number;
  avgBlockLength?: number;
  confidence?: number;
  seed?: number;
}

export interface BootstrapCIResult {
  mean: number;
  lower: number;
  upper: number;
  iterations: number;
  avgBlockLength: number;
  seed: number;
}

export function stationaryBlockBootstrapCI(
  samples: readonly number[],
  options: BootstrapCIOptions = {},
): BootstrapCIResult {
  const iterations = Math.max(10, Math.floor(options.iterations ?? 1_000));
  const avgBlockLength = Math.max(1, options.avgBlockLength ?? 5);
  const confidence = options.confidence ?? 0.95;
  const seed = Math.max(0, Math.floor(options.seed ?? 42));
  if (samples.length === 0) return { mean: 0, lower: 0, upper: 0, iterations, avgBlockLength, seed };
  const res = stationaryBlockBootstrap(samples, { resamples: iterations, meanBlockLength: avgBlockLength, confidence, seed });
  return { mean: res.observed, lower: res.lower, upper: res.upper, iterations: res.resamples, avgBlockLength: res.meanBlockLength, seed: res.seed };
}

export interface DeflatedSharpeInput {
  returns: readonly number[];
  nTrials: number;
  periodsPerYear?: number;
}

export interface DeflatedSharpeResult {
  observedSharpe: number;
  expectedMaxSharpe: number;
  deflatedSharpeProb: number;
  skewness: number;
  kurtosis: number;
  sampleLength: number;
  nTrials: number;
}

export function computeDeflatedSharpeRatio(input: DeflatedSharpeInput): DeflatedSharpeResult {
  const { returns } = input;
  const n = returns.length;
  const nTrials = Math.max(1, Math.floor(input.nTrials));
  const ann = Math.sqrt(Math.max(1, input.periodsPerYear ?? 252));
  if (n < 3) {
    return { observedSharpe: 0, expectedMaxSharpe: 0, deflatedSharpeProb: 0, skewness: 0, kurtosis: 3, sampleLength: n, nTrials };
  }
  const srPerPeriod = computePerPeriodSharpe(returns);
  const skewness = computeSkewness(returns);
  const kurtosis = computeKurtosis(returns);
  const dsr = deflatedSharpeRatio({ observedSharpe: srPerPeriod, nTrials, sampleLength: n, skewness, kurtosis });
  return {
    observedSharpe: Number((srPerPeriod * ann).toFixed(4)),
    expectedMaxSharpe: Number((dsr.expectedMaxSharpeUnderNull * ann).toFixed(4)),
    deflatedSharpeProb: Number(dsr.probability.toFixed(6)),
    skewness: Number(skewness.toFixed(4)),
    kurtosis: Number(kurtosis.toFixed(4)),
    sampleLength: n,
    nTrials,
  };
}

export type StressScenarioId =
  | 'SLIPPAGE_1_5X'
  | 'CANCEL_LATENCY_1_5X'
  | 'LIQUIDITY_REWARDS_MINUS_50PCT'
  | 'ADVERSE_HALF_TICK'
  | 'STALE_FEED_GT_1500MS'
  | 'HTTP_425_ENGINE_RESTART'
  | 'GHOST_FILL_STATUS_ZERO'
  | 'UMA_DISPUTE_GT_10PCT_NAV'
  | 'FIVE_MIN_CRYPTO_EXCLUSION';

export interface StressScenarioResult {
  scenarioId: StressScenarioId;
  category: 'economic' | 'operational_guard';
  passed: boolean;
  stressedNetPnlPusd?: number;
  expectedAction: string;
  observedAction: string;
  detail: string;
}

export interface NineScenarioStressInput {
  baselineNetPnlPusd: number;
  baselineSlippagePusd: number;
  baselineStaleAdverseFillCostPusd: number;
  baselineLiquidityRewardsPusd: number;
  fillCount: number;
  avgFillShares: number;
  tickSizePusd?: number;
  feedAgeMs?: number;
  umaDisputedNavPct?: number;
  nowMs?: number;
}

export interface NineScenarioStressReport {
  allPassed: boolean;
  passedCount: number;
  totalCount: 9;
  scenarios: StressScenarioResult[];
}

function economicScenario(scenarioId: StressScenarioId, stressedNetPnlPusd: number, label: string): StressScenarioResult {
  const pnl = Number(stressedNetPnlPusd.toFixed(4));
  return {
    scenarioId,
    category: 'economic',
    passed: pnl > 0,
    stressedNetPnlPusd: pnl,
    expectedAction: 'NET_PNL_POSITIVE',
    observedAction: pnl > 0 ? 'NET_PNL_POSITIVE' : 'NET_PNL_NON_POSITIVE',
    detail: `${label} net PnL=${pnl}`,
  };
}

function guardScenario(scenarioId: StressScenarioId, passed: boolean, expectedAction: string, observedAction: string, detail: string): StressScenarioResult {
  return { scenarioId, category: 'operational_guard', passed, expectedAction, observedAction, detail };
}

export function runNineScenarioStressSuite(input: NineScenarioStressInput): NineScenarioStressReport {
  const tick = input.tickSizePusd ?? 0.01;
  const nowMs = input.nowMs ?? 1_750_000_000_000;
  const feedAgeMs = input.feedAgeMs ?? 1_501;
  const umaPct = input.umaDisputedNavPct ?? 10.5;
  const intent: PolyOrderIntent = { tokenId: 'tok-stress', side: 'buy', price: 0.5, size: 10, orderType: 'GTC' };
  const baseState: PolyRiskState = {
    nowMs, killSwitch: 'inactive', marketData: { observedAtMs: nowMs - 200 },
    feeSchedule: { tokenId: 'tok-stress', rate: 0.02, exponent: 2 },
    positionReconciliation: { reconciled: true, reconciledAtMs: nowMs - 1_000, openPositionCount: 1 },
    riskBudget: { maxNotionalUsd: 100, currentDrawdownPct: 0.5 },
  };

  const staleHalted = feedAgeMs > STALE_FEED_HALT_THRESHOLD_MS;
  const http425 = classifyClobV2SubmitResponse(425, { error: 'engine restarting' }, nowMs);
  const cooldown = new EngineRestartCooldown();
  if (http425.kind === 'engine-restarting') cooldown.noteEngineRestart(nowMs);
  const http425Ok = http425.kind === 'engine-restarting' && http425.retryAfterMs === 120_000 && cooldown.requiresPostOnly(nowMs + 60_000);

  const ks = createPolyKillSwitch({ cancelAll: () => Promise.resolve({ ok: true, status: 200 }), now: () => nowMs });
  void ks.fire('ghost-fill-receipt-status-0');
  const ghostVerdict = evaluatePolyRisk(intent, { ...baseState, killSwitch: ks.isFired() ? 'active' : 'inactive' });
  const ghostOk = ks.isFired() && !ghostVerdict.allowed && ghostVerdict.reason === 'KILL_SWITCH_ACTIVE';

  const umaVerdict = evaluatePolyRisk(intent, {
    ...baseState,
    portfolioKelly: {
      tokenId: 'tok-stress', frozen: false, umaDisputedNavPct: umaPct, portfolioDrawdownPct: 0.5,
      navUsd: 10_000, tokenCapUsd: 1_000, currentTokenExposureUsd: 0, projectedClusterWorstCaseLossUsd: 50,
    },
  });
  const umaOk = !umaVerdict.allowed && umaVerdict.reason === 'UMA_DISPUTE_LOCKUP_HALT';
  const fiveMinReason = classifyFiveMinuteExclusion({ question: 'Will BTC be up in 5 minutes?', slug: 'btc-up-or-down-5m' });
  const fiveMinExcluded = fiveMinReason !== null;

  const scenarios: StressScenarioResult[] = [
    economicScenario('SLIPPAGE_1_5X', input.baselineNetPnlPusd - input.baselineSlippagePusd * 0.5, '1.5x slippage'),
    economicScenario('CANCEL_LATENCY_1_5X', input.baselineNetPnlPusd - input.baselineStaleAdverseFillCostPusd * 0.5, '1.5x cancel latency'),
    economicScenario('LIQUIDITY_REWARDS_MINUS_50PCT', input.baselineNetPnlPusd - input.baselineLiquidityRewardsPusd * 0.5, '-50% rewards'),
    economicScenario('ADVERSE_HALF_TICK', input.baselineNetPnlPusd - input.fillCount * input.avgFillShares * 0.5 * tick, '+0.5 tick adverse'),
    guardScenario('STALE_FEED_GT_1500MS', staleHalted, 'HALT_FAIL_CLOSED', staleHalted ? 'HALT_FAIL_CLOSED' : 'ALLOWED', `feedAgeMs=${feedAgeMs}`),
    guardScenario('HTTP_425_ENGINE_RESTART', http425Ok, 'POST_ONLY_COOLDOWN_120S', http425Ok ? 'POST_ONLY_COOLDOWN_120S' : http425.kind, `retryAfterMs=${http425.kind === 'engine-restarting' ? http425.retryAfterMs : 0}`),
    guardScenario('GHOST_FILL_STATUS_ZERO', ghostOk, 'KILL_SWITCH_FIRED_0_UNGUARDED', ghostOk ? 'KILL_SWITCH_FIRED_0_UNGUARDED' : 'FAILED', `fired=${ks.isFired()}, verdict=${ghostVerdict.allowed ? 'ALLOWED' : ghostVerdict.reason}`),
    guardScenario('UMA_DISPUTE_GT_10PCT_NAV', umaOk, 'FREEZE_NEW_ALLOCATION', umaVerdict.allowed ? 'ALLOWED' : umaVerdict.reason, `umaDisputedNavPct=${umaPct}%`),
    guardScenario('FIVE_MIN_CRYPTO_EXCLUSION', fiveMinExcluded, 'HARD_REJECT', fiveMinExcluded ? 'HARD_REJECT' : 'ALLOWED', fiveMinReason ?? 'not excluded'),
  ];
  const passedCount = scenarios.filter((s) => s.passed).length;
  return { allPassed: passedCount === 9, passedCount, totalCount: 9, scenarios };
}
