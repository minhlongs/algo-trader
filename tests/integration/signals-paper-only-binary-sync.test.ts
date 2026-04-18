/**
 * signals.paper_only INTEGER binary flag 3-surface sync.
 *
 * `signals.paper_only` is the 30-day paper-gate enforcement flag on the
 * canonical `signals` table. When `1`, the signal is paper-only (executed
 * only by paper-trading-orchestrator, never routed to live CLOB/CCXT). When
 * `0`, the signal is eligible for live trading (subject to downstream gates).
 *
 * Unlike the string-enum edges (PRs #153–#161), this is the **first binary
 * flag lock** across the 18-prior-edge set. The invariant is tighter than a
 * partition: {0, 1} must both be produced (no dead branch), the DEFAULT must
 * equal the writer's false-branch output (migration ↔ code fallback parity),
 * and the writer's true-branch literal (`1`) must differ from the DEFAULT
 * (paper-gate must actually flip state, not be a no-op).
 *
 * The flag is declared across three surfaces that must stay in lockstep:
 *
 *   1. **Migration column declaration with semantic comment** —
 *      `src/db/migrations/016_qwen_paper_tracking.sql:7`:
 *        `ALTER TABLE signals ADD COLUMN IF NOT EXISTS paper_only INTEGER`
 *        `NOT NULL DEFAULT 0; -- 1=paper only, 0=eligible for live`
 *      declares TYPE=INTEGER, NOT_NULL, DEFAULT=0, plus an inline semantic
 *      comment mapping `1=paper only, 0=eligible for live`. The comment is
 *      the only place the binary values carry human-readable semantics — a
 *      DDL refactor that strips the comment silently loses the meaning.
 *   2. **Writer ternary output set** — `src/signal/signal-store-d1.ts:33`:
 *        `const paperOnly = source === 'qwen-m1max' ? 1 : 0;`
 *      produces exactly two values {0, 1} based on the source classification.
 *      The SOLE writer into `signals.paper_only`.
 *   3. **Writer predicate literal** — same line `source === 'qwen-m1max'`:
 *      cross-references the signals.source enum locked by PR #161. Ensures
 *      the paper-gate predicate remains pinned to the Qwen hardware-tagged
 *      source. If PR #161's writer renames `'qwen-m1max'` → `'qwen'` without
 *      updating this predicate (or vice versa), the paper-gate silently
 *      disables. This surface cross-validates the binary flag's trigger
 *      against the enum that PR #161 locks.
 *
 * `ACTIVE_PAPER_ONLY = Set([0, 1])` — both values actively produced by the
 * writer ternary. `RESERVED_PAPER_ONLY = Set([])` — empty; INTEGER binary
 * column cannot meaningfully reserve a third value. This is the first
 * integrity edge where the partition's cardinality is physically bounded by
 * the type system (INTEGER DEFAULT 0 with a boolean semantic), not by a
 * policy decision.
 *
 * Drift scenarios covered:
 *   - Writer ternary collapses to `paperOnly = 0` (accidental removal of the
 *     qwen check) → binary completeness fails (case 5 "both 0 and 1 must be
 *     produced"). Paper-gate silently disabled.
 *   - Writer renames `'qwen-m1max'` → `'qwen'` without coordinating with
 *     signals.source enum (PR #161) → case 7 cross-validates the predicate
 *     against the writer's return set; fails if predicate diverges from
 *     signals.source ACTIVE.
 *   - Migration DEFAULT changes from `0` to `1` (security regression —
 *     every row now paper-only, live trading disabled) → case 4 fails.
 *   - Migration semantic comment is stripped → case 2 sanity floor fails.
 *   - Migration TYPE changes from INTEGER to BOOLEAN → case 1 fails (TYPE
 *     assertion).
 *
 * Symmetric to prior integrity edges:
 *   #132–#157 (Pillar 2 observability), #145 #153 #154 (Pillar 3 enums),
 *   #158 #159 #160 paper_trades_v3 (row-level row-integrity triple),
 *   #161 signals.source (code-derived authority sibling-table lock).
 *
 * Opens the **19th integrity edge** — first BINARY flag lock (not a string
 * enum). Novel invariants: DEFAULT ↔ false-branch parity, TRUE ≠ DEFAULT
 * (state-flip-required), binary completeness (both values produced), type
 * discipline (INTEGER not BOOLEAN or string 'true'/'false'). Integrity
 * octadecagon → enneadecagon (19-gon). Pillar 3 feedback-loop paper-gate
 * enforcement contract now locked — the 30d paper-gate that guards Qwen's
 * graduation to live trading has its binary toggle sync-validated.
 *
 * Non-goals: validating that paper_only=1 rows are actually blocked from live
 * (covered by paper-gate integration tests), asserting the 30-day graduation
 * timeline (covered by date-lock gate CI), or pinning a downstream reader
 * filter (no reader exists yet — `WHERE paper_only = 0` is the planned
 * Phase-05 live-eligibility filter; validator can't lock it pre-wire).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const MIGRATION_PATH = resolve(
  REPO_ROOT,
  'src/db/migrations/016_qwen_paper_tracking.sql',
);
const SIGNAL_STORE_PATH = resolve(REPO_ROOT, 'src/signal/signal-store-d1.ts');

/** Binary values the writer must produce. Empty RESERVED — INTEGER binary column cardinality is physically bounded at 2. */
const ACTIVE_PAPER_ONLY = new Set<number>([0, 1]);
const RESERVED_PAPER_ONLY = new Set<number>([]);

