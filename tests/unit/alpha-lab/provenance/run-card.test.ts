/**
 * Run Card tests
 *
 * Covers: config hash determinism, canonicalisation (key order independence),
 * schema/version/ISO timestamp presence, fail-safe write (bad path does not
 * throw), markdown rendering, and the type-level enforcement of resultClass.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  writeRunCard,
  renderMarkdown,
  canonicaliseConfig,
  hashConfig,
  RUN_CARD_SCHEMA_VERSION,
} from '../../../../src/alpha-lab/provenance/run-card';
import type { WriteRunCardInput, ResultClassName, RunCard } from '../../../../src/alpha-lab/provenance/run-card';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_INPUT: WriteRunCardInput = {
  runId: 'run-001',
  resultClass: 'IS',
  strategyRef: 'rsi-mean-reversion',
  hypothesis: 'RSI oversold predicts reversals',
  dataSources: [
    {
      provider: 'gamma',
      symbol: 'BTC/USD',
      timeframe: '1h',
      start: '2026-01-01T00:00:00Z',
      end: '2026-01-02T00:00:00Z',
      retrievedAt: '2026-01-03T00:00:00Z',
      candleCount: 24,
    },
  ],
  metrics: { sharpe: 1.2, totalPnl: 1500, maxDrawdown: -0.08 },
  gateResults: [{ gateId: 'statistical_significance', passed: true }],
  warnings: [],
  config: {
    experimentId: 'exp-1',
    tp: 0.02,
    sl: 0.01,
    features: ['rsi', 'atr'],
    cost: { feeBps: 5, slippageBps: 2, scenario: 'normal' },
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'run-card-'));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

// ── Canonicalisation & Hash ───────────────────────────────────────────────────

describe('canonicaliseConfig', () => {
  it('is invariant under key order', () => {
    const a = canonicaliseConfig({ a: 1, b: 2, c: { x: 1, y: 2 } });
    const b = canonicaliseConfig({ c: { y: 2, x: 1 }, b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it('drops undefined keys', () => {
    const out = canonicaliseConfig({ a: 1, b: undefined });
    expect(out).toBe('{"a":1}');
  });

  it('sorts array elements by value (stable stringify)', () => {
    const out = canonicaliseConfig({ f: ['atr', 'rsi'] });
    expect(out).toBe('{"f":["atr","rsi"]}');
  });
});

describe('hashConfig', () => {
  it('is deterministic for the same logical config', () => {
    const h1 = hashConfig({ a: 1, b: { c: 2 } });
    const h2 = hashConfig({ b: { c: 2 }, a: 1 });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different configs', () => {
    expect(hashConfig({ a: 1 })).not.toBe(hashConfig({ a: 2 }));
  });
});

// ── writeRunCard ──────────────────────────────────────────────────────────────

describe('writeRunCard', () => {
  it('writes run_card.json and run_card.md', async () => {
    const card = await writeRunCard(tmp, BASE_INPUT);
    const json = JSON.parse(
      await (await import('node:fs/promises')).readFile(join(tmp, 'run_card.json'), 'utf8'),
    );
    expect(json.schemaVersion).toBe(RUN_CARD_SCHEMA_VERSION);
    expect(json.runId).toBe('run-001');
    expect(json.resultClass).toBe('IS');
    expect(json.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(json.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(json.gateResults).toHaveLength(1);
    expect(json.writeError).toBeUndefined();

    const md = await (await import('node:fs/promises')).readFile(join(tmp, 'run_card.md'), 'utf8');
    expect(md).toContain('Run Card — run-001');
    expect(md).toContain('IS');
  });

  it('config hash matches an independent hash of the canonicalised config', async () => {
    const card = await writeRunCard(tmp, BASE_INPUT);
    expect(card.configHash).toBe(hashConfig(BASE_INPUT.config));
  });

  it('is fail-safe: a bad directory does not throw', async () => {
    // A path component that is a file makes mkdir fail.
    const blocker = join(tmp, 'file-blocker');
    await writeFile(blocker, 'x', 'utf8');
    const badDir = join(blocker, 'sub');
    const card = await writeRunCard(badDir, BASE_INPUT);
    expect(card.writeError).toBeDefined();
    expect(card.writeError!.length).toBeGreaterThan(0);
  });

  it('resultClass is type-enforced: non-literal values are rejected at compile time', () => {
    // The literal values compile; a bogus string literal is a type error.
    const ok: ResultClassName = 'OOS';
    expect(ok).toBe('OOS');
    // @ts-expect-error — 'FOO' is not a valid result class
    const bad: ResultClassName = 'FOO';
    expect(bad).not.toBe(ok);
  });

  it('rejects a WriteRunCardInput with an invalid resultClass via @ts-expect-error', async () => {
    // This call site must NOT type-check; the comment suppresses the error.
    // @ts-expect-error — resultClass must be IS|OOS|PAPER|LIVE
    await writeRunCard(tmp, { ...BASE_INPUT, resultClass: 'BOGUS' });
  });

  it('handles optional fields default fallback (gateResults and warnings omitted)', async () => {
    const input: WriteRunCardInput = {
      runId: 'run-defaults',
      resultClass: 'OOS',
      strategyRef: 'strat-defaults',
      dataSources: [],
      metrics: { pnl: 100 },
      config: { x: 1 },
    };
    const card = await writeRunCard(tmp, input);
    expect(card.gateResults).toEqual([]);
    expect(card.warnings).toEqual([]);
    expect(card.hypothesis).toBeUndefined();
  });

  it('handles non-Error throw values with String(err) in writeRunCard', async () => {
    const badMetrics: Record<string, number | undefined> = {
      get broken(): number {
        throw 'non-error-write-fail';
      },
    };
    const input: WriteRunCardInput = {
      runId: 'run-non-error',
      resultClass: 'IS',
      strategyRef: 'strat',
      dataSources: [],
      metrics: badMetrics,
      config: { key: 'val' },
    };
    const card = await writeRunCard(tmp, input);
    expect(card.writeError).toBe('non-error-write-fail');
  });
});

// ── renderMarkdown ────────────────────────────────────────────────────────────

describe('renderMarkdown', () => {
  it('renders all sections and omits empty ones', async () => {
    const card = await writeRunCard(tmp, BASE_INPUT);
    const md = renderMarkdown(card);
    expect(md).toContain('## Data sources');
    expect(md).toContain('## Metrics');
    expect(md).toContain('## Gates');
    expect(md).toContain('rsi-mean-reversion');
    expect(md).toContain('statistical_significance');
  });

  it('renders warnings when present', async () => {
    const card = await writeRunCard(tmp, { ...BASE_INPUT, warnings: ['low coverage'] });
    expect(renderMarkdown(card)).toContain('## Warnings');
  });

  it('renders markdown with write error, empty data sources, missing hypothesis, and gate failure with detail', () => {
    const card: RunCard = {
      schemaVersion: '1.0.0',
      runId: 'run-custom-001',
      configHash: 'hash-abc',
      createdAt: '2026-01-01T00:00:00Z',
      resultClass: 'IS',
      strategyRef: 'test-strategy',
      dataSources: [],
      metrics: { sharpe: 1.5, drawdown: undefined },
      gateResults: [{ gateId: 'gate-1', passed: false, detail: 'failed threshold' }],
      warnings: [],
      writeError: 'disk quota reached',
    };
    const md = renderMarkdown(card);
    expect(md).toContain('- **⚠️ Write error:** disk quota reached');
    expect(md).toContain('_No data sources recorded._');
    expect(md).toContain('| drawdown | n/a |');
    expect(md).toContain('- `gate-1`: ❌ fail — failed threshold');
    expect(md).not.toContain('- **Hypothesis:**');
    expect(md).not.toContain('## Warnings');
  });

  it('renders data source with dataVersion in markdown', () => {
    const card: RunCard = {
      schemaVersion: '1.0.0',
      runId: 'run-versioned',
      configHash: 'hash-abc',
      createdAt: '2026-01-01T00:00:00Z',
      resultClass: 'IS',
      strategyRef: 'test-strategy',
      dataSources: [
        {
          provider: 'gamma',
          symbol: 'ETH/USD',
          timeframe: '1h',
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-02T00:00:00Z',
          retrievedAt: '2026-01-03T00:00:00Z',
          candleCount: 24,
          dataVersion: 'v2.1',
        },
      ],
      metrics: {},
      gateResults: [],
      warnings: [],
    };
    const md = renderMarkdown(card);
    expect(md).toContain(', version v2.1');
    expect(md).not.toContain('## Gates');
  });
});

// ── transform provenance (additive field, schema stays 1.0.0) ────────────────

describe('DataSourceProvenance.transform', () => {
  const TRANSFORM =
    "source table funding_rates (binance-futures); symbol prefix 'BTC-FUNDING-'; " +
    'close_bps = 10000 + fundingRate * 10000; open = previous close (causal chain); ' +
    'high/low = max/min(open, close); volume = 0; underlying symbol BTCUSDT';

  const FUNDING_INPUT: WriteRunCardInput = {
    ...BASE_INPUT,
    runId: 'run-funding-001',
    dataSources: [
      {
        provider: 'funding-store',
        symbol: 'BTC-FUNDING-BTCUSDT',
        timeframe: '8h',
        start: '2026-01-01T00:00:00Z',
        end: '2026-01-02T00:00:00Z',
        retrievedAt: '2026-01-03T00:00:00Z',
        candleCount: 3,
        transform: TRANSFORM,
      },
    ],
  };

  it('survives JSON round-trip and keeps schema version 1.0.0', async () => {
    const card = await writeRunCard(tmp, FUNDING_INPUT);
    expect(card.schemaVersion).toBe('1.0.0');
    expect(RUN_CARD_SCHEMA_VERSION).toBe('1.0.0');

    const json = JSON.parse(
      await (await import('node:fs/promises')).readFile(join(tmp, 'run_card.json'), 'utf8'),
    );
    expect(json.dataSources[0].provider).toBe('funding-store');
    expect(json.dataSources[0].transform).toBe(TRANSFORM);
    expect(json.dataSources[0].transform).toContain('10000');
  });

  it('renders the transform in the markdown data-source section', async () => {
    const card = await writeRunCard(tmp, FUNDING_INPUT);
    const md = renderMarkdown(card);
    expect(md).toContain('transform:');
    expect(md).toContain('funding_rates');
    expect(md).toContain('10000');
  });

  it('omits transform for sources without one (backward compat)', async () => {
    const card = await writeRunCard(tmp, BASE_INPUT);
    const json = JSON.parse(
      await (await import('node:fs/promises')).readFile(join(tmp, 'run_card.json'), 'utf8'),
    );
    expect(json.dataSources[0].transform).toBeUndefined();
    expect(renderMarkdown(card)).not.toContain('transform:');
  });
});