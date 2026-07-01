/**
 * qwen_signals_loop_runs.trigger_reasons TEXT[] element-subset-of-enum 4-surface sync.
 *
 * `qwen_signals_loop_runs.trigger_reasons` is a Postgres TEXT[] column (array of
 * primitive strings) that carries the REASON SET for each signals-loop evaluation
 * run. When a run triggers one or more thresholds, the writer pushes identifiers
 * like `'win_rate_below_threshold'` into the array before journalling. The empty
 * array `'{}'` is the default for runs that pass all checks or hit an error/
 * skipped-insufficient-data code path.
 *
 * The invariant: **every element of the array MUST be a member of the canonical
 * trigger-reason enum** declared in `docs/strategy-review-reasons.md` (the same
 * enum locked by PR #145 doc↔code bijection on the scalar `trigger_reason`
 * column of `strategy_review_tasks`). Drift = phantom reason in one table's
 * array that can't be cross-joined with the scalar enum → operator Grafana
 * dashboards showing a `trigger_reasons` histogram with undocumented values
 * that don't appear in the strategy-review-reasons doc or the scalar column.
 *
 * Unlike the 24 prior edges:
 *   - Prior families: 16× string-enum partition (scalar), 2× cross-module,
 *     1× binary flag (#162), 1× range-bound (#163), 1× temporal ordering
 *     (#164), 1× temporal derivation (#165), 1× JSONB structured-document
 *     shape (#166), 1× composite multi-column (#167).
 *   - **NEW family #9: ARRAY ELEMENT-SUBSET-OF-SIBLING-ENUM.** Locks an
 *     invariant across (a) an array-typed column's element values and (b)
 *     the canonical enum declared in a sibling surface (doc + scalar column).
 *     Cross-PR coupling — the array is pinned to the PR #145 enum without
 *     duplicating the enum declaration. Distinct from #166 (structured
 *     document object shape) because this is an ARRAY of primitives, not
 *     an OBJECT of typed keys.
 *
 * The invariant is declared across four surfaces that must stay in lockstep:
 *
 *   1. **Migration 018 column declaration** —
 *      `src/db/migrations/018_qwen_signals_loop_runs.sql:13`:
 *        `trigger_reasons TEXT[]      NOT NULL DEFAULT '{}',`
 *      — unconstrained at DB layer (no CHECK jsonb_array_elements_text or
 *      CHECK ALL element IN (...) subquery). Writer + cross-PR coupling
 *      carry authority.
 *   2. **Writer function signature** —
 *      `src/desk/wiring/qwen-signals-loop.ts:154-158`:
 *        export async function persistRunJournal(
 *          source: string,
 *          metrics: QualityMetrics,
 *          decision: 'skipped_insufficient_data' | 'ok' | 'queued_review' | 'error',
 *          triggerReasons: string[],
 *          errorMessage?: string
 *        ): Promise<void>
 *      — accepts `string[]` without runtime validation; caller-contract authority.
 *   3. **Call-site push literals** —
 *      `qwen-signals-loop.ts:274` `triggerReasons.push('win_rate_below_threshold')`
 *      `qwen-signals-loop.ts:279` `triggerReasons.push('sharpe_below_threshold')`
 *      — exactly 2 literal values emitted today (matches ACTIVE enum from #145).
 *   4. **Canonical enum** —
 *      `docs/strategy-review-reasons.md` Active reasons table. Same enum
 *      locked by PR #145 (doc↔code bijection on scalar `trigger_reason`
 *      column). Source of truth for the subset constraint.
 *
 * Plus: **empty-array literals at error/skipped code paths** —
 *   `qwen-signals-loop.ts:248` `persistRunJournal(…, 'error', [], String(err))`
 *   `qwen-signals-loop.ts:266` `persistRunJournal(…, 'skipped_insufficient_data', [])`
 * — the EMPTY ARRAY is the right default for "no reason triggered"; using
 * `null` or omitting the argument would break the NOT NULL DEFAULT '{}' contract.
 *
 * Novel invariants locked:
 *   - **Element-subset-of-enum** — every push literal ∈ canonical enum.
 *     Drift = `triggerReasons.push('some_new_reason')` without extending
 *     the doc enum or PR #145.
 *   - **Writer signature discipline** — parameter typed `string[]`, not
 *     `Array<string>` or `ReadonlyArray<string>`. Consistency with TS codebase.
 *   - **Empty-array discipline** — error + skipped paths pass `[]`, not null.
 *     Preserves NOT NULL constraint + uniform array-shape for readers.
 *   - **Cross-PR coupling** — array elements MUST match scalar enum from PR #145.
 *     A new reason added to either surface alone breaks symmetry.
 *   - **Column-type discipline** — `TEXT[]` (array of text), not JSONB, not
 *     TEXT CSV. Preserves Postgres array semantics for future `= ANY(...)`
 *     filter queries.
 *
 * Drift scenarios covered:
 *   - Writer call site adds `triggerReasons.push('latency_drift')` without
 *     extending docs → case 6 fails (element not in canonical enum).
 *   - Docs adds `'new_metric_drift'` to Active reasons without wiring a
 *     push site → case 7 fails (canonical enum has reasons never emitted).
 *   - Migration changes column type to `JSONB` → case 1 fails (not TEXT[]).
 *   - Writer signature drifts to `triggerReasons: ReadonlyArray<string>` →
 *     case 3 fails (parameter type mismatch).
 *   - Error/skipped path passes `null` instead of `[]` → case 8 fails
 *     (NOT NULL DEFAULT '{}' contract broken at writer layer).
 *
 * Symmetric to prior integrity edges:
 *   #145 strategy-review trigger_reason doc↔code enum (SCALAR column — this
 *   edge extends to ARRAY column), #153 decision enum, #154 status enum,
 *   #166 QualityMetrics JSONB structured-doc shape (OBJECT — this edge is
 *   ARRAY sibling).
 *
 * Opens the **25th integrity edge — PENTACOSAGON** (25-gon). First
 * array-element-subset-of-enum edge. Novel family #9. Integrity tetracosagon
 * → pentacosagon (25-gon). Pillar 3 feedback-loop evaluation audit trail
 * array-payload contract now cross-PR-coupled to the scalar trigger_reason
 * enum — journal array + review table scalar must share vocabulary.
 *
 * Non-goals: validating empirical array cardinalities in prod rows (data-
 * quality, not contract-sync), asserting ordering within the array (set
 * semantics — order doesn't matter), pinning Postgres ANY() query syntax
 * in readers (no reader uses element filtering today).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const MIGRATION_PATH = resolve(
  REPO_ROOT,
  'src/db/migrations/018_qwen_signals_loop_runs.sql',
);
const SIGNALS_LOOP_PATH = resolve(
  REPO_ROOT,
  'src/desk/wiring/qwen-signals-loop.ts',
);
const DOCS_PATH = resolve(
  REPO_ROOT,
  'docs/strategy-review-reasons.md',
);

/** Strip SQL comments. */
function stripSqlComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

