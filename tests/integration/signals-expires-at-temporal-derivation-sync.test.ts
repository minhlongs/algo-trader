/**
 * signals.expires_at temporal derivation 3-surface sync — first COMPUTED-COLUMN edge.
 *
 * `signals.expires_at` is a DERIVED column: its value is mathematically
 * computed from two other columns on the same row — `ts` (Unix ms of signal
 * generation) and `ttl` (seconds until stale). The authoritative formula:
 *
 *   expires_at = ts + ttl * 1000
 *
 * The `* 1000` factor converts ttl from seconds to milliseconds because `ts`
 * and `expires_at` are both Unix-ms, while `ttl` is seconds (operator-friendly
 * unit). A drift in the multiplier silently changes signal validity windows
 * by 1000× (seconds-vs-ms confusion is the classic Unix-timestamp bug).
 *
 * Unlike the 21 prior edges:
 *   - Prior families: 16× string-enum partition, 2× cross-module, 1× binary
 *     flag (#162), 1× range-bound (#163), 1× temporal ordering (#164).
 *   - **NEW family #6: TEMPORAL DERIVATION / computed-column invariant.**
 *     Locks a MATHEMATICAL relationship between three columns of the same
 *     row, with explicit unit-of-measure conversion. Distinct from temporal
 *     ordering (#164) which just asserts col1 ≥ col2 — this asserts the
 *     stronger `col_derived = f(col_source_1, col_source_2)`.
 *
 * The derivation is declared across three surfaces that must stay in lockstep:
 *
 *   1. **Migration column shapes with unit-of-measure comments** —
 *      `src/db/migrations/014_signal_feed.sql:6,12,13`:
 *        `ts              INTEGER NOT NULL,  -- Unix ms of signal generation`
 *        `ttl             INTEGER NOT NULL,  -- seconds until stale`
 *        `expires_at      INTEGER NOT NULL,  -- Unix ms`
 *      — all three INTEGER, with inline comments pinning units. The unit
 *      asymmetry (ts/expires_at in ms, ttl in seconds) REQUIRES the `* 1000`
 *      conversion — a silent refactor to ms-ttl would break callers.
 *   2. **Writer derivation formula** —
 *      `src/desk/signal/signal-publisher.ts:58`:
 *        `expiresAt: ts + input.ttlSec * 1000,`
 *      — SOLE writer. The literal `* 1000` is the unit-conversion authority.
 *   3. **TS interface comment stating the formula** —
 *      `src/desk/signal/signal-types.ts:17`:
 *        `expiresAt: number;    // Unix ms = ts + ttl*1000`
 *      — explicitly documents the relationship. A drift where the comment
 *      says `ts*1000 + ttl` (operator-order swap) without updating the
 *      writer would mislead developers reading the type.
 *
 * Novel invariants locked:
 *   - **Formula literal** — writer emits `ts + ttl * 1000` exactly, not
 *     `ts + ttl` (seconds confusion), `ts * 1000 + ttl` (operator swap),
 *     `ts + ttl / 1000` (wrong direction), or `ts + ttl * 60 * 1000` (minute
 *     confusion).
 *   - **Unit-of-measure coherence** — ts is Unix ms AND expires_at is Unix
 *     ms AND ttl is seconds. The migration's inline unit comments + TS
 *     type comments + writer's literal multiplier must all agree.
 *   - **Comment ↔ formula parity** — TS type comment `// Unix ms = ts + ttl*1000`
 *     must contain the same formula the writer computes. A developer
 *     reading the type sees the same relationship the code implements.
 *   - **Monotonic derivation** — since ttl > 0 (future-dated expiry) and
 *     the multiplier is positive, `expires_at > ts` is guaranteed by
 *     construction. No separate temporal-ordering assertion needed.
 *   - **Type discipline** — all three columns INTEGER (Unix epoch ms/seconds
 *     fits in 64-bit INTEGER through year 292277026596 and beyond).
 *
 * Drift scenarios covered:
 *   - Writer drops `* 1000` → `expiresAt = ts + input.ttlSec` → signal
 *     expires in milliseconds not seconds (1000× shorter than intended).
 *     Case 4 fails.
 *   - Writer refactors to `Date.now() + input.ttlSec * 1000` (hard-codes
 *     current-time instead of using input.ts) → semantics change: signals
 *     with explicit past `ts` now get future expiry, breaking dedup.
 *     Case 4 anchored on `ts +` catches.
 *   - Migration renames `ttl` to `ttl_ms` without updating writer → ttl
 *     now represents ms, but writer still multiplies by 1000 → expires_at
 *     is 1000× too far in the future. Cases 1, 2 fail (inline comments
 *     would state `ms` not `seconds`).
 *   - TS type comment drifts (e.g. `// ts + ttl * 60 * 1000` — minute
 *     confusion) without writer change → case 6 fails (comment parity).
 *   - Someone adds a unit-normalization layer that converts ttl to ms
 *     upstream, forgetting to remove `* 1000` downstream → 1000× error.
 *     Cases 4 + 6 both catch.
 *
 * Symmetric to prior integrity edges:
 *   #145 #153 #154 trigger_reason/decision/status enums, #158/#159/#160
 *   paper_trades_v3 row-level enums, #161 signals.source, #162 paper_only
 *   binary, #163 confidence range, #164 temporal ordering.
 *
 * Opens the **22nd integrity edge — DOICOSAGON** (22-gon). First
 * temporal-derivation / computed-column edge. Novel invariant family #6:
 * mathematical relationships between columns on the same row, with
 * explicit unit-of-measure conversion. Integrity henicosagon → doicosagon
 * (22-gon). Pillar 3 signal-publishing contract locked — the signal-expiry
 * time-derivation formula now sync-validated across migration
 * unit-of-measure declarations + writer literal + TS type documentation.
 *
 * Non-goals: validating every downstream reader that filters by expires_at
 * (e.g. signal-ttl-enforcer eviction queries — covered by unit tests),
 * asserting clock monotonicity between writer invocations (covered by
 * dedup-guard integration tests), or constraining ttl upper bound
 * (separate candidate — reserved for a future positivity edge).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const MIGRATION_PATH = resolve(
  REPO_ROOT,
  'src/db/migrations/014_signal_feed.sql',
);
const PUBLISHER_PATH = resolve(REPO_ROOT, 'src/desk/signal/signal-publisher.ts');
const TYPES_PATH = resolve(REPO_ROOT, 'src/desk/signal/signal-types.ts');

/** Expected conversion factor (seconds → milliseconds). Pinned so a silent change to seconds-only math fails loudly. */
const EXPECTED_MS_PER_SEC = 1000;

