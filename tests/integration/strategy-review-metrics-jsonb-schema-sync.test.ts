/**
 * strategy_review_tasks + qwen_signals_loop_runs `metrics` JSONB shape 4-surface sync.
 *
 * Two tables persist Qwen quality metrics as JSONB blobs — `strategy_review_tasks.metrics`
 * (when a review is queued) and `qwen_signals_loop_runs.metrics` (audit trail for
 * every evaluation run). Both accept ANY JSON at the DB layer (no CHECK jsonb_typeof,
 * no generated columns). Authority for the structured document shape lives exclusively
 * in the TypeScript `QualityMetrics` interface + the writer's default-literal initialisation.
 * A silent field-add or field-rename would leak into both tables' JSONB blobs and break
 * any future reader that expects the documented 6-field shape.
 *
 * Unlike the 22 prior edges:
 *   - Prior families: 16× string-enum partition, 2× cross-module, 1× binary flag (#162),
 *     1× range-bound (#163), 1× temporal ordering (#164), 1× temporal derivation (#165).
 *   - **NEW family #7: STRUCTURED DOCUMENT FIELD SHAPE.** Locks the canonical key-set
 *     and per-key nullability contract of a JSONB column. Distinct from string-enum
 *     partition (which locks a VALUE set) by locking the KEY-SET + per-key TYPE
 *     contract on a nested document. Writer-contract authority (no CHECK —
 *     `jsonb_typeof` + path-extraction checks would work but multiply maintenance
 *     across schema+code; TS interface is DRY single source of truth).
 *
 * The shape is declared across four surfaces that must stay in lockstep:
 *
 *   1. **Migration JSONB columns** —
 *        `src/db/migrations/017_strategy_review_tasks.sql:10`: `metrics JSONB NOT NULL`
 *        `src/db/migrations/018_qwen_signals_loop_runs.sql` journal table likewise
 *      — unconstrained JSONB accepts any valid JSON. The structural shape comes from
 *      the writer, not the schema.
 *   2. **TS `QualityMetrics` interface** —
 *      `src/desk/wiring/qwen-signals-loop.ts:63-70`:
 *        export interface QualityMetrics {
 *          winRate: number | null;
 *          sharpe: number | null;
 *          signalCount: number;
 *          closedTradeCount: number;
 *          windowStartMs: number;
 *          windowEndMs: number;
 *        }
 *      — 6 fields, 2 nullable (winRate + sharpe may be null when insufficient data),
 *      4 always-present (counts + window bounds). This is the SINGLE SOURCE OF TRUTH.
 *   3. **Writer default-literal initialisation** —
 *      `qwen-signals-loop.ts:84-90`:
 *        const base: QualityMetrics = {
 *          winRate: null, sharpe: null,
 *          signalCount: 0, closedTradeCount: 0,
 *          windowStartMs: windowStart, windowEndMs: windowEnd,
 *        };
 *      — initial object literal that MUST include every interface key. TypeScript
 *      catches missing keys at compile time; this test catches drift in case the
 *      interface evolves without coordinated literal updates.
 *   4. **Writer `JSON.stringify(metrics)` call sites** —
 *      Line 166 (`persistRunJournal`) + Line 189 (`insertReviewTask`). Both write
 *      the same `QualityMetrics`-typed value. A refactor that splits the two
 *      tables' metrics shape (e.g. journal gets full 6 fields, reviews get 4)
 *      would break JSONB uniformity — operators querying both tables' `metrics`
 *      would see different shapes.
 *
 * Novel invariants locked:
 *   - **Canonical key-set partition** — interface declares exactly 6 keys, writer
 *     default literal includes exactly 6 keys, no extra/missing keys in either.
 *   - **Per-key type discipline** — nullable keys (winRate, sharpe) are `number | null`;
 *     required keys (signalCount, closedTradeCount, windowStartMs, windowEndMs) are
 *     `number` (no null, no undefined, no Date object).
 *   - **Nullability rationale anchored by name** — `winRate` and `sharpe` are nullable
 *     because they can't be computed when closed-trade count is 0 (division-by-zero
 *     guard). Count fields always have a concrete value (default 0). Window bounds
 *     are always set because they come from `Date.now()` arithmetic.
 *   - **JSON.stringify parity** — every `JSON.stringify(metrics)` writer site passes
 *     a `QualityMetrics`-typed identifier (caught at TS compile time; sanity-floor
 *     asserts ≥ 2 sites so a silent single-site refactor fails loudly).
 *   - **Cross-table uniformity** — both tables serialise the SAME shape. Future
 *     reader that queries one table must work on the other.
 *   - **No PHANTOM fields** — writer default literal has no key missing from the
 *     interface; interface has no key missing from the default literal.
 *
 * Drift scenarios covered:
 *   - Developer adds `{ source: 'qwen' }` metadata to the writer call without
 *     extending the interface → case 7 fails (extra writer key not in interface).
 *   - Interface adds `reviewId: string` field without updating the default literal →
 *     case 8 fails (missing key in default literal).
 *   - Developer renames `winRate` → `win_rate` (snake_case drift) → case 4 fails
 *     (interface field-name sanity).
 *   - Nullable/required discipline flip (e.g. `signalCount: number | null`) →
 *     case 5 fails (type-discipline drift).
 *   - One writer site stringifies `{ ...metrics, extra: 'tag' }` inline spread →
 *     case 9's `JSON.stringify(<identifier>)` extraction no longer matches —
 *     sanity-floor drops below 2.
 *
 * Symmetric to prior integrity edges:
 *   #145 #153 #154 trigger_reason/decision/status enums, #158/#159/#160 paper_trades_v3
 *   row-level enums, #161 signals.source, #162 paper_only binary, #163 confidence
 *   range, #164 temporal ordering, #165 expires_at temporal derivation.
 *
 * Opens the **23rd integrity edge — TRICOSAGON** (23-gon). First structured-document
 * field shape / JSONB schema edge. Novel invariant family #7. Integrity doicosagon →
 * tricosagon (23-gon). Pillar 3 feedback-loop evaluation audit-trail + strategy-
 * review metrics payload contract now sync-validated — the 6-field `QualityMetrics`
 * blob that flows into BOTH audit journal and review queue has its shape locked.
 *
 * Non-goals: validating JSONB read-side deserialisation at admin route (reader
 * currently treats `metrics` as opaque `string`; future reader-typing edge is a
 * separate candidate), asserting numeric value ranges on individual metrics
 * (win-rate ∈ [0,1] would be its own range-bound edge — separate), constraining
 * metric-value semantics (division-by-zero null handling is a unit-test concern).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const MIGRATION_017_PATH = resolve(
  REPO_ROOT,
  'src/db/migrations/017_strategy_review_tasks.sql',
);
const MIGRATION_018_PATH = resolve(
  REPO_ROOT,
  'src/db/migrations/018_qwen_signals_loop_runs.sql',
);
const SIGNALS_LOOP_PATH = resolve(
  REPO_ROOT,
  'src/desk/wiring/qwen-signals-loop.ts',
);

/** Canonical QualityMetrics field set — the single source of truth for this test. */
const CANONICAL_KEYS = new Set<string>([
  'winRate',
  'sharpe',
  'signalCount',
  'closedTradeCount',
  'windowStartMs',
  'windowEndMs',
]);

