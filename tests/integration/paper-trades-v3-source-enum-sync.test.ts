/**
 * paper_trades_v3.source enum 3-surface sync — comment-as-declaration authority.
 *
 * `paper_trades_v3` is the source-tagged paper-trade ledger that feeds Qwen
 * A/B P&L comparison (Pillar 3 feedback-loop data layer). Its `source` column
 * tags every row with which upstream strategy produced the trade — used by
 * drawdown-monitor / signals-loop / eligibility-gate to scope rollups to a
 * single source's performance history.
 *
 * Unlike `status` (PR #158, 2-value CHECK) and `side` (PR #159, 4-value CHECK
 * with 4→2 reserved-set asymmetry), **`source` has NO CHECK constraint** —
 * migration 016 declares the enum exclusively in an inline SQL comment
 * adjacent to the column DEFAULT. This is the **first comment-as-declaration
 * authority** across the 16-prior-edge set. The comment is fragile — a DDL
 * refactor that strips comments silently loses the enum contract — so the
 * test pins the comment shape + DEFAULT literal + writer-function return set
 * as a unit.
 *
 * The enum is declared across three surfaces that must stay in lockstep:
 *
 *   1. **Migration inline comment** — `src/db/migrations/016_qwen_paper_tracking.sql:20`:
 *        `source TEXT NOT NULL DEFAULT 'legacy', -- 'qwen' | 'deepseek' | 'swarm' | 'legacy' | 'manual'`
 *      declares 5 intended source values as a pipe-delimited comment enum.
 *      NO CHECK constraint — the column accepts any TEXT, discipline is
 *      enforced by the writer function below + this test.
 *   2. **Migration DEFAULT literal** — same line, `DEFAULT 'legacy'`. Rows
 *      inserted without an explicit `source` field fall back to `'legacy'`.
 *      The default must be one of the comment-declared values (otherwise a
 *      row with no source tag creates a phantom undocumented source).
 *   3. **Orchestrator `deriveSource()` function** —
 *      `src/wiring/paper-trading-orchestrator.ts:39-44`:
 *        function deriveSource(strategy: string): string {
 *          if (strategy.startsWith('qwen'))      return 'qwen';
 *          if (strategy.startsWith('deepseek'))  return 'deepseek';
 *          if (strategy.startsWith('swarm'))     return 'swarm';
 *          return 'legacy';
 *        }
 *      This is the SOLE paper_trades_v3 writer's source derivation — every
 *      `savePaperTradeV3(trade)` call tags the row with the return of this
 *      function (via `trade.source = deriveSource(candidate.signalType ?? '')`
 *      at line 114). Returns 4 of the 5 declared values.
 *
 * `ACTIVE_SOURCES = {'qwen','deepseek','swarm','legacy'}` — currently emitted
 * by `deriveSource()`. `RESERVED_SOURCES = {'manual'}` — declared in the
 * migration comment but never returned by any code path. Reserved for future
 * manual operator paper-trade entry (e.g. a CLI that lets the operator
 * back-fill a trade with `source='manual'` tag to A/B-segment it out of the
 * automated strategy rollups). Structurally parallel to PR #154's
 * `{'acknowledged'}`, PR #156's `{'kv'}`, PR #159's `{'BUY','SELL'}` —
 * populated declared-but-not-wired slots.
 *
 * Note — signal-store-d1 is a SEPARATE concern. `src/desk/signal/signal-store-d1.ts`
 * also has a `deriveSource()` function that writes to the `signals` table
 * (NOT `paper_trades_v3`) and emits a variant `'qwen-m1max'` tag. That's a
 * `signals.source` enum — out of scope for this test. If the two tables'
 * source enums diverge (e.g. one adds `'manual'` before the other), each has
 * its own sync validator. This test locks ONLY `paper_trades_v3.source` via
 * the orchestrator writer.
 *
 * Drift scenarios covered:
 *   - DDL refactor strips the inline comment → extractor returns 0 values →
 *     sanity-floor fails loudly.
 *   - `deriveSource()` adds a 5th branch `return 'manual';` without
 *     graduating `'manual'` from RESERVED_SOURCES → reservation-semantics
 *     assertion fails.
 *   - `deriveSource()` renames `'qwen'` → `'qwen-m1max'` to match
 *     signal-store-d1 without extending the migration comment → code⊆comment
 *     assertion fails (runtime writes phantom source).
 *   - Migration DEFAULT changes from `'legacy'` to e.g. `'default'` without
 *     adding `'default'` to the comment enum → DEFAULT⊆comment fails.
 *
 * Symmetric to prior integrity edges:
 *   #132 alert↔metric, #135 dashboard↔metric, #137 runbook-index↔file,
 *   #143 alert↔runbook URL, #145 trigger_reason doc↔code,
 *   #146 runbook↔code-metric, #148 CLI↔route, #150 CLI self-consistency,
 *   #152 CLAUDE phase↔CI, #153 decision enum, #154 strategy_review.status,
 *   #155 kill-action, #156 kill-switch source, #157 signals-total result,
 *   #158 paper_trades_v3.status, #159 paper_trades_v3.side (4→2 reserved).
 *
 * Opens the **17th integrity edge** — THIRD column lock on paper_trades_v3
 * after #158 status + #159 side. Novel contribution: **comment-as-declaration
 * authority** (no CHECK) + **migration DEFAULT subset-of-comment** as a
 * testable invariant. Integrity hexadecagon → heptadecagon (17-gon). Pillar 3
 * feedback-loop data-layer row-level integrity now covers state-machine
 * (status), domain-split (side), AND provenance (source) columns.
 *
 * Non-goals: asserting signal-store-d1's `signals.source` enum, unifying the
 * two `deriveSource()` copies (tracked as future simplification), constraining
 * when `'manual'` should graduate from RESERVED, or validating reader-site
 * literal safety (no literals exist today — all reads use $1 params).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const MIGRATION_PATH = resolve(
  REPO_ROOT,
  'src/db/migrations/016_qwen_paper_tracking.sql',
);
const ORCHESTRATOR_PATH = resolve(
  REPO_ROOT,
  'src/wiring/paper-trading-orchestrator.ts',
);

/** Source values declared in migration comment but not yet returned by deriveSource(). Reserved for future manual operator-initiated paper-trade entry. */
const RESERVED_SOURCES = new Set<string>(['manual']);