/** Strip JS/TS comments. */
function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Extract the column shape for `trigger_reasons` from migration 018.
 * Expected: `TEXT[] NOT NULL DEFAULT '{}'`.
 */
function extractArrayColumnShape(sql: string): {
  type: string | null;
  notNull: boolean;
  defaultValue: string | null;
} {
  const re =
    /\btrigger_reasons\s+(TEXT\[\]|TEXT\s+ARRAY|JSONB)\s+(NOT\s+NULL)?\s+DEFAULT\s+'([^']*)'/i;
  const m = re.exec(sql);
  if (!m) return { type: null, notNull: false, defaultValue: null };
  return {
    type: m[1].replace(/\s+/g, '').toUpperCase(),
    notNull: !!m[2],
    defaultValue: m[3],
  };
}

/**
 * Extract the TS parameter type of `triggerReasons` in persistRunJournal.
 * Expected: `string[]`.
 */
function extractWriterParamType(src: string): string | null {
  const clean = stripJsComments(src);
  const re =
    /function\s+persistRunJournal\s*\([\s\S]*?\btriggerReasons\s*:\s*([A-Za-z<>\[\]\s]+?)\s*,/;
  const m = re.exec(clean);
  return m ? m[1].replace(/\s+/g, '') : null;
}

/**
 * Extract push literals from `triggerReasons.push('...')` call sites in
 * qwen-signals-loop.ts.
 */
function extractPushLiterals(src: string): Set<string> {
  const out = new Set<string>();
  const clean = stripJsComments(src);
  for (const m of clean.matchAll(
    /triggerReasons\.push\s*\(\s*'([a-z_][a-z0-9_-]*)'\s*\)/g,
  )) {
    out.add(m[1]);
  }
  return out;
}

/**
 * Count `persistRunJournal(..., [])` call sites with EMPTY array literal
 * in the 4th positional argument (triggerReasons).
 */
function countEmptyArrayLiteralCallSites(src: string): number {
  const clean = stripJsComments(src);
  const matches = clean.matchAll(
    /persistRunJournal\s*\([\s\S]*?,\s*'[^']+?'\s*,\s*\[\s*\]/g,
  );
  return [...matches].length;
}

/**
 * Extract active reasons from `docs/strategy-review-reasons.md` Active
 * reasons markdown table (reuse parser shape from PR #145 validator).
 */
function extractDocActiveReasons(md: string): Set<string> {
  const out = new Set<string>();
  const activeSection = md.split('## Active reasons')[1]?.split('## ')[0] ?? '';
  const rowRegex = /^\|\s*`([\w-]+)`\s*\|/gm;
  let m: RegExpExecArray | null;
  while ((m = rowRegex.exec(activeSection)) !== null) {
    out.add(m[1]);
  }
  return out;
}

describe('qwen_signals_loop_runs.trigger_reasons TEXT[] element-subset-of-enum — 4-surface sync', () => {
  const migration = readFileSync(MIGRATION_PATH, 'utf8');
  const signalsLoop = readFileSync(SIGNALS_LOOP_PATH, 'utf8');
  const docs = readFileSync(DOCS_PATH, 'utf8');

  const colShape = extractArrayColumnShape(stripSqlComments(migration));
  const paramType = extractWriterParamType(signalsLoop);
  const pushLiterals = extractPushLiterals(signalsLoop);
  const emptyArrayCount = countEmptyArrayLiteralCallSites(signalsLoop);
  const canonicalEnum = extractDocActiveReasons(docs);

  it('migration 018 declares trigger_reasons as TEXT[] NOT NULL DEFAULT \'{}\' (shape sanity)', () => {
    expect(
      colShape.type,
      'trigger_reasons type did not parse as TEXT[] — column shape drifted',
    ).toBe('TEXT[]');
    expect(
      colShape.notNull,
      'trigger_reasons must be NOT NULL so readers never hit null array',
    ).toBe(true);
    expect(
      colShape.defaultValue,
      "trigger_reasons DEFAULT must be empty array literal '{}' so error + skipped code paths preserve uniform array shape",
    ).toBe('{}');
  });

  it('persistRunJournal writer signature types triggerReasons as `string[]` (not Array<string> or ReadonlyArray<string>)', () => {
    expect(
      paramType,
      'persistRunJournal triggerReasons parameter type did not parse — signature shape drifted',
    ).toBe('string[]');
  });

  it('at least 2 `triggerReasons.push(...)` literal call sites (sanity floor — today: win_rate_below_threshold + sharpe_below_threshold)', () => {
    expect(
      pushLiterals.size,
      `found ${pushLiterals.size} triggerReasons.push literal(s) — expected ≥ 2 (win_rate + sharpe thresholds). A silent refactor to dynamic push would break element-subset-of-enum guarantee`,
    ).toBeGreaterThanOrEqual(2);
  });

  it('canonical enum parser finds at least 2 active reasons in docs/strategy-review-reasons.md (sanity floor)', () => {
    expect(
      canonicalEnum.size,
      'docs/strategy-review-reasons.md Active reasons table parsed 0 entries — doc shape drifted; coordinate with PR #145 validator',
    ).toBeGreaterThanOrEqual(2);
  });

  it('every push literal is a member of the canonical enum (cross-PR #145 element-subset-of-enum invariant)', () => {
    const phantom = [...pushLiterals].filter((r) => !canonicalEnum.has(r));
    expect(
      phantom,
      `push literals not in canonical enum: ${phantom.join(', ')} — add to docs/strategy-review-reasons.md or retract the push call; cross-PR #145 coupling broken`,
    ).toEqual([]);
  });

  it('every active doc reason has a corresponding push call site (enum ↔ code bijection, cross-PR #145 parity)', () => {
    // This bijection mirrors the PR #145 doc↔code sync for the SCALAR
    // trigger_reason column. Here we extend it to the ARRAY element set.
    // An orphan doc reason would mean the journal array never emits that
    // reason while the scalar column does — cross-surface vocabulary split.
    const orphan = [...canonicalEnum].filter((r) => !pushLiterals.has(r));
    expect(
      orphan,
      `canonical enum has reasons never pushed into trigger_reasons array: ${orphan.join(', ')} — SCALAR column (PR #145) may emit these via insertReviewTask, but the ARRAY column is out of sync`,
    ).toEqual([]);
  });

  it('at least 2 empty-array literal `persistRunJournal(..., [])` call sites (error + skipped_insufficient_data paths)', () => {
    expect(
      emptyArrayCount,
      `found ${emptyArrayCount} persistRunJournal(..., []) call site(s) — expected ≥ 2 (error path + skipped_insufficient_data path). An error/skipped code path passing null instead of [] would break NOT NULL DEFAULT '{}' contract`,
    ).toBeGreaterThanOrEqual(2);
  });

  it('push literals follow snake_case style (enum convention)', () => {
    const STYLE_RE = /^[a-z][a-z0-9_]*$/;
    const offenders = [...pushLiterals].filter((s) => !STYLE_RE.test(s));
    expect(
      offenders,
      `push literal(s) violate snake_case: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('array element-subset + canonical bijection together lock vocabulary (composite cross-PR #145 discipline)', () => {
    // Composite assertion: push literals MUST EQUAL canonical enum today.
    // Both the "push ⊆ canonical" (case 5) and "canonical ⊆ push" (case 6)
    // bijection sides must hold simultaneously. Either one-sided drift
    // breaks cross-PR vocabulary coherence.
    const push = [...pushLiterals].sort();
    const canon = [...canonicalEnum].sort();
    expect(
      push,
      `push literals {${push.join(', ')}} differ from canonical enum {${canon.join(', ')}} — vocabulary drift; sweep both surfaces together`,
    ).toEqual(canon);
  });

  it('migration DEFAULT empty-array literal matches writer empty-array discipline', () => {
    // Cross-check: if migration DEFAULT is '{}' AND writer passes [] in
    // error/skipped paths, the two shapes are semantically equivalent
    // (DB and TS empty-array both round-trip identically through
    // JSON.stringify + Postgres array encoding).
    expect(colShape.defaultValue).toBe('{}');
    expect(emptyArrayCount).toBeGreaterThanOrEqual(2);
  });

  it('no CHECK constraint on trigger_reasons array (writer+cross-PR coupling carries authority)', () => {
    // Postgres CAN enforce element-subset via CHECK with ALL(trigger_reasons = ANY(...))
    // or jsonb_array_elements_text on a JSONB column. We choose not to —
    // the canonical enum is declared in a DOC file + scalar column (PR #145),
    // and duplicating it at the DB array-column layer would create 3-way
    // maintenance burden. Writer + cross-PR sync are sufficient.
    const rawMig = stripSqlComments(migration);
    const hasCheck =
      /trigger_reasons[^,\n]*CHECK/i.test(rawMig) ||
      /CHECK\s*\([^)]*trigger_reasons/i.test(rawMig);
    expect(
      hasCheck,
      'trigger_reasons has a DB CHECK constraint — if this is intentional tightening, update test rationale; else retract the CHECK (writer+cross-PR authority suffices)',
    ).toBe(false);
  });
});