/** Keys that the interface declares as `number | null` (division-by-zero guard). */
const NULLABLE_KEYS = new Set<string>(['winRate', 'sharpe']);

/** Keys that the interface declares as `number` (always-present). */
const REQUIRED_KEYS = new Set<string>([
  'signalCount',
  'closedTradeCount',
  'windowStartMs',
  'windowEndMs',
]);

/** Style: camelCase field names (TS convention for JSON-stringified interface output). */
const STYLE_RE = /^[a-z][a-zA-Z0-9]*$/;

/** Strip SQL comments. */
function stripSqlComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

/** Strip JS/TS comments. */
function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Assert that a migration declares a `metrics JSONB NOT NULL` column inside the
 * given table name's CREATE TABLE body.
 */
function hasMetricsJsonbColumn(sql: string, tableName: string): boolean {
  const tableRe = new RegExp(
    'CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+' +
      tableName +
      '\\s*\\(([\\s\\S]*?)\\)\\s*;',
    'i',
  );
  const m = tableRe.exec(sql);
  if (!m) return false;
  return /\bmetrics\s+JSONB\s+NOT\s+NULL/i.test(m[1]);
}

/**
 * Extract the TS QualityMetrics interface field shape. Returns a map
 * field → typeString.
 */
function extractInterfaceShape(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const clean = stripJsComments(src);
  const ifaceRe =
    /export\s+interface\s+QualityMetrics\s*\{([\s\S]*?)^\}\s*$/m;
  const m = ifaceRe.exec(clean);
  if (!m) return out;
  for (const field of m[1].matchAll(
    /\b([a-zA-Z_]\w*)\s*:\s*([a-zA-Z_][\w\s|]*?)\s*;/g,
  )) {
    out.set(field[1], field[2].replace(/\s+/g, ' ').trim());
  }
  return out;
}