/** Source values actively emitted today by paper-trading-orchestrator deriveSource(). */
const ACTIVE_SOURCES = new Set<string>(['qwen', 'deepseek', 'swarm', 'legacy']);

/** Source values follow snake_case lowercase pattern (no acronyms here, unlike PR #159's UPPERCASE side enum). */
const STYLE_RE = /^[a-z][a-z0-9_]*$/;

/**
 * Extract source enum from migration 016's inline comment adjacent to the
 * `source TEXT NOT NULL DEFAULT ...` column declaration in the `paper_trades_v3`
 * table body. Scoped to paper_trades_v3 so that comments on other columns or
 * other tables don't leak. The comment shape is the pipe-delimited literal
 * list immediately following `--`.
 *
 * Pattern anchor: `source TEXT NOT NULL DEFAULT 'legacy', -- 'a' | 'b' | ...`
 */
function extractMigrationCommentSources(sql: string): Set<string> {
  const out = new Set<string>();
  const tableBlock =
    /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+paper_trades_v3\s*\(([\s\S]*?)\)\s*;/i.exec(
      sql,
    );
  if (!tableBlock) return out;
  // Locate the `source TEXT ... DEFAULT '...' , -- '…' | '…' | ...` line
  const commentRe =
    /\bsource\s+TEXT[^,\n]*?,\s*--\s*((?:'[a-z_][a-z0-9_-]*'\s*(?:\|\s*)?)+)/i;
  const m = commentRe.exec(tableBlock[1]);
  if (!m) return out;
  for (const lit of m[1].matchAll(/'([a-z_][a-z0-9_-]*)'/g)) out.add(lit[1]);
  return out;
}

/**
 * Extract the DEFAULT literal from migration 016's `source` column declaration.
 * Must be a single value that's also declared in the inline comment (otherwise
 * a default-inserted row creates a phantom undocumented source).
 */
function extractMigrationDefaultSource(sql: string): string | null {
  const tableBlock =
    /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+paper_trades_v3\s*\(([\s\S]*?)\)\s*;/i.exec(
      sql,
    );
  if (!tableBlock) return null;
  const m = /\bsource\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'([a-z_][a-z0-9_-]*)'/i.exec(
    tableBlock[1],
  );
  return m ? m[1] : null;
}

/**
 * Extract the set of return-value string literals from the `deriveSource`
 * function in `paper-trading-orchestrator.ts`. Scoped to the function body
 * (anchored by `function deriveSource(...): string {` start + matching `}`)
 * so unrelated return literals in other functions in the same file (e.g.
 * `return 'qwen'` inside the log wrapper) don't leak.
 */
