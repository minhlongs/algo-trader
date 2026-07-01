/**
 * paper_trades_v3.status enum 3-surface sync.
 *
 * `paper_trades_v3` is the source-tagged paper-trade ledger that feeds Qwen
 * A/B P&L comparison (Pillar 3 feedback-loop data layer). Its `status` column
 * is a 2-state machine — `'open'` (row inserted at trade entry) → `'closed'`
 * (row read during rolling P&L / win-rate aggregation). The enum is declared
 * across three surfaces that must stay in lockstep:
 *
 *   1. **DB CHECK constraint** — `src/db/migrations/016_qwen_paper_tracking.sql`:
 *        `status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed'))`
 *      is the authoritative schema declaration. CHECK failure at INSERT/UPDATE
 *      is the last-resort guard, but silent divergence above it still leaves
 *      rollup queries reading from a stale label vocabulary.
 *   2. **INSERT literal** — `src/desk/wiring/paper-trading-orchestrator.ts`
 *      `savePaperTradeV3` writes new rows with `VALUES (..., 'open', $9)` on
 *      line 56. This is the only write site — every paper trade enters the
 *      ledger in `'open'` state.
 *   3. **SELECT literals** — rollup queries read rows with
 *      `WHERE status = 'closed'` in three locations that drive the operator's
 *      observability signals:
 *        - `src/desk/wiring/qwen-drawdown-monitor.ts:90` (rolling 24h P&L — feeds
 *           the L1 drawdown kill-switch kill/unkill decision)
 *        - `src/desk/wiring/qwen-signals-loop.ts:108` (7-day win-rate aggregate —
 *           feeds `qwen_strategy_reviews_queued_total` threshold trigger)
 *        - `src/desk/wiring/qwen-signals-loop.ts:130` (Sharpe daily pct aggregate —
 *           feeds same threshold trigger)
 *
 * A drift in any direction is silently destructive:
 *   - Developer adds `status='settled'` transition (e.g. a future margin-close
 *     distinction) without extending migration 016's CHECK → `INSERT` / `UPDATE`
 *     fails at runtime; or, if the CHECK is relaxed first but rollup queries
 *     stay pinned to `'closed'` only, the new state is silently excluded from
 *     drawdown/win-rate/Sharpe rollups.
 *   - Migration renames `'open'` to `'pending'` in a future paper_trades_v4
 *     redesign without updating the INSERT literal → every paper trade fails
 *     CHECK on write.
 *   - Someone writes a rollup against `WHERE status = 'active'` (typo) → query
 *     silently returns zero rows; drawdown percentage stays at 0 forever; the
 *     kill-switch never fires.
 *
 * Symmetric to the prior integrity edges:
 *   #132 alert↔metric, #135 dashboard↔metric, #137 runbook-index↔file,
 *   #143 alert↔runbook URL, #145 doc-enum↔code-enum trigger_reason,
 *   #146 runbook↔code-metric, #148 CLI↔route, #150 CLI self-consistency,
 *   #152 CLAUDE phase guide↔CI gate, #153 decision enum 3-way sync,
 *   #154 strategy_review_tasks.status 4-surface sync, #155 kill-action enum,
 *   #156 kill-switch source enum, #157 qwen-signals-total result enum.
 *
 * Opens the **15th integrity edge** — locks the Qwen paper-trade ledger
 * state-machine contract. Second table-scoped status enum lock (companion to
 * PR #154 which locked `strategy_review_tasks.status` on a DIFFERENT table
 * with a DIFFERENT enum {pending|acknowledged|resolved}). Integrity
 * tetradecagon → pentadecagon (15-gon). Pillar 3 feedback-loop data layer
 * fully locked alongside the trigger_reason (#145), decision (#153) and
 * strategy_review_tasks.status (#154) enums.
 *
 * Non-goals: validating that an UPDATE site transitions `'open'` → `'closed'`
 * atomically (no literal UPDATE site today — state transition is an implicit
 * invariant of whoever writes `closed_at`), asserting rollup-query semantic
 * correctness (covered by drawdown-monitor / signals-loop unit tests), or
 * constraining the table's column DEFAULT (covered by migration-shape test).
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
  'src/desk/wiring/paper-trading-orchestrator.ts',
);
const PERSISTENCE_PATH = resolve(
  REPO_ROOT,
  'src/desk/wiring/paper-trading-persistence.ts',
);
const DRAWDOWN_PATH = resolve(REPO_ROOT, 'src/desk/wiring/qwen-drawdown-monitor.ts');
const SIGNALS_LOOP_PATH = resolve(REPO_ROOT, 'src/desk/wiring/qwen-signals-loop.ts');

/** Migration values reserved for future use — declared in CHECK but not yet exercised by code literals. Empty today — both declared states are wired. */
const RESERVED_STATUSES = new Set<string>([]);