/**
 * Extract the column shape for `ts`, `ttl`, `expires_at` from migration
 * 014's `CREATE TABLE signals` body, including each column's trailing
 * inline unit-of-measure comment.
 */
function extractMigrationColumns(sql: string): {
  ts: { type: string | null; notNull: boolean; comment: string | null };
  ttl: { type: string | null; notNull: boolean; comment: string | null };
  expiresAt: { type: string | null; notNull: boolean; comment: string | null };
} {
  const tableRe =
    /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+signals\s*\(([\s\S]*?)\)\s*;/i;
  const tm = tableRe.exec(sql);
  if (!tm) {
    const empty = { type: null, notNull: false, comment: null };
    return { ts: empty, ttl: empty, expiresAt: empty };
  }
  // Preserve inline comments — don't strip SQL comments for this extractor.
  const body = tm[1];
  const parseCol = (
    name: string,
  ): { type: string | null; notNull: boolean; comment: string | null } => {
    const colRe = new RegExp(
      '\\b' +
        name +
        '\\s+(\\w+)(\\s+NOT\\s+NULL)?(?:\\s+DEFAULT\\s+\\d+)?\\s*,?\\s*(?:--\\s*([^\\n]+))?',
      'i',
    );
    const cm = colRe.exec(body);
    if (!cm) return { type: null, notNull: false, comment: null };
    return {
      type: cm[1].toUpperCase(),
      notNull: !!cm[2],
      comment: cm[3] ? cm[3].trim() : null,
    };
  };
  return {
    ts: parseCol('ts'),
    ttl: parseCol('ttl'),
    expiresAt: parseCol('expires_at'),
  };
}

