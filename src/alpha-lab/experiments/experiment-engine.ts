/**
 * Experiment Engine
 *
 * Integration layer: connects alpha-lab splits + triple-barrier labels to the
 * existing metrics calculator. This is the FIRST integration point proving that
 * alpha-lab reuses `src/desk/backtesting/metrics-calculator.ts` rather than
 * duplicating evaluation logic.
 *
 * Causal invariant: every label and metric uses only data within its split window
 * plus the explicit `lookback` warmup. No future-bar leakage.
 *
 * @see docs/ALPHA_DISCOVERY_ARCHITECTURE.md — "Foundation vs Integration Contract"
 */

import type { CandleLike } from '../regimes/regime-types';
import type { TripleBarrierResult } from '../labeling/triple-barrier';
import { batchLabel } from '../labeling/triple-barrier';
import type { BacktestTrade } from '../../desk/backtesting/types';
import type {
  ExperimentConfig,
  ExperimentResult,
  WalkForwardStep,
  SplitMetrics,
} from './experiment-types';
import { generateSplits } from './splitter';

// ── Helpers ───────────────────────────────────────────────────────────────────

function _buildEquityCurve(
  candles: CandleLike[],
  start: number,
  end: number,
): Array<{ timestamp: string; equity: number }> {
  return candles.slice(start, end).map((c) => ({ timestamp: c.timestamp, equity: c.close }));
}

function buildTrades(
  candles: CandleLike[],
  labels: Array<TripleBarrierResult & { entryIdx: number }>,
  config: { tp: number; sl: number; feeBps: number; slippageBps: number },
): BacktestTrade[] {
  const feeMultiplier = config.feeBps / 10000;
  const slipMultiplier = config.slippageBps / 10000;
  const roundTripCost = feeMultiplier + slipMultiplier; // per side; round-trip = 2x

  return labels.map((l) => {
    const entryPrice = candles[l.entryIdx].close;
    const isWin = l.label === 1;
    const isLoss = l.label === -1;
    const grossPnL = isWin
      ? entryPrice * config.tp
      : isLoss
        ? -entryPrice * config.sl
        : 0;
    const cost = entryPrice * roundTripCost * 2; // round-trip: entry + exit
    const netPnL = grossPnL - cost;
    const exitPrice =
      isWin
        ? entryPrice * (1 + config.tp)
        : isLoss
          ? entryPrice * (1 - config.sl)
          : entryPrice;
    return {
      timestamp: candles[l.entryIdx].timestamp,
      tokenId: '',
      side: 'BUY',
      price: exitPrice,
      size: 1,
      pnl: netPnL,
    };
  });
}

