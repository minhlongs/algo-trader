/**
 * Run Card Unit Tests
 *
 * Covers: writeRunCard persistence (JSON & Markdown), immutability (frozen object),
 * provenance fields (hypothesisId, lifecycleState, parameters, foldMetrics),
 * fail-safe error capture, and comprehensive markdown rendering.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeRunCard,
  renderMarkdown,
  hashConfig,
  RUN_CARD_SCHEMA_VERSION,
  type WriteRunCardInput,
  type RunCard,
} from '../run-card';

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'runcard-'));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const sampleInput: WriteRunCardInput = {
  runId: 'run-alpha-101',
  resultClass: 'VALIDATED',
  strategyRef: 'vol-breakout-eth',
  hypothesisId: 'hyp-vol-01',
  hypothesis: 'Volatility expansion triggers multi-hour momentum breakout',
  lifecycleState: 'VALIDATED',
  parameters: {
    lookbackFolds: 5,
    atrMultiplier: 2.5,
    filters: { regime: 'trending', minVol: 0.02 },
  },
  foldMetrics: {
    fold_0_sharpe: 1.72,
    fold_1_sharpe: 1.95,
    fold_2_sharpe: 2.14,
    fold_3_sharpe: 1.88,
    fold_4_sharpe: undefined,
  },
  dataSources: [
    {
      provider: 'gamma',
      symbol: 'ETH/USDT',
      timeframe: '1h',
      start: '2026-01-01T00:00:00Z',
      end: '2026-06-01T00:00:00Z',
      retrievedAt: '2026-06-02T00:00:00Z',
      candleCount: 3600,
    },
  ],
  metrics: {
    sharpe: 1.92,
    maxDrawdown: -0.09,
    winRate: 0.58,
    profitFactor: 1.65,
  },
  gateResults: [
    { gateId: 'sharpe-threshold', passed: true, detail: 'Sharpe >= 1.5' },
    { gateId: 'max-drawdown', passed: true, detail: 'Max DD <= 12%' },
  ],
  warnings: ['Slippage assumed at 2 bps'],
  config: { seed: 42, strategy: 'vol-breakout', maxLoss: 0.02 },
};

describe('writeRunCard', () => {
  it('writes immutable run_card.json and run_card.md to disk', async () => {
    const card = await writeRunCard(tmp, sampleInput);

    expect(Object.isFrozen(card)).toBe(true);
    expect(card.schemaVersion).toBe(RUN_CARD_SCHEMA_VERSION);
    expect(card.hypothesisId).toBe('hyp-vol-01');
    expect(card.lifecycleState).toBe('VALIDATED');
    expect(card.configHash).toBe(hashConfig(sampleInput.config));

    const jsonRaw = await readFile(join(tmp, 'run_card.json'), 'utf8');
    const parsed = JSON.parse(jsonRaw) as RunCard;
    expect(parsed.runId).toBe('run-alpha-101');
    expect(parsed.parameters?.atrMultiplier).toBe(2.5);
    expect(parsed.foldMetrics?.fold_1_sharpe).toBe(1.95);

    const mdRaw = await readFile(join(tmp, 'run_card.md'), 'utf8');
    expect(mdRaw).toContain('# Run Card — run-alpha-101');
    expect(mdRaw).toContain('- **Lifecycle state:** `VALIDATED`');
    expect(mdRaw).toContain('- **Hypothesis ID:** hyp-vol-01');
    expect(mdRaw).toContain('## Parameters');
    expect(mdRaw).toContain('## Fold Metrics');
    expect(mdRaw).toContain('| fold_0_sharpe | 1.72 |');
    expect(mdRaw).toContain('| fold_4_sharpe | n/a |');
  });

  it('is fail-safe: unwritable target directory logs error and sets writeError', async () => {
    const blocker = join(tmp, 'file-blocker');
    await writeFile(blocker, 'contents', 'utf8');
    const badDir = join(blocker, 'sub-dir');

    const card = await writeRunCard(badDir, sampleInput);
    expect(Object.isFrozen(card)).toBe(true);
    expect(card.writeError).toBeDefined();
    expect(typeof card.writeError).toBe('string');
  });
});

describe('renderMarkdown', () => {
  it('renders all sections when populated', () => {
    const card: RunCard = {
      schemaVersion: '1.0.0',
      runId: 'rc-full',
      configHash: 'hash-123',
      createdAt: '2026-09-28T12:00:00Z',
      resultClass: 'PROMOTED_LIVE_ELIGIBLE',
      strategyRef: 'strat-live',
      hypothesisId: 'hyp-live-1',
      hypothesis: 'Proven edge across 50 paper trades',
      lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
      parameters: { fastPeriod: 10, slowPeriod: 30 },
      foldMetrics: { fold_0_sharpe: 2.2 },
      dataSources: ['binance:BTC/USDT:1h'],
      metrics: { sharpe: 2.1, calmar: 3.5 },
      gateResults: [{ gateId: 'promoted-gate', passed: true, detail: 'all passed' }],
      warnings: ['low-liquidity periods skipped'],
    };

    const md = renderMarkdown(card);
    expect(md).toContain('- **Lifecycle state:** `PROMOTED_LIVE_ELIGIBLE`');
    expect(md).toContain('- **Hypothesis ID:** hyp-live-1');
    expect(md).toContain('- **Hypothesis:** Proven edge across 50 paper trades');
    expect(md).toContain('## Parameters');
    expect(md).toContain('| fastPeriod | 10 |');
    expect(md).toContain('## Fold Metrics');
    expect(md).toContain('| fold_0_sharpe | 2.2 |');
    expect(md).toContain('## Gates');
    expect(md).toContain('- `promoted-gate`: ✅ pass — all passed');
    expect(md).toContain('## Warnings');
    expect(md).toContain('- low-liquidity periods skipped');
  });

  it('omits optional sections when absent', () => {
    const card: RunCard = {
      schemaVersion: '1.0.0',
      runId: 'rc-minimal',
      configHash: 'hash-min',
      createdAt: '2026-09-28T12:00:00Z',
      resultClass: 'DISCOVERED',
      strategyRef: 'strat-min',
      dataSources: [],
      metrics: {},
      gateResults: [],
      warnings: [],
    };

    const md = renderMarkdown(card);
    expect(md).not.toContain('## Parameters');
    expect(md).not.toContain('## Fold Metrics');
    expect(md).not.toContain('## Gates');
    expect(md).not.toContain('## Warnings');
    expect(md).not.toContain('- **Lifecycle state:**');
    expect(md).not.toContain('- **Hypothesis ID:**');
    expect(md).toContain('_No data sources recorded._');
  });
});