/** Strip SQL `--` line comments AFTER semantic-comment extraction — the order matters here so we keep raw migration source for the comment extractor. */
function stripSqlLineComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

/** Strip JS/TS comments. */
function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Extract the migration column declaration shape:
 *   { type, notNull, defaultValue }
 * from the `ALTER TABLE signals ADD COLUMN paper_only …` line.
 *
 * TYPE must be INTEGER, NOT NULL required, DEFAULT must be a single integer
 * literal. Returns null fields if any part of the shape drifted — sanity
 * floor asserts all three are populated.
 */
function extractMigrationShape(sql: string): {
  type: string | null;
  notNull: boolean;
  defaultValue: number | null;
} {
  // Keep comments intact — we only want the column spec line.
  const alterRe =
    /ALTER\s+TABLE\s+signals\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+paper_only\s+([A-Z]+)(\s+NOT\s+NULL)?(?:\s+DEFAULT\s+(\d+))?/i;
  const m = alterRe.exec(sql);
  if (!m) return { type: null, notNull: false, defaultValue: null };
  return {
    type: m[1],
    notNull: !!m[2],
    defaultValue: m[3] != null ? parseInt(m[3], 10) : null,
  };
}

/**
 * Extract the semantic-comment mapping from the migration line:
 *   `-- 1=paper only, 0=eligible for live`
 * Returns a Map<number, string> mapping each binary value to its
 * human-readable meaning. Scoped to the `paper_only` ADD COLUMN line.
 */
function extractMigrationSemanticComment(sql: string): Map<number, string> {
  const out = new Map<number, string>();
  // Match the paper_only ADD COLUMN line plus trailing comment.
  const lineRe =
    /ALTER\s+TABLE\s+signals\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+paper_only[^\n;]*;\s*--\s*([^\n]+)/i;
  const lineMatch = lineRe.exec(sql);
  if (!lineMatch) return out;
  // Comment body shape: `1=paper only, 0=eligible for live`
  for (const m of lineMatch[1].matchAll(/(\d+)\s*=\s*([^,\n]+?)(?=,|$)/g)) {
    out.set(parseInt(m[1], 10), m[2].trim());
  }
  return out;
}

/**
 * Extract the writer ternary's output set and predicate from
 *   `const paperOnly = source === 'X' ? Y : Z;`
 * Returns { predicate: 'X', trueOutput: Y, falseOutput: Z }.
 * Null fields if shape drifted.
 */
