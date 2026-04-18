/**
 * signals.source enum 4-surface sync — code-derived authority (no CHECK, no comment).
 *
 * `signals` is the canonical signal ledger (Phase 03 → Phase 04 source-tagged)
 * that persists upstream signals before they fan out to paper/live execution.
 * Its `source` column tags each row with which upstream strategy produced the
 * signal. Rows are keyed on `(id)` and include `paper_only` (0/1) — when
 * `source === 'qwen-m1max'`, the paper_only flag is auto-set to 1 to enforce
 * the 30d paper-gate (PR #159-era convention).
 *
 * Unlike `paper_trades_v3.source` (PR #160, migration comment-as-declaration
 * authority with 5 declared values), `signals.source` has NEITHER a CHECK
 * constraint NOR a comment enum — migration 016:6 declares only
 * `ALTER TABLE signals ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'legacy'`.
 * The authoritative source set is therefore **code-derived** from the single
 * writer: `src/signal/signal-store-d1.ts` `deriveSource()` returning one of
 * four literals. The test locks those four values as ACTIVE and asserts that
 * all downstream literal references (migration DEFAULT, admin-route filter
 * default, internal branching comparison) are SUBSETS of the writer's return
 * set.
 *
 * **Novel asymmetry with PR #160.** `signals.source` emits `'qwen-m1max'`
 * (hardware-tagged Qwen M1 Max inference) while `paper_trades_v3.source`
 * emits `'qwen'` (un-tagged). This divergence is INTENTIONAL — signals are
 * produced at the Qwen inference layer (M1 Max box), paper-trades are
 * recorded at the orchestrator layer (cloud) after the signal has crossed
 * network boundary. The test documents the asymmetry explicitly via the
 * STYLE_RE allowing hyphen and the `ACTIVE_SOURCES` inline comment so a
 * future unifier PR knows where to sweep both surfaces.
 *
 * The enum is declared across four surfaces that must stay in lockstep:
 *
 *   1. **Migration DEFAULT literal** — `src/db/migrations/016_qwen_paper_tracking.sql:6`:
 *        `ALTER TABLE signals ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'legacy'`
 *      — single-value fallback for rows inserted without an explicit source
 *      tag (legacy pre-Phase-04 writers).
 *   2. **Writer function returns** — `src/signal/signal-store-d1.ts:14-19`:
 *        function deriveSource(strategy: string): string {
 *          if (strategy.startsWith('qwen'))      return 'qwen-m1max';
 *          if (strategy.startsWith('deepseek'))  return 'deepseek';
 *          if (strategy.startsWith('swarm'))     return 'swarm';
 *          return 'legacy';
 *        }
 *      This is the SOLE writer into `signals.source`; returns 4 literals
 *      that define the ACTIVE enum.
 *   3. **Paper-only branching literal** — `src/signal/signal-store-d1.ts:33`:
 *        `const paperOnly = source === 'qwen-m1max' ? 1 : 0;`
 *      — runtime branch that enforces the 30d paper-gate for Qwen-sourced
 *      signals. The `'qwen-m1max'` literal must be reachable (i.e. in the
 *      writer's return set), otherwise the branch is dead and the paper-gate
 *      never fires.
 *   4. **Admin-route filter default** — `src/api/routes/admin-qwen-routes.ts:110`:
 *        `const source = (req.query.source as string) || 'qwen-m1max';`
 *      — default source filter when operator hits `/strategy-reviews`
 *      without `?source=`. Must be a wired value, otherwise the operator
 *      sees an empty list.
 *
 * `ACTIVE_SOURCES = {'qwen-m1max','deepseek','swarm','legacy'}` — everything
 * `deriveSource()` can return today. `RESERVED_SOURCES = new Set([])` —
 * empty; no values are declared-but-not-wired in this surface set (contrast
 * PR #160 where the migration comment declared `'manual'` beyond the writer).
 * If/when a new source lands (e.g. `'local-llama3'`), extend `deriveSource`
 * + `ACTIVE_SOURCES` together; if the operator-CLI pre-declares a slot
 * before wiring, add it to `RESERVED_SOURCES` (requires a comment/doc surface
 * to discover the reservation — not present today, so the slot is closed).
 *
 * Drift scenarios covered:
 *   - `deriveSource()` renames `'qwen-m1max'` → `'qwen'` to unify with
 *     `paper_trades_v3.source` → `paperOnly` branch becomes dead (case 7
 *     fails: `'qwen-m1max'` literal at line 33 is no longer reachable) AND
 *     admin-route default becomes a phantom filter (case 8 fails).
 *   - Migration DEFAULT changes from `'legacy'` to e.g. `'unknown'` without
 *     extending the writer → case 6 fails (DEFAULT ⊆ ACTIVE).
 *   - Admin-route default changes without coordinating with writer → case 8
 *     fails.
 *   - Writer adds a 5th return `'local-llama3'` without extending
 *     `ACTIVE_SOURCES` → case 1 sanity floor still ≥ 4 (still passes) but
 *     case 9's canonical ACTIVE match fails loudly, surfacing the missing
 *     partition update.
 *
 * Symmetric to prior integrity edges:
 *   #132–#157 (Pillar 2 observability family), #154 strategy_review.status,
 *   #155 kill-action, #156 kill-switch source, #158 paper_trades_v3.status,
 *   #159 paper_trades_v3.side (4→2 reserved), #160 paper_trades_v3.source
 *   (comment-as-declaration).
 *
 * Opens the **18th integrity edge** — sibling-table version of PR #160 but
 * with a stronger asymmetry: NO migration-level authority at all, enum is
 * purely code-derived from the writer. First integrity edge where the enum
 * is defined by a function's return-literal set rather than a schema-level
 * declaration. Integrity heptadecagon → octadecagon (18-gon). Pillar 3
 * feedback-loop signal-producer contract locked alongside the downstream
 * paper-trade consumer contract (#158/#159/#160).
 *
 * Non-goals: unifying `'qwen-m1max'` ↔ `'qwen'` across tables (intentional
 * asymmetry per docstring above), locking `paper_only` INTEGER binary (not
 * enough surfaces to lock — covered by existing gate tests), asserting
 * admin-route query-param validation shape (covered by route tests).
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
const ADMIN_ROUTE_PATH = resolve(
  REPO_ROOT,
  'src/api/routes/admin-qwen-routes.ts',
);

/** Source values declared somewhere but not yet emitted by the writer. Empty — no comment/doc surface declares anything beyond what deriveSource returns today. */
const RESERVED_SOURCES = new Set<string>([]);