function extractOrchestratorDeriveSourceReturns(src: string): Set<string> {
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

describe('paper_trades_v3.source enum — 3-surface sync (comment-as-declaration)', () => {
  const migration = readFileSync(MIGRATION_PATH, 'utf8');
  const orchestrator = readFileSync(ORCHESTRATOR_PATH, 'utf8');

  const commentSources = extractMigrationCommentSources(migration);
  const defaultSource = extractMigrationDefaultSource(migration);
  const deriveSources = extractOrchestratorDeriveSourceReturns(orchestrator);

  it('migration comment parser extracts at least 5 sources (sanity floor)', () => {
    expect(
      commentSources.size,
      'migration 016 `source` inline comment parsed < 5 values — comment shape likely changed or was stripped',
    ).toBeGreaterThanOrEqual(5);
    for (const v of ['qwen', 'deepseek', 'swarm', 'legacy', 'manual']) {
      expect(
        commentSources.has(v),
        `migration comment missing expected source '${v}'`,
      ).toBe(true);
    }
  });

  it('migration DEFAULT extractor finds a single source literal (sanity floor)', () => {
    expect(
      defaultSource,
      'migration 016 `source TEXT NOT NULL DEFAULT ...` did not parse a literal — shape drifted',
    ).not.toBeNull();
  });

  it('orchestrator deriveSource extractor extracts at least 4 return literals (sanity floor)', () => {
    expect(
      deriveSources.size,
      'paper-trading-orchestrator.ts deriveSource() parsed < 4 return literals — function shape drifted',
    ).toBeGreaterThanOrEqual(4);
  });

  it('all collected sources follow snake_case lowercase style', () => {
    const all = new Set<string>([
      ...commentSources,
      ...deriveSources,
      ...(defaultSource ? [defaultSource] : []),
    ]);
    const offenders = [...all].filter((s) => !STYLE_RE.test(s));
    expect(
      offenders,
      `${offenders.length} source value(s) violate snake_case style: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('every deriveSource return literal is declared in migration comment (no undocumented writes)', () => {
    const undocumented = [...deriveSources].filter(
      (s) => !commentSources.has(s),
    );
    expect(
      undocumented,
      `paper-trading-orchestrator deriveSource returns ${undocumented.length} source(s) absent from migration 016 comment: ${undocumented.join(', ')} — writer produces phantom values`,
    ).toEqual([]);
  });

  it('migration DEFAULT value is in the comment-declared set (no phantom fallback)', () => {
    expect(
      defaultSource,
      'default source must exist before it can be validated',
    ).not.toBeNull();
    expect(
      commentSources.has(defaultSource!),
      `migration DEFAULT '${defaultSource}' not in comment-declared enum — default-inserted rows produce undocumented source`,
    ).toBe(true);
  });

  it('comment declarations partition into ACTIVE_SOURCES ∪ RESERVED_SOURCES (no orphan)', () => {
    const uncategorised = [...commentSources].filter(
      (s) => !ACTIVE_SOURCES.has(s) && !RESERVED_SOURCES.has(s),
    );
    expect(
      uncategorised,
      `migration comment declares ${uncategorised.length} source(s) not in ACTIVE_SOURCES or RESERVED_SOURCES: ${uncategorised.join(', ')} — either wire a deriveSource branch or add to RESERVED_SOURCES`,
    ).toEqual([]);
  });

  it('ACTIVE_SOURCES each appear in BOTH migration comment AND deriveSource returns', () => {
    for (const active of ACTIVE_SOURCES) {
      expect(
        commentSources.has(active),
        `migration comment missing active source '${active}'`,
      ).toBe(true);
      expect(
        deriveSources.has(active),
        `paper-trading-orchestrator deriveSource never returns active source '${active}'`,
      ).toBe(true);
    }
  });

  it('RESERVED_SOURCES each appear in migration comment but NOT in deriveSource (reservation semantics)', () => {
    for (const reserved of RESERVED_SOURCES) {
      expect(
        commentSources.has(reserved),
        `migration comment missing reserved source '${reserved}' — reservation stale`,
      ).toBe(true);
      expect(
        deriveSources.has(reserved),
        `reserved source '${reserved}' leaked into deriveSource returns — graduate to ACTIVE_SOURCES or remove the return branch`,
      ).toBe(false);
    }
  });

  it('comment enum partition is ACTIVE ∪ RESERVED exactly with empty intersection', () => {
    const union = new Set<string>([...ACTIVE_SOURCES, ...RESERVED_SOURCES]);
    expect(
      [...commentSources].sort(),
      `migration comment (${[...commentSources].join(', ')}) differs from ACTIVE∪RESERVED (${[...union].join(', ')})`,
    ).toEqual([...union].sort());
    const overlap = [...ACTIVE_SOURCES].filter((s) => RESERVED_SOURCES.has(s));
    expect(
      overlap,
      `ACTIVE_SOURCES ∩ RESERVED_SOURCES non-empty: ${overlap.join(', ')} — a source cannot be simultaneously wired and reserved`,
    ).toEqual([]);
  });

  it('RESERVED_SOURCES list stays aligned with migration comment (no orphaned reservations)', () => {
    const orphaned = [...RESERVED_SOURCES].filter(
      (s) => !commentSources.has(s),
    );
    expect(
      orphaned,
      `RESERVED_SOURCES references ${orphaned.length} value(s) absent from migration 016 comment: ${orphaned.join(', ')} — stale reservation`,
    ).toEqual([]);
  });

  it('migration DEFAULT is in ACTIVE_SOURCES (rows missing source tag must land in a wired bucket)', () => {
    expect(
      defaultSource,
      'default source must exist',
    ).not.toBeNull();
    expect(
      ACTIVE_SOURCES.has(defaultSource!),
      `migration DEFAULT '${defaultSource}' is not ACTIVE — default-inserted rows would be tagged with a reserved/unwired source, skewing rollups`,
    ).toBe(true);
  });
});