/** Statuses actively emitted by INSERT + exercised by SELECT literals in current code paths. */
const ACTIVE_STATUSES = new Set<string>(['open', 'closed']);

const STYLE_RE = /^[a-z][a-z0-9_]*$/;

/** Strip SQL `--` line comments and `/* ... *\/` blocks. */
function stripSqlComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

/** Strip JS/TS `//` line comments and `/* ... *\/` blocks so commented-out SQL literals don't leak. */
function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Extract `status IN ('a','b',...)` literal list from migration 016's CHECK
 * constraint. Scoped to the `paper_trades_v3` table definition so that other
 * CHECK constraints in the same file (e.g. `side IN ('BUY','SELL','YES','NO')`)
 * don't leak.
 */
function extractMigrationStatuses(sql: string): Set<string> {
  const out = new Set<string>();
  const tableBlock =
    /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+paper_trades_v3\s*\(([\s\S]*?)\)\s*;/i.exec(
      sql,
    );
  if (!tableBlock) return out;
  const statusMatch =
    /status\s+TEXT[^,]*?CHECK\s*\(\s*status\s+IN\s*\(([\s\S]*?)\)\s*\)/i.exec(
      tableBlock[1],
    );
  if (!statusMatch) return out;
  for (const lit of statusMatch[1].matchAll(/'([^']+)'/g)) out.add(lit[1]);
  return out;
}

/**
 * Extract status literals from SQL template blocks that reference the
 * `paper_trades_v3` table. Scoping the backtick template to the table name
 * eliminates false positives from unrelated `status =` literals (Kalshi market
 * feed `'open' | 'closed' | 'settled'` comment, circuit-breaker state machine
 * `'closed' | 'open' | 'half-open'`, strategy_review_tasks.status, etc.).
 *
 * Matches both:
 *   - `status = 'X'` and `status IN ('X','Y')` comparisons (SELECT/UPDATE sites)
 *   - `VALUES (..., 'X', ...)` literals in INSERT templates (write sites)
 * For INSERT, we key on the column-order position of `status` in the INSERT
 * column list so we capture the correct VALUES literal without false positives
 * from e.g. `side` or `source` literals further in the same VALUES tuple.
 */