/** Source values actively returned by the sole writer (signal-store-d1 deriveSource). Note: 'qwen-m1max' (hardware-tagged) intentionally differs from paper_trades_v3.source 'qwen' — see docstring. */
const ACTIVE_SOURCES = new Set<string>([
  'qwen-m1max',
  'deepseek',
  'swarm',
  'legacy',
]);

/**
 * Style: lowercase, allows digits + underscores + **hyphens** (to permit the
 * hardware-tagged `'qwen-m1max'` variant). Distinct from prior snake-case-only
 * enums — this relaxation is intentional and documented.
 */
const STYLE_RE = /^[a-z][a-z0-9_-]*$/;

/** Strip SQL `--` line comments + `/* ... *\/` blocks. */
function stripSqlComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

/** Strip JS/TS `//` line comments + `/* ... *\/` blocks. */
function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Extract the DEFAULT literal from the migration's `ALTER TABLE signals ADD
 * COLUMN ... source ... DEFAULT '...'` statement. Scoped to the `signals`
 * table + `source` column (NOT `paper_trades_v3` which also has source in the
 * same file).
 */
function extractMigrationDefault(sql: string): string | null {
  const alterRe =
    /ALTER\s+TABLE\s+signals[^;]*?\bADD\s+COLUMN[^;]*?\bsource\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'([a-z_][a-z0-9_-]*)'/i;
  const m = alterRe.exec(sql);
  return m ? m[1] : null;
}

/**
 * Extract the set of return-value string literals from the `deriveSource`
 * function in `signal-store-d1.ts`. Anchored to the function body so unrelated
 * returns elsewhere in the file (e.g. `saveSignal` returning void) don't leak.
 */
function extractWriterReturns(src: string): Set<string> {
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

/**
 * Extract the `source === 'X'` literal from signal-store-d1's paperOnly
 * branch. This is the runtime reachability check — if the literal isn't in
 * the writer's return set, the branch is dead and the paper-gate never fires.
 * Scoped to a `=== '…'` comparison on a `source` identifier in the file, not
 * on arbitrary string comparisons.
 */
function extractBranchLiteral(src: string): Set<string> {
  const out = new Set<string>();
  const clean = stripJsComments(src);
  for (const m of clean.matchAll(
    /\bsource\s*===\s*'([a-z_][a-z0-9_-]*)'/g,
  )) {
    out.add(m[1]);
  }
  return out;
}

/**
 * Extract the admin-route filter default from `admin-qwen-routes.ts`:
 *   `const source = (req.query.source as string) || 'X'`
 * Scoped narrowly to this exact pattern so unrelated `|| 'fallback'`
 * expressions elsewhere in the file don't leak.
 */
function extractAdminRouteDefault(src: string): Set<string> {
  const out = new Set<string>();
  const clean = stripJsComments(src);
  for (const m of clean.matchAll(
    /req\.query\.source\s+as\s+string\)\s*\|\|\s*'([a-z_][a-z0-9_-]*)'/g,
  )) {
    out.add(m[1]);
  }
  return out;
}

describe('signals.source enum — 4-surface sync (code-derived authority)', () => {
  const migration = readFileSync(MIGRATION_PATH, 'utf8');
  const signalStore = readFileSync(SIGNAL_STORE_PATH, 'utf8');
  const adminRoute = readFileSync(ADMIN_ROUTE_PATH, 'utf8');

  const migrationDefault = extractMigrationDefault(stripSqlComments(migration));
  const writerReturns = extractWriterReturns(signalStore);
  const branchLiterals = extractBranchLiteral(signalStore);
  const adminRouteDefaults = extractAdminRouteDefault(adminRoute);
  const allCodeLiterals = new Set<string>([
    ...writerReturns,
    ...branchLiterals,
    ...adminRouteDefaults,
    ...(migrationDefault ? [migrationDefault] : []),
  ]);

  it('migration extractor finds signals.source DEFAULT literal (sanity floor)', () => {
    expect(
      migrationDefault,
      'migration 016 ALTER TABLE signals … source DEFAULT … did not parse a literal — shape drifted',
    ).not.toBeNull();
  });

  it('writer extractor finds at least 4 deriveSource return literals (sanity floor)', () => {
    expect(
      writerReturns.size,
      'signal-store-d1.ts deriveSource() parsed < 4 returns — writer shape drifted',
    ).toBeGreaterThanOrEqual(4);
  });

  it('paper-gate branch extractor finds at least 1 source comparison literal (sanity floor)', () => {
    expect(
      branchLiterals.size,
      'signal-store-d1.ts source === \'…\' paper-gate branch drifted — paperOnly enforcement shape lost',
    ).toBeGreaterThanOrEqual(1);
  });

  it('admin-route extractor finds at least 1 query-param source default (sanity floor)', () => {
    expect(
      adminRouteDefaults.size,
      'admin-qwen-routes.ts strategy-reviews source fallback parsed 0 literals — route default shape drifted',
    ).toBeGreaterThanOrEqual(1);
  });

  it('all collected sources follow lowercase + optional hyphen/underscore style', () => {
    const offenders = [...allCodeLiterals].filter((s) => !STYLE_RE.test(s));
    expect(
      offenders,
      `${offenders.length} source value(s) violate lowercase + hyphen/underscore style: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('migration DEFAULT is in writer ACTIVE_SOURCES (rows missing source tag must land on wired bucket)', () => {
    expect(
      migrationDefault,
      'default source must exist before it can be validated',
    ).not.toBeNull();
    expect(
      ACTIVE_SOURCES.has(migrationDefault!),
      `migration DEFAULT '${migrationDefault}' not in ACTIVE_SOURCES — default-inserted rows would be tagged with a phantom source`,
    ).toBe(true);
    expect(
      writerReturns.has(migrationDefault!),
      `migration DEFAULT '${migrationDefault}' not returned by deriveSource — writer can't reproduce the fallback, rows land in unmanaged state`,
    ).toBe(true);
  });

  it('paper-gate branch literal is in writer ACTIVE_SOURCES (reachability invariant — dead branch protection)', () => {
    for (const lit of branchLiterals) {
      expect(
        ACTIVE_SOURCES.has(lit),
        `paper-gate branch checks source === '${lit}' but ACTIVE_SOURCES does not include it — the branch is dead + the 30d paper-gate never fires`,
      ).toBe(true);
      expect(
        writerReturns.has(lit),
        `paper-gate branch checks source === '${lit}' but deriveSource() never returns it — branch unreachable at runtime`,
      ).toBe(true);
    }
  });

  it('admin-route filter default is in writer ACTIVE_SOURCES (operator-list coverage invariant)', () => {
    for (const lit of adminRouteDefaults) {
      expect(
        ACTIVE_SOURCES.has(lit),
        `admin-route /strategy-reviews defaults ?source to '${lit}' but ACTIVE_SOURCES does not include it — operator sees an empty filter view`,
      ).toBe(true);
      expect(
        writerReturns.has(lit),
        `admin-route defaults to '${lit}' but deriveSource never emits it — no matching rows exist`,
      ).toBe(true);
    }
  });

  it("writer returns match canonical ACTIVE_SOURCES = {'qwen-m1max','deepseek','swarm','legacy'}", () => {
    const only_in_writer = [...writerReturns].filter(
      (s) => !ACTIVE_SOURCES.has(s),
    );
    const only_in_canonical = [...ACTIVE_SOURCES].filter(
      (s) => !writerReturns.has(s),
    );
    expect(
      only_in_writer,
      `deriveSource emits undocumented source(s): ${only_in_writer.join(
        ', ',
      )} — extend ACTIVE_SOURCES to match, or retract the writer branch`,
    ).toEqual([]);
    expect(
      only_in_canonical,
      `ACTIVE_SOURCES declares source(s) never emitted by deriveSource: ${only_in_canonical.join(
        ', ',
      )} — either wire the writer branch or move to RESERVED_SOURCES (and add a comment-surface)`,
    ).toEqual([]);
  });

  it('no code literal leaks a RESERVED_SOURCES value (reservation-semantics — today empty)', () => {
    const leaked = [...RESERVED_SOURCES].filter((s) => allCodeLiterals.has(s));
    expect(
      leaked,
      `reserved source(s) leaked into code: ${leaked.join(', ')} — graduate to ACTIVE_SOURCES or remove from code`,
    ).toEqual([]);
  });

  it('ACTIVE_SOURCES ∩ RESERVED_SOURCES is empty (a source cannot be simultaneously wired and reserved)', () => {
    const overlap = [...ACTIVE_SOURCES].filter((s) => RESERVED_SOURCES.has(s));
    expect(
      overlap,
      `ACTIVE_SOURCES ∩ RESERVED_SOURCES non-empty: ${overlap.join(', ')}`,
    ).toEqual([]);
  });

  it("documents the 'qwen-m1max' vs 'qwen' cross-table asymmetry (explicit intent)", () => {
    // signals.source emits 'qwen-m1max' (hardware-tagged at inference layer).
    // paper_trades_v3.source emits 'qwen' (untagged at orchestrator layer).
    // This asymmetry is INTENTIONAL — see docstring. The test pins it so a
    // future unifier PR can't silently drop one side.
    expect(
      writerReturns.has('qwen-m1max'),
      "signal-store-d1 deriveSource must emit 'qwen-m1max' (hardware-tagged) — unifying with paper_trades_v3's 'qwen' requires a coordinated migration + cross-file sweep",
    ).toBe(true);
  });
});