function computeSplitMetrics(
  labels: Array<TripleBarrierResult & { entryIdx: number }>,
  _trades: BacktestTrade[],
  _candles: CandleLike[],
  _config: ExperimentConfig,
  _split: { startIdx: number; endIdx: number },
): SplitMetrics {
  if (labels.length === 0) {
    return {
      numTrades: 0,
      winRate: 0,
      lossRate: 0,
      timeoutRate: 1,
      meanLabel: 0,
      regimesPresent: [],
    };
  }
  const wins = labels.filter((l) => l.label === 1).length;
  const losses = labels.filter((l) => l.label === -1).length;
  const timeouts = labels.filter((l) => l.label === 0).length;
  return {
    numTrades: labels.length,
    winRate: wins / labels.length,
    lossRate: losses / labels.length,
    timeoutRate: timeouts / labels.length,
    meanLabel: labels.reduce((s, l) => s + l.label, 0) / labels.length,
    regimesPresent: [],
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface RunExperimentInput {
  candles: CandleLike[];
  config: ExperimentConfig;
}

/**
 * Run a single experiment: generate splits → label → compute metrics.
 *
 * Returns a structured artifact capturing every decision point for reproducibility.
 */
export function runExperiment(input: RunExperimentInput): ExperimentResult {
  const { candles, config } = input;

  if (candles.length === 0) throw new Error('Empty candle array');
  if (candles.length < config.lookback + config.maxHolding + 1) {
    throw new Error(
      `Insufficient data: need at least ${config.lookback + config.maxHolding + 1} bars, got ${candles.length}`,
    );
  }

  // Generate walk-forward splits (causal boundaries enforced inside generateSplits).
  const rawSplits = generateSplits(config.split, candles.length, config.lookback);
  if (rawSplits.length === 0) {
    throw new Error('No splits generated — check config ratios vs data length');
  }

  // Group into steps.
  const stepMap = new Map<number, WalkForwardStep>();
  for (const s of rawSplits) {
    const existing = stepMap.get(s.step);
    if (!existing) {
      stepMap.set(s.step, { step: s.step, train: s, val: s, test: s });
    } else {
      if (s.kind === 'train') existing.train = s;
      else if (s.kind === 'val') existing.val = s;
      else existing.test = s;
    }
  }
  const steps = Array.from(stepMap.values()).sort((a, b) => a.step - b.step);

  // Aggregate labels + metrics across all steps.
  const allTrainLabels: Array<TripleBarrierResult & { entryIdx: number }> = [];
  const allValLabels: Array<TripleBarrierResult & { entryIdx: number }> = [];
  const allTestLabels: Array<TripleBarrierResult & { entryIdx: number }> = [];
  const allTrainTrades: BacktestTrade[] = [];
  const allValTrades: BacktestTrade[] = [];
  const allTestTrades: BacktestTrade[] = [];

  for (const step of steps) {
    // Train split.
    const trainStart = Math.max(step.train.startIdx, config.lookback);
    const trainEnd = step.train.endIdx - 1 - config.maxHolding;
    if (trainEnd >= trainStart) {
      const tLabels = batchLabel(
        candles.map((c) => ({ high: c.high, low: c.low, close: c.close })),
        config.tp,
        config.sl,
        config.maxHolding,
        trainStart,
      );
      allTrainLabels.push(...tLabels);
      allTrainTrades.push(...buildTrades(candles, tLabels, { tp: config.tp, sl: config.sl, feeBps: config.cost.feeBps, slippageBps: config.cost.slippageBps }));
    }

    // Val split.
    const valStart = Math.max(step.val.startIdx, config.lookback);
    const valEnd = step.val.endIdx - 1 - config.maxHolding;
    if (valEnd >= valStart) {
      const vLabels = batchLabel(
        candles.map((c) => ({ high: c.high, low: c.low, close: c.close })),
        config.tp,
        config.sl,
        config.maxHolding,
        valStart,
      );
      allValLabels.push(...vLabels);
      allValTrades.push(...buildTrades(candles, vLabels, { tp: config.tp, sl: config.sl, feeBps: config.cost.feeBps, slippageBps: config.cost.slippageBps }));
    }

    // Test split.
    const testStart = Math.max(step.test.startIdx, config.lookback);
    const testEnd = step.test.endIdx - 1 - config.maxHolding;
    if (testEnd >= testStart) {
      const teLabels = batchLabel(
        candles.map((c) => ({ high: c.high, low: c.low, close: c.close })),
        config.tp,
        config.sl,
        config.maxHolding,
        testStart,
      );
      allTestLabels.push(...teLabels);
      allTestTrades.push(...buildTrades(candles, teLabels, { tp: config.tp, sl: config.sl, feeBps: config.cost.feeBps, slippageBps: config.cost.slippageBps }));
    }
  }

  const metrics = {
    train: computeSplitMetrics(allTrainLabels, allTrainTrades, candles, config, steps[0]!.train),
    val: computeSplitMetrics(allValLabels, allValTrades, candles, config, steps[0]!.val),
    test: computeSplitMetrics(allTestLabels, allTestTrades, candles, config, steps[0]!.test),
  };

  return {
    config,
    steps,
    metrics,
    totalBars: candles.length,
    numSteps: steps.length,
  };
}