function extractSqlStatusesForTable(src: string, table: string): Set<string> {
  const out = new Set<string>();
  const blockRe = new RegExp('`([^`]*' + table + '[^`]*)`', 'g');
  for (const block of src.matchAll(blockRe)) {
    const sql = block[1];

    // SELECT/UPDATE comparisons: `status = 'X'` or `status IN ('X', 'Y')`.
    for (const lit of sql.matchAll(
      /\bstatus\s*(?:=|IN\s*\()\s*\(?\s*'([a-z_][a-z0-9_]*)'/gi,
    )) {
      out.add(lit[1]);
    }

    // INSERT write sites: locate `INSERT INTO <table> (cols...) VALUES (literals...)`
    // then pick the literal at the column index matching `status`.
    const insertRe = new RegExp(
      'INSERT\\s+INTO\\s+' +
        table +
        '\\s*\\(([^)]*)\\)\\s*VALUES\\s*\\(([^)]*)\\)',
      'gi',
    );
    for (const insert of sql.matchAll(insertRe)) {
      const cols = insert[1].split(',').map((c) => c.trim());
      const vals = insert[2].split(',').map((v) => v.trim());
      const idx = cols.findIndex((c) => c.toLowerCase() === 'status');
      if (idx < 0 || idx >= vals.length) continue;
      const literal = /^'([a-z_][a-z0-9_]*)'$/.exec(vals[idx]);
      if (literal) out.add(literal[1]);
    }
  }
  return out;
}

describe('paper_trades_v3.status enum — 3-surface sync', () => {
  const migration = readFileSync(MIGRATION_PATH, 'utf8');
  const orchestrator = readFileSync(ORCHESTRATOR_PATH, 'utf8');
  const persistence = readFileSync(PERSISTENCE_PATH, 'utf8');
  const drawdown = readFileSync(DRAWDOWN_PATH, 'utf8');
  const signalsLoop = readFileSync(SIGNALS_LOOP_PATH, 'utf8');

  const migrationStatuses = extractMigrationStatuses(stripSqlComments(migration));
  const orchestratorStatuses = extractSqlStatusesForTable(
    stripJsComments(orchestrator),
    'paper_trades_v3',
  );
  const persistenceStatuses = extractSqlStatusesForTable(
    stripJsComments(persistence),
    'paper_trades_v3',
  );
  const drawdownStatuses = extractSqlStatusesForTable(
    stripJsComments(drawdown),
    'paper_trades_v3',
  );
  const signalsLoopStatuses = extractSqlStatusesForTable(
    stripJsComments(signalsLoop),
    'paper_trades_v3',
  );
  const codeStatuses = new Set<string>([
    ...orchestratorStatuses,
    ...persistenceStatuses,
    ...drawdownStatuses,
    ...signalsLoopStatuses,
  ]);

  it('migration parser extracts at least 2 statuses (sanity floor)', () => {
    expect(
      migrationStatuses.size,
      'migration 016 paper_trades_v3.status CHECK parsed 0 values — table shape likely changed',
    ).toBeGreaterThanOrEqual(2);
    expect(migrationStatuses.has('open')).toBe(true);
    expect(migrationStatuses.has('closed')).toBe(true);
  });

  it('paper-trading-orchestrator INSERT parser extracts at least 1 status literal (sanity floor)', () => {
    const insertStatuses = orchestratorStatuses.size + persistenceStatuses.size;
    expect(
      insertStatuses,
      'neither paper-trading-orchestrator.ts nor paper-trading-persistence.ts parsed paper_trades_v3 status literals — INSERT shape drifted',
    ).toBeGreaterThanOrEqual(1);
  });

  it('drawdown-monitor SELECT parser extracts at least 1 status literal (sanity floor)', () => {
    expect(
      drawdownStatuses.size,
      'qwen-drawdown-monitor.ts parsed 0 paper_trades_v3 status literals — rolling P&L query drifted',
    ).toBeGreaterThanOrEqual(1);
  });

  it('signals-loop SELECT parser extracts at least 1 status literal (sanity floor)', () => {
    expect(
      signalsLoopStatuses.size,
      'qwen-signals-loop.ts parsed 0 paper_trades_v3 status literals — 7d win-rate/Sharpe query drifted',
    ).toBeGreaterThanOrEqual(1);
  });

  it('all collected statuses follow snake_case (DB CHECK discipline)', () => {
    const all = new Set<string>([...migrationStatuses, ...codeStatuses]);
    const offenders = [...all].filter((s) => !STYLE_RE.test(s));
    expect(
      offenders,
      `${offenders.length} status value(s) violate snake_case: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('every code status literal is declared in migration CHECK (no runtime CHECK violations)', () => {
    const unknown = [...codeStatuses].filter((s) => !migrationStatuses.has(s));
    expect(
      unknown,
      `code emits ${unknown.length} status(es) not declared in migration 016 CHECK: ${unknown.join(', ')} — would fail CHECK at runtime`,
    ).toEqual([]);
  });

  it('migration values are either active or explicitly reserved (no orphan)', () => {
    const uncategorised = [...migrationStatuses].filter(
      (s) => !ACTIVE_STATUSES.has(s) && !RESERVED_STATUSES.has(s),
    );
    expect(
      uncategorised,
      `migration declares ${uncategorised.length} status(es) not in ACTIVE_STATUSES or RESERVED_STATUSES: ${uncategorised.join(', ')} — either wire a code path or add to RESERVED_STATUSES with a comment`,
    ).toEqual([]);
  });

  it('active statuses (open, closed) are both declared in migration AND referenced by at least one code site', () => {
    for (const active of ACTIVE_STATUSES) {
      expect(
        migrationStatuses.has(active),
        `migration 016 CHECK missing active status '${active}'`,
      ).toBe(true);
      expect(
        codeStatuses.has(active),
        `no code site (orchestrator / drawdown-monitor / signals-loop) references active status '${active}'`,
      ).toBe(true);
    }
  });

  it("INSERT write site emits 'open' (entry-state invariant for paper-trade ledger)", () => {
    expect(
      orchestratorStatuses.has('open') || persistenceStatuses.has('open'),
      "no code site writes status='open' — ledger entry-state invariant broken",
    ).toBe(true);
  });

  it("SELECT rollup sites reference 'closed' (exit-state rollup invariant)", () => {
    const rollupStatuses = new Set<string>([
      ...drawdownStatuses,
      ...signalsLoopStatuses,
    ]);
    expect(
      rollupStatuses.has('closed'),
      "no SELECT rollup query filters by status='closed' — drawdown / win-rate / Sharpe aggregates drifted",
    ).toBe(true);
  });

  it('RESERVED_STATUSES list stays aligned with migration (no orphaned reservations)', () => {
    const orphaned = [...RESERVED_STATUSES].filter(
      (s) => !migrationStatuses.has(s),
    );
    expect(
      orphaned,
      `RESERVED_STATUSES references ${orphaned.length} value(s) absent from migration 016 CHECK: ${orphaned.join(', ')} — stale reservation`,
    ).toEqual([]);
  });

  it('reserved statuses (if any) are NOT referenced by any code site (reservation semantics)', () => {
    const leaked = [...RESERVED_STATUSES].filter((s) => codeStatuses.has(s));
    expect(
      leaked,
      `reserved statuses leaked into code: ${leaked.join(', ')} — remove from RESERVED_STATUSES or unwire code path`,
    ).toEqual([]);
  });
});
