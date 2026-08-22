/**
 * Provenance Run Card
 *
 * Every experiment / backtest result is frozen into a run card before it can be
 * cited. A run card carries:
 *   - a SHA-256 hash of the frozen experiment config (reproducibility anchor)
 *   - a schema version (so card shape can evolve safely)
 *   - an ISO-8601 UTC timestamp
 *   - a `resultClass` that is enforced at the TYPE level (IS | OOS | PAPER | LIVE)
 *   - data source provenance (provider, symbol, timeframe, retrievedAt)
 *
 * Writing a card is fail-safe: a write failure is logged and recorded on the
 * card as `writeError` — it never throws away the result. But a card that
 * failed to write must never be silently cited as provenance.
 *
 * @see docs/ALPHA_DISCOVERY_ARCHITECTURE.md — "Provenance Contract"
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { logger } from '../../shared/utils/logger';

// ── Result Class (type-level enforced) ────────────────────────────────────────

/**
 * Discriminated union. The `resultClass` field is the ONLY legal way to label a
 * result; passing anything else is a compile-time error. This makes
 * "IS vs OOS vs PAPER vs LIVE" a property the compiler checks, not a comment
 * humans must remember to add.
 */
export type ResultClass =
  | { kind: 'IS' }
  | { kind: 'OOS' }
  | { kind: 'PAPER' }
  | { kind: 'LIVE' };

export type ResultClassName = ResultClass['kind'];

// ── Data Source Provenance ────────────────────────────────────────────────────

export interface DataSourceProvenance {
  /** Provider name (e.g. "gamma", "ccxt", "ohlcv-store"). */
  provider: string;
  /** Market / symbol identifier. */
  symbol: string;
  /** Candle timeframe. */
  timeframe: string;
  /** ISO-8601 start of the retrieved window. */
  start: string;
  /** ISO-8601 end of the retrieved window. */
  end: string;
  /** ISO-8601 when the data was retrieved. */
  retrievedAt: string;
  /** Number of candles in the window. */
  candleCount: number;
  /** Optional data-version tag (e.g. store schema version). */
  dataVersion?: string;
}

// ── Gate Result ───────────────────────────────────────────────────────────────

export interface GateResult {
  gateId: string;
  passed: boolean;
  detail?: string;
}

// ── Run Card ──────────────────────────────────────────────────────────────────

/** Schema version of the run-card format. Bump on any breaking shape change. */
export const RUN_CARD_SCHEMA_VERSION = '1.0.0';

export interface RunCard {
  schemaVersion: typeof RUN_CARD_SCHEMA_VERSION;
  runId: string;
  /** SHA-256 of the canonicalised config (lower-cased keys, sorted). */
  configHash: string;
  /** ISO-8601 UTC timestamp when the card was written. */
  createdAt: string;
  resultClass: ResultClassName;
  strategyRef: string;
  hypothesis?: string;
  dataSources: DataSourceProvenance[];
  metrics: Record<string, number | undefined>;
  gateResults: GateResult[];
  warnings: string[];
  /** Set when the card file itself failed to write (fail-safe — never throws). */
  writeError?: string;
}

// ── Input ─────────────────────────────────────────────────────────────────────

export interface WriteRunCardInput {
  runId: string;
  resultClass: ResultClassName;
  strategyRef: string;
  hypothesis?: string;
  dataSources: DataSourceProvenance[];
  metrics: Record<string, number | undefined>;
  gateResults?: GateResult[];
  warnings?: string[];
  /** Arbitrary frozen config object to hash for the reproducibility anchor. */
  config: Record<string, unknown>;
}

// ── Canonicalisation ──────────────────────────────────────────────────────────

/**
 * Deterministically canonicalise a config object for hashing:
 * stringify with sorted keys at every level, no whitespace, no undefined.
 */
export function canonicaliseConfig(config: Record<string, unknown>): string {
  return JSON.stringify(sortDeep(config));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      out[key] = sortDeep(v);
    }
    return out;
  }
  return value;
}

export function hashConfig(config: Record<string, unknown>): string {
  return createHash('sha256').update(canonicaliseConfig(config)).digest('hex');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Write a run card (JSON + markdown) into `runDir`. Fail-safe: never throws —
 * any write error is captured on the returned card as `writeError` and logged.
 */
export async function writeRunCard(
  runDir: string,
  input: WriteRunCardInput,
): Promise<RunCard> {
  const createdAt = new Date().toISOString();
  const card: RunCard = {
    schemaVersion: RUN_CARD_SCHEMA_VERSION,
    runId: input.runId,
    configHash: hashConfig(input.config),
    createdAt,
    resultClass: input.resultClass,
    strategyRef: input.strategyRef,
    hypothesis: input.hypothesis,
    dataSources: input.dataSources,
    metrics: input.metrics,
    gateResults: input.gateResults ?? [],
    warnings: input.warnings ?? [],
  };

  try {
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, 'run_card.json'), JSON.stringify(card, null, 2), 'utf8');
    await writeFile(join(runDir, 'run_card.md'), renderMarkdown(card), 'utf8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    card.writeError = message;
    logger.warn('Run card write failed (fail-safe, result preserved)', 'RunCard', {
      runId: input.runId,
      err: message,
    });
  }

  return card;
}

/** Render a run card as a human-readable markdown report. */
export function renderMarkdown(card: RunCard): string {
  const lines: string[] = [];
  lines.push(`# Run Card — ${card.runId}`);
  lines.push('');
  lines.push(`- **Schema:** \`${card.schemaVersion}\``);
  lines.push(`- **Created:** ${card.createdAt}`);
  lines.push(`- **Result class:** \`${card.resultClass}\``);
  lines.push(`- **Strategy:** ${card.strategyRef}`);
  lines.push(`- **Config hash:** \`${card.configHash}\``);
  if (card.hypothesis) {
    lines.push(`- **Hypothesis:** ${card.hypothesis}`);
  }
  if (card.writeError) {
    lines.push(`- **⚠️ Write error:** ${card.writeError}`);
  }
  lines.push('');
  lines.push('## Data sources');
  lines.push('');
  if (card.dataSources.length === 0) {
    lines.push('_No data sources recorded._');
  } else {
    for (const ds of card.dataSources) {
      lines.push(
        `- \`${ds.provider}\` ${ds.symbol}/${ds.timeframe} ` +
        `(${ds.candleCount} candles, ${ds.start} → ${ds.end}, retrieved ${ds.retrievedAt})` +
        (ds.dataVersion ? `, version ${ds.dataVersion}` : ''),
      );
    }
  }
  lines.push('');
  lines.push('## Metrics');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---|');
  for (const [key, value] of Object.entries(card.metrics)) {
    lines.push(`| ${key} | ${value === undefined ? 'n/a' : value} |`);
  }
  lines.push('');
  if (card.gateResults.length > 0) {
    lines.push('## Gates');
    lines.push('');
    for (const g of card.gateResults) {
      lines.push(`- \`${g.gateId}\`: ${g.passed ? '✅ pass' : '❌ fail'}${g.detail ? ` — ${g.detail}` : ''}`);
    }
    lines.push('');
  }
  if (card.warnings.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    for (const w of card.warnings) lines.push(`- ${w}`);
    lines.push('');
  }
  return lines.join('\n');
}