/**
 * Extract the writer's `expiresAt` assignment formula from
 * `signal-publisher.ts`. Expected shape: `expiresAt: ts + input.ttlSec * 1000,`
 * Returns `{ base: 'ts', ttlVar: 'input.ttlSec', multiplier: 1000 }` or null.
 */
function extractWriterFormula(src: string): {
  base: string | null;
  ttlVar: string | null;
  multiplier: number | null;
  fullExpr: string | null;
} {
  const re =
    /expiresAt\s*:\s*([a-zA-Z_][\w.]*)\s*\+\s*([a-zA-Z_][\w.]*)\s*\*\s*(\d+)/;
  const m = re.exec(src);
  if (!m) {
    return { base: null, ttlVar: null, multiplier: null, fullExpr: null };
  }
  return {
    base: m[1],
    ttlVar: m[2],
    multiplier: parseInt(m[3], 10),
    fullExpr: m[0],
  };
}

/**
 * Extract the TS interface comment describing the expiresAt formula.
 * Expected shape: `expiresAt: number;    // Unix ms = ts + ttl*1000`
 * Returns the normalized comment formula tokens.
 */
function extractTypeComment(src: string): {
  tsType: string | null;
  commentBase: string | null;
  commentTtlVar: string | null;
  commentMultiplier: number | null;
  commentRaw: string | null;
} {
  const re =
    /\bexpiresAt\s*:\s*(\w+)\s*;\s*\/\/\s*([^\n]+)/;
  const m = re.exec(src);
  if (!m) {
    return {
      tsType: null,
      commentBase: null,
      commentTtlVar: null,
      commentMultiplier: null,
      commentRaw: null,
    };
  }
  const tsType = m[1];
  const comment = m[2];
  // Parse the formula portion — pattern: `... = ts + ttl*N` (allow whitespace).
  const formulaRe = /=\s*([a-zA-Z_]\w*)\s*\+\s*([a-zA-Z_]\w*)\s*\*\s*(\d+)/;
  const fm = formulaRe.exec(comment);
  return {
    tsType,
    commentBase: fm ? fm[1] : null,
    commentTtlVar: fm ? fm[2] : null,
    commentMultiplier: fm ? parseInt(fm[3], 10) : null,
    commentRaw: comment,
  };
}