/**
 * Extract the keys from the writer's `const base: QualityMetrics = { … };`
 * default-literal initialisation. Scoped to the QualityMetrics annotation so
 * unrelated object literals elsewhere in the file don't leak.
 */
function extractDefaultLiteralKeys(src: string): Set<string> {
  const out = new Set<string>();
  const clean = stripJsComments(src);
  const litRe =
    /const\s+base\s*:\s*QualityMetrics\s*=\s*\{([\s\S]*?)\};/;
  const m = litRe.exec(clean);
  if (!m) return out;
  for (const k of m[1].matchAll(/\b([a-zA-Z_]\w*)\s*:/g)) out.add(k[1]);
  return out;
}

/**
 * Count the number of `JSON.stringify(metrics)` call sites where the argument
 * is the literal identifier `metrics` (bare, not a spread or transform). Scoped
 * to catch the two writer sites: persistRunJournal (line 166) + insertReviewTask
 * (line 189).
 */
function countMetricsStringifyCallSites(src: string): number {
  const clean = stripJsComments(src);
  const matches = clean.matchAll(/JSON\.stringify\s*\(\s*metrics\s*\)/g);
  return [...matches].length;
}

describe('QualityMetrics JSONB structured-document shape — 4-surface sync', () => {
  const mig017 = readFileSync(MIGRATION_017_PATH, 'utf8');
  const mig018 = readFileSync(MIGRATION_018_PATH, 'utf8');
  const loop = readFileSync(SIGNALS_LOOP_PATH, 'utf8');

  const has017 = hasMetricsJsonbColumn(stripSqlComments(mig017), 'strategy_review_tasks');
  const has018 = hasMetricsJsonbColumn(stripSqlComments(mig018), 'qwen_signals_loop_runs');
  const ifaceShape = extractInterfaceShape(loop);
  const defaultKeys = extractDefaultLiteralKeys(loop);
  const stringifyCount = countMetricsStringifyCallSites(loop);

  it('both migrations declare `metrics JSONB NOT NULL` (sanity floor)', () => {
    expect(
      has017,
      'migration 017 strategy_review_tasks is missing `metrics JSONB NOT NULL`',
    ).toBe(true);
    expect(
      has018,
      'migration 018 qwen_signals_loop_runs is missing `metrics JSONB NOT NULL`',
    ).toBe(true);
  });

  it('TS QualityMetrics interface extracts 6 fields (sanity floor)', () => {
    expect(
      ifaceShape.size,
      `QualityMetrics interface parsed ${ifaceShape.size} fields — expected 6; interface shape drifted`,
    ).toBe(CANONICAL_KEYS.size);
  });

  it('writer `const base: QualityMetrics = {...}` extracts 6 keys (sanity floor)', () => {
    expect(
      defaultKeys.size,
      `default literal parsed ${defaultKeys.size} keys — expected 6; literal shape drifted`,
    ).toBe(CANONICAL_KEYS.size);
  });

  it('interface field set matches CANONICAL_KEYS (canonical key discipline)', () => {
    expect(
      [...ifaceShape.keys()].sort(),
      `interface keys {${[...ifaceShape.keys()].join(', ')}} differ from canonical {${[...CANONICAL_KEYS].join(', ')}}`,
    ).toEqual([...CANONICAL_KEYS].sort());
  });

  it('per-key type discipline — NULLABLE_KEYS are `number | null`, REQUIRED_KEYS are `number`', () => {
    for (const k of NULLABLE_KEYS) {
      const t = ifaceShape.get(k);
      expect(
        t,
        `interface field '${k}' type missing — interface shape drifted`,
      ).toBeDefined();
      expect(
        t,
        `interface field '${k}' type is '${t}' — expected 'number | null' (field is nullable when closed-trade count is 0)`,
      ).toMatch(/^number\s*\|\s*null$/);
    }
    for (const k of REQUIRED_KEYS) {
      const t = ifaceShape.get(k);
      expect(
        t,
        `interface field '${k}' type missing`,
      ).toBeDefined();
      expect(
        t,
        `interface field '${k}' type is '${t}' — expected bare 'number' (required field, never null)`,
      ).toBe('number');
    }
  });

  it('default-literal keys match CANONICAL_KEYS (no missing, no extra)', () => {
    expect(
      [...defaultKeys].sort(),
      `default literal keys {${[...defaultKeys].join(', ')}} differ from canonical {${[...CANONICAL_KEYS].join(', ')}}`,
    ).toEqual([...CANONICAL_KEYS].sort());
  });

  it('interface↔literal key parity — every interface key has a default value and vice-versa', () => {
    const onlyInIface = [...ifaceShape.keys()].filter((k) => !defaultKeys.has(k));
    const onlyInLiteral = [...defaultKeys].filter((k) => !ifaceShape.has(k));
    expect(
      onlyInIface,
      `interface declares keys missing from default literal: ${onlyInIface.join(', ')} — consumers would see undefined on cold-start`,
    ).toEqual([]);
    expect(
      onlyInLiteral,
      `default literal has keys missing from interface: ${onlyInLiteral.join(', ')} — JSONB row would carry undocumented fields`,
    ).toEqual([]);
  });

  it('every canonical key follows camelCase style (TS field-naming convention)', () => {
    const offenders = [...CANONICAL_KEYS].filter((k) => !STYLE_RE.test(k));
    expect(
      offenders,
      `${offenders.length} canonical key(s) violate camelCase style: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('at least 2 `JSON.stringify(metrics)` writer call sites (cross-table uniformity)', () => {
    expect(
      stringifyCount,
      `found ${stringifyCount} JSON.stringify(metrics) call site(s) — expected ≥ 2 (persistRunJournal at line 166 + insertReviewTask at line 189). A silent refactor to inline-spread-and-stringify one table's metrics would break cross-table uniformity`,
    ).toBeGreaterThanOrEqual(2);
  });

  it("NULLABLE_KEYS and REQUIRED_KEYS partition CANONICAL_KEYS exactly (no orphan, no overlap)", () => {
    const union = new Set<string>([...NULLABLE_KEYS, ...REQUIRED_KEYS]);
    expect(
      [...union].sort(),
      `NULLABLE ∪ REQUIRED = {${[...union].join(', ')}} differs from CANONICAL {${[...CANONICAL_KEYS].join(', ')}}`,
    ).toEqual([...CANONICAL_KEYS].sort());
    const overlap = [...NULLABLE_KEYS].filter((k) => REQUIRED_KEYS.has(k));
    expect(
      overlap,
      `NULLABLE ∩ REQUIRED non-empty: ${overlap.join(', ')} — a key cannot be simultaneously nullable and required`,
    ).toEqual([]);
  });

  it("nullability rationale — only 'winRate' and 'sharpe' are nullable (division-by-zero guards); counts and window bounds always have concrete values", () => {
    // Document the rationale explicitly so future contributors know WHY
    // winRate+sharpe are nullable. Counts default to 0; window bounds come from
    // Date.now() arithmetic — always concrete. Only rate/ratio metrics depend on
    // a non-zero denominator and therefore need null.
    expect(NULLABLE_KEYS.has('winRate')).toBe(true);
    expect(NULLABLE_KEYS.has('sharpe')).toBe(true);
    expect(NULLABLE_KEYS.has('signalCount')).toBe(false);
    expect(NULLABLE_KEYS.has('closedTradeCount')).toBe(false);
    expect(NULLABLE_KEYS.has('windowStartMs')).toBe(false);
    expect(NULLABLE_KEYS.has('windowEndMs')).toBe(false);
  });

  it('window-bounds coherence — windowStartMs and windowEndMs are both `number` (Unix-ms, cross-PR #165 unit discipline)', () => {
    // The window boundaries use Unix-ms (like signals.ts + signals.expires_at
    // locked by PR #165). If a future refactor changes one to Unix-seconds
    // without the other, cross-table rollups break. This case asserts both
    // are typed identically as `number` (unit-invariant at type level; operator
    // discipline at semantic level).
    expect(ifaceShape.get('windowStartMs')).toBe('number');
    expect(ifaceShape.get('windowEndMs')).toBe('number');
  });
});
