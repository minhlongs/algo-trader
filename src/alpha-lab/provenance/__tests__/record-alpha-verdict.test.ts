/**
 * Record Alpha Verdict Tests
 *
 * Covers: candidateResultFromExperiment mapping, recordAlphaVerdict happy path,
 * failed verdict, fail-safety on unwritable roots, and engine-level profitFactor
 * surface via runExperiment.
 *
 * Pattern: mkdtemp tmpdir per test, rm recursive force in afterEach.
 * No real data/ used (E5 invariant).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  candidateResultFromExperiment,
  recordAlphaVerdict,
} from '../record-alpha-verdict';
import { readAlphaReportByCandidateId } from '../alpha-report-store';
import {
  readLedgerRecords,
  verifyLedgerChain,
} from '../research-ledger';
import { runExperiment } from '../../experiments/experiment-engine';
import type { ExperimentResult } from '../../experiments/experiment-types';

// ── Fixtures ────────────────────────────────────────────────────────────────

let tmp: string;
let tmpReportRoot: string;
let tmpLedger: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'record-alpha-verdict-'));
  tmpReportRoot = join(tmp, 'alpha-reports');
  tmpLedger = join(tmp, 'research-ledger.jsonl');
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const CANDLES = Array.from({ length: 60 }, (_, i) => ({
  timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
  open: 100 + i,
  high: 101 + i,
  low: 99 + i,
  close: 100 + i,
}));

function syntheticResult(
  trainPnl = 0.05,
  valPnl = 0.03,
  testPnl = 0.02,
): ExperimentResult {
  return {
    config: {
      experimentId: 'test-exp-001',
      hypothesis: 'test',
      symbol: 'X',
      timeframe: '1h',
      features: ['simple_return'],
      regimes: 'all',
      tp: 0.02,
      sl: 0.01,
      maxHolding: 6,
      lookback: 5,
      split: {
        mode: 'rolling',
        trainRatio: 0.5,
        valRatio: 0.25,
        testRatio: 0.25,
      },
      cost: { feeBps: 5, slippageBps: 2, scenario: 'normal' },
      seed: 42,
      gitCommit: 'abc123',
      createdAt: '2025-01-01T00:00:00Z',
    },
    steps: [],
    metrics: {
      train: {
        numTrades: 10,
        winRate: 0.6,
        lossRate: 0.2,
        timeoutRate: 0.2,
        meanLabel: 0.4,
        regimesPresent: [],
        totalPnl: trainPnl,
        sharpeRatio: 1.5,
        profitFactor: 2.0,
        maxDrawdown: -0.05,
      },
      val: {
        numTrades: 8,
        winRate: 0.55,
        lossRate: 0.25,
        timeoutRate: 0.2,
        meanLabel: 0.3,
        regimesPresent: [],
        totalPnl: valPnl,
        sharpeRatio: 1.0,
        profitFactor: 1.5,
        maxDrawdown: -0.04,
      },
      test: {
        numTrades: 6,
        winRate: 0.52,
        lossRate: 0.28,
        timeoutRate: 0.2,
        meanLabel: 0.2,
        regimesPresent: [],
        totalPnl: testPnl,
        sharpeRatio: 0.8,
        profitFactor: 1.2,
        maxDrawdown: -0.03,
      },
    },
    totalBars: 60,
    numSteps: 0,
  };
}

// ── candidateResultFromExperiment ────────────────────────────────────────────

describe('candidateResultFromExperiment', () => {
  it('maps TEST split fields including profitFactor passthrough', () => {
    const result = syntheticResult(0.05, 0.03, 0.02);
    const candidate = candidateResultFromExperiment(result);

    expect(candidate.name).toBe('test-exp-001');
    expect(candidate.totalNetPnl).toBe(0.02);
    expect(candidate.winRate).toBe(0.52);
    expect(candidate.sharpeRatio).toBe(0.8);
    expect(candidate.totalTrades).toBe(6);
    expect(candidate.profitFactor).toBe(1.2);
    expect(candidate.maxDrawdown).toBe(-0.03);
  });

  it('does not leak train/val metrics into candidate', () => {
    const result = syntheticResult(0.99, 0.88, 0.02);
    const candidate = candidateResultFromExperiment(result);

    expect(candidate.totalNetPnl).not.toBe(0.99);
    expect(candidate.totalNetPnl).not.toBe(0.88);
    expect(candidate.totalNetPnl).toBe(0.02);
  });

  it('distinct train/val/test numbers all map to TEST', () => {
    const result = syntheticResult(1.0, 2.0, 3.0);
    const candidate = candidateResultFromExperiment(result);
    expect(candidate.totalNetPnl).toBe(3.0);
  });
});

// ── recordAlphaVerdict happy path ────────────────────────────────────────────

describe('recordAlphaVerdict', () => {
  it('writes alpha report + ledger, chain verifies', async () => {
    const result = syntheticResult(0.05, 0.03, 0.02);
    const candidate = candidateResultFromExperiment(result);
    const outcome = await recordAlphaVerdict(
      {
        candidateId: 'happy-candidate',
        configHash: 'abc123hash',
        strategyRef: 'simple_return',
        candidate,
        candles: CANDLES,
      },
      { alphaReportRoot: tmpReportRoot, ledgerPath: tmpLedger },
    );

    expect(outcome.verdict).toBeDefined();
    expect(outcome.report.candidateId).toBe('happy-candidate');
    expect(outcome.ledger.ok).toBe(true);

    const report = await readAlphaReportByCandidateId(
      'happy-candidate',
      tmpReportRoot,
    );
    expect(report).not.toBeNull();
    expect(report?.verdict.passed).toBe(outcome.verdict.passed);

    const records = await readLedgerRecords(tmpLedger);
    expect(records).toHaveLength(1);
    expect(records[0]!.gates.alphaSurvival).toBe(outcome.verdict.passed);
    expect(records[0]!.runId).toBe('happy-candidate');
    expect(records[0]!.configHash).toBe('abc123hash');
    expect(records[0]!.resultClass).toBe('IS');

    const chain = verifyLedgerChain(records);
    expect(chain).toBe(-1);
  });
});

// ── recordAlphaVerdict weak candidate ────────────────────────────────────────

describe('recordAlphaVerdict weak candidate', () => {
  it('failed verdict, ledger gate false, failedCriteria non-empty', async () => {
    const result = syntheticResult(-0.1, -0.08, -0.06);
    const candidate = candidateResultFromExperiment(result);
    candidate.winRate = 0.3;
    candidate.sharpeRatio = -1.0;

    const outcome = await recordAlphaVerdict(
      {
        candidateId: 'weak-candidate',
        configHash: 'weakhash',
        strategyRef: 'losing-strategy',
        candidate,
        candles: CANDLES,
      },
      { alphaReportRoot: tmpReportRoot, ledgerPath: tmpLedger },
    );

    expect(outcome.verdict.passed).toBe(false);
    expect(outcome.verdict.failedCriteria.length).toBeGreaterThan(0);

    const report = await readAlphaReportByCandidateId(
      'weak-candidate',
      tmpReportRoot,
    );
    expect(report).not.toBeNull();
    expect(report?.verdict.passed).toBe(false);

    const records = await readLedgerRecords(tmpLedger);
    expect(records).toHaveLength(1);
    expect(records[0]!.gates.alphaSurvival).toBe(false);
  });
});

// ── recordAlphaVerdict fail-safety ───────────────────────────────────────────

describe('recordAlphaVerdict fail-safety', () => {
  it('unwritable root -> no throw, ledger ok:false', async () => {
    // Create a regular file where the report root would be
    const blockerPath = join(tmp, 'blocker-file');
    await writeFile(blockerPath, 'not a directory', 'utf8');

    const result = syntheticResult(0.05, 0.03, 0.02);
    const candidate = candidateResultFromExperiment(result);

    const outcome = await recordAlphaVerdict(
      {
        candidateId: 'fail-safe-candidate',
        configHash: 'hash123',
        strategyRef: 'test',
        candidate,
        candles: CANDLES,
      },
      {
        alphaReportRoot: join(blockerPath, 'nested', 'reports'),
        ledgerPath: join(blockerPath, 'nested', 'ledger.jsonl'),
      },
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.verdict).toBeDefined();
  });

  it('no throw on unwritable path', async () => {
    const blockerPath = join(tmp, 'file-not-dir');
    await writeFile(blockerPath, 'x', 'utf8');

    const candidate = candidateResultFromExperiment(syntheticResult());
    await expect(
      recordAlphaVerdict(
        {
          candidateId: 'no-throw',
          configHash: 'h',
          strategyRef: 's',
          candidate,
          candles: CANDLES,
        },
        {
          alphaReportRoot: join(blockerPath, 'a'),
          ledgerPath: join(blockerPath, 'b', 'ledger.jsonl'),
        },
      ),
    ).resolves.toBeDefined();
  });
});

// ── Engine-level profitFactor (via runExperiment) ────────────────────────────

describe('SplitMetrics profitFactor via engine', () => {
  it('populated path surfaces profitFactor from computeMetrics', () => {
    const candles = Array.from({ length: 80 }, (_, i) => ({
      timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
      open: 100 + i,
      high: 101 + i,
      low: 99 + i,
      close: 100 + i,
      volume: 50 + i,
    }));
    const result = runExperiment({
      candles,
      config: {
        experimentId: 'pf-test',
        hypothesis: 'profitFactor surfaced',
        symbol: 'X',
        timeframe: '1h',
        features: ['simple_return'],
        regimes: 'all',
        tp: 0.02,
        sl: 0.01,
        maxHolding: 5,
        lookback: 5,
        split: {
          mode: 'rolling',
          trainRatio: 0.5,
          valRatio: 0.25,
          testRatio: 0.25,
        },
        cost: { feeBps: 5, slippageBps: 2, scenario: 'normal' },
        seed: 42,
        gitCommit: 'abc',
        createdAt: '2025-01-01T00:00:00Z',
      },
    });

    expect(typeof result.metrics.train.profitFactor).toBe('number');
    expect(typeof result.metrics.val.profitFactor).toBe('number');
    expect(typeof result.metrics.test.profitFactor).toBe('number');
    expect(result.metrics.train.profitFactor).toBeGreaterThanOrEqual(0);
    expect(result.metrics.val.profitFactor).toBeGreaterThanOrEqual(0);
    expect(result.metrics.test.profitFactor).toBeGreaterThanOrEqual(0);
  });

  it('empty-labels split yields profitFactor 0', () => {
    // computeSplitMetrics is not exported; drive it through runExperiment.
    // A 1-bar val window cannot fit any label (window end - 1 - maxHolding
    // falls below the window start), so the val split hits the empty-labels
    // literal while train/test remain populated.
    const candles = Array.from({ length: 100 }, (_, i) => ({
      timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
      open: 100 + i,
      high: 101 + i,
      low: 99 + i,
      close: 100 + i,
      volume: 50 + i,
    }));

    const result = runExperiment({
      candles,
      config: {
        experimentId: 'pf-empty-test',
        hypothesis: 'empty-labels profitFactor',
        symbol: 'X',
        timeframe: '1h',
        features: ['simple_return'],
        regimes: 'all',
        tp: 0.02,
        sl: 0.01,
        maxHolding: 6,
        lookback: 5,
        split: {
          mode: 'rolling',
          trainRatio: 0.4,
          valRatio: 0.01,
          testRatio: 0.59,
          trainWindowSize: 40,
          valWindowSize: 1,
        },
        cost: { feeBps: 5, slippageBps: 2, scenario: 'normal' },
        seed: 42,
        gitCommit: 'abc',
        createdAt: '2025-01-01T00:00:00Z',
      },
    });

    // Val split produced zero labels -> empty-labels literal.
    expect(result.metrics.val.numTrades).toBe(0);
    expect(result.metrics.val.timeoutRate).toBe(1);
    expect(result.metrics.val.profitFactor).toBe(0);

    // Sanity: other splits stayed populated.
    expect(result.metrics.train.numTrades).toBeGreaterThan(0);
    expect(result.metrics.test.numTrades).toBeGreaterThan(0);
    expect(typeof result.metrics.test.profitFactor).toBe('number');
  });

  it('candidateResultFromExperiment passes through engine profitFactor', () => {
    const result = syntheticResult(0.05, 0.03, 0.02);
    const candidate = candidateResultFromExperiment(result);
    // profitFactor from test split
    expect(candidate.profitFactor).toBe(1.2);
  });
});