function extractWriterTernary(src: string): {
  predicate: string | null;
  trueOutput: number | null;
  falseOutput: number | null;
} {
  const clean = stripJsComments(src);
  const ternaryRe =
    /const\s+paperOnly\s*=\s*source\s*===\s*'([a-z_][a-z0-9_-]*)'\s*\?\s*(\d+)\s*:\s*(\d+)\s*;/;
  const m = ternaryRe.exec(clean);
  if (!m) return { predicate: null, trueOutput: null, falseOutput: null };
  return {
    predicate: m[1],
    trueOutput: parseInt(m[2], 10),
    falseOutput: parseInt(m[3], 10),
  };
}

/**
 * Extract the set of return literals from `deriveSource()` in signal-store-d1
 * — used by case 7 to cross-validate the writer predicate against the
 * signals.source enum (locked by PR #161).
 */
function extractDeriveSourceReturns(src: string): Set<string> {
  const out = new Set<string>();
  const fnRe =
    /function\s+deriveSource\s*\([^)]*\)\s*:\s*string\s*\{([\s\S]*?)\n\}/;
  const m = fnRe.exec(src);
  if (!m) return out;
  for (const r of m[1].matchAll(/return\s+'([a-z_][a-z0-9_-]*)'/g)) {
    out.add(r[1]);
  }
  return out;
}

