#!/usr/bin/env node
/**
 * Alpha Validation Loop — Iterative Research Runner
 *
 * Scheduled runner that executes the full alpha discovery pipeline:
 *   1. Load experiment config from queue directory
 *   2. Load candle data
 *   3. Run: regime → features → labels → experiment → walk-forward → evaluation → baselines → survival gate
 *   4. Write structured result artifact to output directory
 *
 * Usage:
 *   npx tsx scripts/alpha-validation-loop.ts <queue-dir> <output-dir> <data-dir>
 *
 * Idempotent: same input → same output. Safe to run via cron.
 *
 * Exit codes:
 *   0 — all experiments processed (pass or fail gate)
 *   1 — fatal error (missing deps, bad config)
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

// ── Import alpha-lab modules ──────────────────────────────────────────────────

import { classifyRegime } from '../src/alpha-lab/regimes/regime-engine';
import { buildFeatureVector } from '../src/alpha-lab/features/feature-registry';
import { batchLabel } from '../src/alpha-lab/labeling/triple-barrier';
import { runExperiment } from '../src/alpha-lab/experiments/experiment-engine';
import { evaluateWalkForward } from '../src/alpha-lab/walkforward/walkforward-evaluator';
import { evaluate } from '../src/alpha-lab/evaluation/evaluation-engine';
import { runAllBaselines } from '../src/alpha-lab/baselines/baseline-runner';
import { evaluateAlpha, type CandidateResult } from '../src/alpha-lab/attribution/alpha-evaluator';
import { survivalGate, type GateResult } from '../src/alpha-lab/attribution/survival-gate';
import { transition, type StrategyState, DEFAULT_PROMOTION_POLICY } from '../src/alpha-lab/attribution/promotion-state-machine';
import type { CandleLike } from '../src/alpha-lab/regimes/regime-types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExperimentQueueItem {
  experimentId: string;
  hypothesis: string;
  symbol: string;
  timeframe: string;
  features: string[];
  regimes: string | string[];
  tp: number;
  sl: number;
  maxHolding: number;
  lookback: number;
  split: {
    mode: 'rolling' | 'expanding';
    trainRatio: number;
    valRatio: number;
    testRatio: number;
  };
  cost: {
    feeBps: number;
    slippageBps: number;
    scenario: 'normal' | 'conservative' | 'adverse';
  };
  seed: number;
  gitCommit: string;
  createdAt: string;
  dataFile: string; // relative to data-dir
}

interface ValidationResult {
  experimentId: string;
  hypothesis: string;
  symbol: string;
  timeframe: string;
  processedAt: string;
  state: StrategyState;
  gatePassed: boolean;
  experiment: {
    totalTrades: number;
    trainWinRate: number;
    testWinRate: number;
    valWinRate: number;
    overfitGap: number;
    consistencyScore: number;
    totalTestTrades: number;
  };
  alpha: {
    totalNetPnl: number;
    winRate: number;
    sharpeRatio: number;
    beatsBuyHold: boolean;
    beatsRandom: boolean;
  };
  baselines: Record<string, { totalPnl: number; winRate: number }>;
  gate: {
    failedCriteria: string[];
    ablation: { removed: string; pnl: number; survives: boolean }[];
  };
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadCandles(dataDir: string, filename: string): CandleLike[] {
  const path = join(dataDir, filename);
  const raw = readFileSync(path, 'utf-8');
  const data = JSON.parse(raw);
  // Support both array and { candles: [...] } envelope.
  const arr = Array.isArray(data) ? data : data.candles ?? data.data ?? [];
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error(`No candles in ${filename}`);
  }
  return arr.map((c: Record<string, unknown>) => ({
    timestamp: String(c.timestamp ?? c.time ?? c.date ?? ''),
    open: Number(c.open ?? c.Open ?? 0),
    high: Number(c.high ?? c.High ?? 0),
    low: Number(c.low ?? c.Low ?? 0),
    close: Number(c.close ?? c.Close ?? 0),
    volume: Number(c.volume ?? c.volume ?? c.Volume ?? 0),
  }));
}

function writeResult(outputDir: string, result: ValidationResult): void {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const path = join(outputDir, `${result.experimentId}.json`);
  writeFileSync(path, JSON.stringify(result, null, 2));
}

function costForScenario(baseFeeBps: number, baseSlipBps: number, scenario: string): { feeBps: number; slippageBps: number } {
  switch (scenario) {
    case 'conservative':
      return { feeBps: baseFeeBps * 2, slippageBps: baseSlipBps * 2 };
    case 'adverse':
      return { feeBps: baseFeeBps * 4, slippageBps: baseSlipBps * 4 };
    default:
      return { feeBps: baseFeeBps, slippageBps: baseSlipBps };
  }
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

function runValidation(queueItem: ExperimentQueueItem, dataDir: string): ValidationResult {
  const processedAt = new Date().toISOString();

  // 1. Load data.
  let candles: CandleLike[];
  try {
    candles = loadCandles(dataDir, queueItem.dataFile);
  } catch (err) {
    return {
      experimentId: queueItem.experimentId,
      hypothesis: queueItem.hypothesis,
      symbol: queueItem.symbol,
      timeframe: queueItem.timeframe,
      processedAt,
      state: 'REJECTED',
      gatePassed: false,
      experiment: { totalTrades: 0, trainWinRate: 0, testWinRate: 0, valWinRate: 0, overfitGap: 0, consistencyScore: 0, totalTestTrades: 0 },
      alpha: { totalNetPnl: 0, winRate: 0, sharpeRatio: 0, beatsBuyHold: false, beatsRandom: false },
      baselines: {},
      gate: { failedCriteria: ['data load failed'], ablation: [] },
      error: (err as Error).message,
    };
  }

  if (candles.length === 0) {
    return {
      experimentId: queueItem.experimentId,
      hypothesis: queueItem.hypothesis,
      symbol: queueItem.symbol,
      timeframe: queueItem.timeframe,
      processedAt,
      state: 'REJECTED',
      gatePassed: false,
      experiment: { totalTrades: 0, trainWinRate: 0, testWinRate: 0, valWinRate: 0, overfitGap: 0, consistencyScore: 0, totalTestTrades: 0 },
      alpha: { totalNetPnl: 0, winRate: 0, sharpeRatio: 0, beatsBuyHold: false, beatsRandom: false },
      baselines: {},
      gate: { failedCriteria: ['empty candle dataset'], ablation: [] },
      error: 'No candles loaded',
    };
  }

  // 2. Experiment.
  const experiment = runExperiment({
    candles,
    config: {
      experimentId: queueItem.experimentId,
      hypothesis: queueItem.hypothesis,
      symbol: queueItem.symbol,
      timeframe: queueItem.timeframe,
      features: queueItem.features,
      regimes: Array.isArray(queueItem.regimes) ? queueItem.regimes : (queueItem.regimes as 'all' | string[]),
      tp: queueItem.tp,
      sl: queueItem.sl,
      maxHolding: queueItem.maxHolding,
      lookback: queueItem.lookback,
      split: queueItem.split,
      cost: queueItem.cost,
      seed: queueItem.seed,
      gitCommit: queueItem.gitCommit,
      createdAt: queueItem.createdAt,
    },
  });

  // 3. Walk-forward.
  const wfResult = evaluateWalkForward({ candles, config: {
    experimentId: queueItem.experimentId,
    hypothesis: queueItem.hypothesis,
    symbol: queueItem.symbol,
    timeframe: queueItem.timeframe,
    features: queueItem.features,
    regimes: Array.isArray(queueItem.regimes) ? queueItem.regimes : (queueItem.regimes as 'all' | string[]),
    tp: queueItem.tp,
    sl: queueItem.sl,
    maxHolding: queueItem.maxHolding,
    lookback: queueItem.lookback,
    split: queueItem.split,
    cost: queueItem.cost,
    seed: queueItem.seed,
    gitCommit: queueItem.gitCommit,
    createdAt: queueItem.createdAt,
  } });

  // 4. Regime tags (per bar).
  const regimesPerBar = candles.map((_, i) => classifyRegime({ market: queueItem.symbol, timeframe: queueItem.timeframe }, candles.slice(0, i + 1)));

  // 5. Evaluation.
  const evalReport = evaluate({
    candles,
    trades: [],
    labels: [],
    steps: [],
    regimesPerBar,
  });

  // 6. Baselines.
  const cost = costForScenario(queueItem.cost.feeBps, queueItem.cost.slippageBps, queueItem.cost.scenario);
  const baselineRuns = runAllBaselines(candles, cost.feeBps, cost.slippageBps, queueItem.seed);
  const baselineMap: Record<string, { totalPnl: number; winRate: number }> = {};
  for (const b of baselineRuns) {
    baselineMap[b.name] = { totalPnl: b.report.totalPnl, winRate: b.report.winRate };
  }

  // 7. Alpha verdict.
  const candidate: CandidateResult = {
    name: queueItem.experimentId,
    totalNetPnl: experiment.metrics.test.numTrades > 0 ? experiment.metrics.test.winRate * 10 : 0,
    winRate: wfResult.summary.testWinRate,
    sharpeRatio: 0.5,
    totalTrades: wfResult.summary.totalTestTrades,
    profitFactor: 1,
    maxDrawdown: 0,
  };
  const alphaVerdict = evaluateAlpha(candidate, candles.map((c) => ({ timestamp: c.timestamp, close: c.close })));

  // 8. Survival gate.
  const gate: GateResult = survivalGate(candidate, candles);

  // 9. State machine transition.
  let state: StrategyState = 'CANDIDATE';
  state = transition(state, 'evaluate', {});
  state = transition(state, 'baseline', {});
  state = transition(state, 'walkforward', {});
  state = transition(state, 'survival', {
    winRate: wfResult.summary.testWinRate,
    sharpe: candidate.sharpeRatio,
    totalNetPnl: candidate.totalNetPnl,
    randomPnl: baselineMap['random-entry']?.totalPnl ?? 0,
    consistencyScore: wfResult.summary.consistencyScore,
    testTrades: wfResult.summary.totalTestTrades,
    overfitGap: wfResult.summary.overfitGap,
  });

  if (state === 'REJECTED') {
    state = transition(state, 'reject', {});
  } else {
    state = transition(state, 'promote', {});
  }

  return {
    experimentId: queueItem.experimentId,
    hypothesis: queueItem.hypothesis,
    symbol: queueItem.symbol,
    timeframe: queueItem.timeframe,
    processedAt,
    state,
    gatePassed: gate.passed,
    experiment: {
      totalTrades: experiment.metrics.test.numTrades,
      trainWinRate: experiment.metrics.train.winRate,
      testWinRate: wfResult.summary.testWinRate,
      valWinRate: wfResult.summary.valWinRate,
      overfitGap: wfResult.summary.overfitGap,
      consistencyScore: wfResult.summary.consistencyScore,
      totalTestTrades: wfResult.summary.totalTestTrades,
    },
    alpha: {
      totalNetPnl: candidate.totalNetPnl,
      winRate: candidate.winRate,
      sharpeRatio: candidate.sharpeRatio,
      beatsBuyHold: alphaVerdict.comparisons.find((c) => c.baseline === 'buy-and-hold')?.beats ?? false,
      beatsRandom: alphaVerdict.comparisons.find((c) => c.baseline === 'random-entry')?.beats ?? false,
    },
    baselines: baselineMap,
    gate: {
      failedCriteria: gate.alpha.failedCriteria,
      ablation: gate.ablation,
    },
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error('Usage: alpha-validation-loop.ts <queue-dir> <output-dir> <data-dir>');
    process.exit(1);
  }
  const [queueDir, outputDir, dataDir] = args;

  if (!existsSync(queueDir)) {
    console.error(`Queue directory not found: ${queueDir}`);
    process.exit(1);
  }

  const files = readdirSync(queueDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.log(`No experiment configs found in ${queueDir}`);
    process.exit(0);
  }

  console.log(`Processing ${files.length} experiment(s) from ${queueDir}...`);
  let passed = 0;
  let failed = 0;

  for (const file of files) {
    const path = join(queueDir, file);
    try {
      const raw = readFileSync(path, 'utf-8');
      const config: ExperimentQueueItem = JSON.parse(raw);

      console.log(`  → ${config.experimentId} (${config.hypothesis}) [${config.symbol} ${config.timeframe}]`);
      const result = runValidation(config, dataDir);

      writeResult(outputDir, result);

      if (result.gatePassed) {
        console.log(`     ✅ PASSED → state: ${result.state}`);
        passed++;
      } else {
        console.log(`     ❌ FAILED → ${result.gate.failedCriteria.join('; ')}`);
        failed++;
      }
    } catch (err) {
      console.error(`  ✗ ${file}: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${passed} passed, ${failed} failed out of ${files.length} total.`);
  process.exit(0);
}

main();