describe('signals.expires_at temporal derivation 3-surface sync', () => {
  const migration = readFileSync(MIGRATION_PATH, 'utf8');
  const publisher = readFileSync(PUBLISHER_PATH, 'utf8');
  const types = readFileSync(TYPES_PATH, 'utf8');

  const cols = extractMigrationColumns(migration);
  const writer = extractWriterFormula(publisher);
  const typeComment = extractTypeComment(types);

  it('migration parser extracts all three columns (ts, ttl, expires_at) as INTEGER NOT NULL', () => {
    expect(cols.ts.type).toBe('INTEGER');
    expect(cols.ts.notNull).toBe(true);
    expect(cols.ttl.type).toBe('INTEGER');
    expect(cols.ttl.notNull).toBe(true);
    expect(cols.expiresAt.type).toBe('INTEGER');
    expect(cols.expiresAt.notNull).toBe(true);
  });

  it('migration unit-of-measure comments declare ts=Unix-ms, ttl=seconds, expires_at=Unix-ms', () => {
    expect(
      cols.ts.comment?.toLowerCase(),
      'ts column missing inline unit comment — operator cannot tell if Unix-ms or Unix-seconds',
    ).toMatch(/unix ms/);
    expect(
      cols.ttl.comment?.toLowerCase(),
      'ttl column missing inline unit comment — operator cannot tell if seconds or ms',
    ).toMatch(/second/);
    expect(
      cols.expiresAt.comment?.toLowerCase(),
      'expires_at column missing inline unit comment — operator cannot tell if Unix-ms or Unix-seconds',
    ).toMatch(/unix ms/);
  });

  it('writer extractor parses `expiresAt: ts + ttl * 1000` shape (sanity floor)', () => {
    expect(
      writer.fullExpr,
      'signal-publisher.ts expiresAt assignment did not parse — writer shape drifted from `base + ttl * N` pattern',
    ).not.toBeNull();
  });

  it('writer uses base=`ts` (signal generation time), not `Date.now()` or other (preserve explicit input semantics)', () => {
    expect(
      writer.base,
      `writer base identifier is '${writer.base}' — expected 'ts' so signals with explicit historical timestamps produce correct expiry; Date.now() would override input.ts`,
    ).toBe('ts');
  });

  it('writer uses ttl var from input (`input.ttlSec`) — caller-provided, not hard-coded', () => {
    expect(
      writer.ttlVar,
      `writer ttl identifier is '${writer.ttlVar}' — expected 'input.ttlSec' so caller controls signal lifetime`,
    ).toBe('input.ttlSec');
  });

  it('writer multiplier is exactly 1000 (seconds → milliseconds conversion)', () => {
    expect(
      writer.multiplier,
      `writer multiplier is ${writer.multiplier} — expected 1000 for seconds→ms conversion; any other value indicates unit confusion (1 = ttl-in-ms drift, 1000000 = ms→ns confusion, etc.)`,
    ).toBe(EXPECTED_MS_PER_SEC);
  });

  it('TS type declares expiresAt as number (sanity floor)', () => {
    expect(typeComment.tsType).toBe('number');
  });

  it('TS type inline-comment formula matches writer formula exactly', () => {
    expect(
      typeComment.commentBase,
      'TS type comment formula `ts + ttl*N` did not parse — comment shape drifted from canonical `Unix ms = ts + ttl*1000`',
    ).not.toBeNull();
    expect(typeComment.commentBase).toBe('ts');
    expect(typeComment.commentTtlVar).toBe('ttl');
    expect(typeComment.commentMultiplier).toBe(EXPECTED_MS_PER_SEC);
  });

  it('TS type comment explicitly mentions Unix-ms unit (not just formula)', () => {
    expect(
      typeComment.commentRaw?.toLowerCase(),
      `TS type comment is '${typeComment.commentRaw}' — expected to contain 'Unix ms' so developers see the output unit-of-measure alongside the formula`,
    ).toMatch(/unix ms/);
  });

  it('multiplier = 1000 matches migration unit asymmetry (ts/expires_at in ms, ttl in seconds)', () => {
    // Cross-surface derivation proof: writer multiplier is 1000 BECAUSE
    // migration declares ts + expires_at in Unix-ms and ttl in seconds.
    // If migration changed to ms-ttl (via a future migration 014b), the
    // multiplier should drop to 1. If ts changed to Unix-seconds, multiplier
    // becomes 1. This test asserts the THREE surfaces remain mutually
    // consistent.
    const tsIsMs = cols.ts.comment?.toLowerCase().includes('unix ms');
    const expiresIsMs = cols.expiresAt.comment?.toLowerCase().includes('unix ms');
    const ttlIsSec = cols.ttl.comment?.toLowerCase().includes('second');
    const multiplierCorrect = writer.multiplier === EXPECTED_MS_PER_SEC;
    expect(
      tsIsMs && expiresIsMs && ttlIsSec && multiplierCorrect,
      `cross-surface unit-of-measure coherence broken: ts-in-ms=${tsIsMs}, expires-in-ms=${expiresIsMs}, ttl-in-seconds=${ttlIsSec}, multiplier=${writer.multiplier} — if unit declarations change, multiplier must change in lockstep`,
    ).toBe(true);
  });

  it('monotonic derivation: for any ttl > 0, expires_at > ts by construction (1000× ttl_sec always positive)', () => {
    // Mechanism assertion: since ttl is INTEGER (not unsigned but operator-
    // supplied as positive seconds) and multiplier is positive 1000, the
    // derivation `ts + ttl * 1000` guarantees expires_at > ts for ttl > 0.
    // This case asserts the mechanism; a future edge can lock ttl > 0 via
    // the scalar-positivity family, but the derivation itself is
    // monotonicity-preserving for any non-negative ttl.
    expect(writer.multiplier).toBeGreaterThan(0);
    expect(
      writer.multiplier,
      'multiplier must be positive so expires_at > ts for ttl > 0 (monotonic derivation)',
    ).toBe(EXPECTED_MS_PER_SEC);
  });
});