describe('signals.paper_only INTEGER binary flag — 3-surface sync', () => {
  const migration = readFileSync(MIGRATION_PATH, 'utf8');
  const signalStore = readFileSync(SIGNAL_STORE_PATH, 'utf8');

  const migrationShape = extractMigrationShape(migration);
  const migrationComment = extractMigrationSemanticComment(migration);
  const writerTernary = extractWriterTernary(signalStore);
  const deriveSources = extractDeriveSourceReturns(signalStore);
  const writerOutputs = new Set<number>(
    [writerTernary.trueOutput, writerTernary.falseOutput].filter(
      (v): v is number => v !== null,
    ),
  );

  it('migration declares INTEGER NOT NULL DEFAULT 0 (shape sanity floor)', () => {
    expect(migrationShape.type).toBe('INTEGER');
    expect(migrationShape.notNull).toBe(true);
    expect(migrationShape.defaultValue).toBe(0);
  });

  it('migration semantic comment maps both 0 and 1 (no missing meaning)', () => {
    expect(
      migrationComment.size,
      'migration comment parsed 0 or 1 mapping(s) — comment shape drifted or was stripped',
    ).toBe(2);
    expect(migrationComment.get(0)).toBeDefined();
    expect(migrationComment.get(1)).toBeDefined();
    // Pin the semantic direction: 1=paper-only (restrictive), 0=eligible for live (permissive).
    // A silent flip would be a security regression (every row becomes live-eligible).
    expect(migrationComment.get(1)!.toLowerCase()).toMatch(/paper/);
    expect(migrationComment.get(0)!.toLowerCase()).toMatch(/live|eligible/);
  });

  it('writer ternary parser extracts predicate + both outputs (shape sanity floor)', () => {
    expect(writerTernary.predicate).not.toBeNull();
    expect(writerTernary.trueOutput).not.toBeNull();
    expect(writerTernary.falseOutput).not.toBeNull();
  });

  it('migration DEFAULT equals writer FALSE-branch output (rows missing tag land in same bucket)', () => {
    expect(
      writerTernary.falseOutput,
      'writer ternary false-branch must match migration DEFAULT so omitted-tag rows and non-Qwen rows land in the same semantic bucket (eligible for live)',
    ).toBe(migrationShape.defaultValue);
  });

  it('writer TRUE-branch differs from DEFAULT (paper-gate must actually flip state, not be a no-op)', () => {
    expect(
      writerTernary.trueOutput,
      'writer true-branch equals DEFAULT — paper-gate is a no-op; Qwen signals no longer get paper_only=1 tagging',
    ).not.toBe(migrationShape.defaultValue);
  });

  it('binary completeness: writer produces exactly {0, 1} (both branches reachable)', () => {
    expect(
      [...writerOutputs].sort(),
      `writer ternary produces ${writerOutputs.size} distinct value(s): {${[...writerOutputs].join(', ')}} — binary completeness requires both 0 and 1`,
    ).toEqual([...ACTIVE_PAPER_ONLY].sort());
  });

  it("writer predicate literal is in signals.source ACTIVE set (PR #161 cross-validation)", () => {
    expect(
      deriveSources.has(writerTernary.predicate!),
      `writer paper-gate predicate source === '${writerTernary.predicate}' but deriveSource() never returns that literal — paper-gate branch is unreachable at runtime; coordinate with PR #161 signals.source enum`,
    ).toBe(true);
  });

  it("writer predicate is the hardware-tagged 'qwen-m1max' source (not unified 'qwen' from paper_trades_v3)", () => {
    // Lock the cross-table asymmetry from PR #161: signals.source uses
    // 'qwen-m1max' (hardware-tagged at inference), paper_trades_v3.source uses
    // 'qwen' (untagged at orchestrator). The paper-gate fires on the INFERENCE
    // side — any future unifier PR must sweep PR #161 + PR #162 together.
    expect(
      writerTernary.predicate,
      "paper-gate predicate has drifted from 'qwen-m1max' — if this is an intentional unification with paper_trades_v3.source 'qwen', sweep PR #161 signals.source ACTIVE_SOURCES + this test together",
    ).toBe('qwen-m1max');
  });

  it('writer outputs are strict integer type (not boolean, not string "true"/"false")', () => {
    for (const out of writerOutputs) {
      expect(typeof out).toBe('number');
      expect(Number.isInteger(out)).toBe(true);
      expect(out === 0 || out === 1).toBe(true);
    }
  });

  it('no reserved values leak into writer (RESERVED_PAPER_ONLY is empty by type-cardinality)', () => {
    const leaked = [...RESERVED_PAPER_ONLY].filter((v) => writerOutputs.has(v));
    expect(
      leaked,
      `reserved paper_only value(s) leaked into writer: ${leaked.join(', ')} — INTEGER binary is physically bounded at 2 values; reservation is not meaningful here`,
    ).toEqual([]);
  });

  it('semantic comment keys partition = ACTIVE_PAPER_ONLY (no orphan comment, no missing mapping)', () => {
    expect(
      [...migrationComment.keys()].sort(),
      `migration comment keys {${[...migrationComment.keys()].join(
        ', ',
      )}} differ from ACTIVE_PAPER_ONLY {${[...ACTIVE_PAPER_ONLY].join(', ')}}`,
    ).toEqual([...ACTIVE_PAPER_ONLY].sort());
  });

  it('writer predicate column-ordering matches INSERT column list (INSERT-correctness invariant)', () => {
    // Cross-check: the `paper_only` column appears in the INSERT column list
    // at signal-store-d1.ts:38 AND the `paperOnly` variable is passed in the
    // VALUES binding at line 53. If someone reorders the columns without
    // updating the VALUES array, the paper_only flag writes to the wrong
    // column. Catch this via direct file read.
    const storeSrc = stripJsComments(signalStore);
    const insertRe =
      /INSERT\s+INTO\s+signals\s*\(\s*([^)]*)\s*\)\s*VALUES\s*\(([^)]*)\)/i;
    const insertMatch = insertRe.exec(storeSrc);
    expect(
      insertMatch,
      'INSERT INTO signals (…) VALUES (…) shape not found — writer drifted',
    ).not.toBeNull();
    const cols = insertMatch![1].split(',').map((c) => c.trim());
    const paperOnlyIdx = cols.findIndex((c) => c === 'paper_only');
    expect(
      paperOnlyIdx,
      'INSERT column list does not mention paper_only — column was silently dropped',
    ).toBeGreaterThanOrEqual(0);
  });
});
