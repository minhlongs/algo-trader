/**
 * paper_trades_v3.side enum 3-surface sync with 4→2 reserved-set asymmetry.
 *
 * `paper_trades_v3` is the source-tagged paper-trade ledger that feeds Qwen
 * A/B P&L comparison (Pillar 3 feedback-loop data layer). Its `side` column
 * is declared with a 4-value CHECK constraint that spans TWO distinct trading
 * domains:
 *   - Prediction-market positions: `'YES' | 'NO'` (Polymarket, Kalshi)
 *   - Crypto spot/perp positions: `'BUY' | 'SELL'` (CLOB orders, CCXT)
 *
 * Migration 016 intentionally admits all four so that a future crypto paper
 * ledger expansion reuses the same table. Today, the SOLE writer
 * (`src/wiring/paper-trading-orchestrator.ts` `savePaperTradeV3`) only emits
 * prediction-market sides — the `PaperTrade.side` TS field is typed
 * `'YES' | 'NO'` and every local literal assignment is constrained to that
 * union. `'BUY' / 'SELL'` exist in isolated crypto-domain modules (clob-client,
 * clob-v2-adapter, real-trade-ledger) that never flow into `paper_trades_v3`.
 *
 * The enum is declared across three surfaces that must stay in lockstep:
 *
 *   1. **DB CHECK constraint** — `src/db/migrations/016_qwen_paper_tracking.sql:14`:
 *        `side TEXT NOT NULL CHECK (side IN ('BUY','SELL','YES','NO'))`
 *      is the authoritative 4-value schema declaration.
 *   2. **TS PaperTrade interface** — `src/wiring/paper-trading-orchestrator.ts:26`:
 *        `side: 'YES' | 'NO'` is the 2-value compile-time contract for the
 *      sole writer of `paper_trades_v3`. Every `savePaperTradeV3(trade)` call
 *      is type-narrowed to this union before reaching the INSERT.
 *   3. **TS local literals** — `paper-trading-orchestrator.ts:145-148`:
 *        `const side: 'YES' | 'NO' = isEndgame ? (yesPrice < 0.5 ? 'NO' : 'YES')`
 *                                            `: (yesPrice < 0.5 ? 'YES' : 'NO');`
 *      is where runtime decides which prediction-market side to buy; both
 *      `'YES'` and `'NO'` string literals must appear here for the two code
 *      branches to be exercisable.
 *
 * `ACTIVE_SIDES = {'YES','NO'}` — currently-emitted prediction-market subset.
 * `RESERVED_SIDES = {'BUY','SELL'}` — declared in migration CHECK but not yet
 * wired in any code path that writes to `paper_trades_v3`. Structurally
 * parallel to PR #154's populated `RESERVED_STATUSES = {'acknowledged'}` and
 * PR #156's populated `RESERVED_SOURCES = {'kv'}` (declared-but-not-wired
 * slots); distinct from PR #155/#157/#158's empty `RESERVED_* = Set([])`.
 *
 * Drift scenarios covered:
 *   - Dev adds a crypto paper-trade writer that writes `side = 'BUY'` to
 *     `paper_trades_v3` without graduating `'BUY'` from RESERVED_SIDES to
 *     ACTIVE_SIDES → the orchestrator TS type `'YES' | 'NO'` rejects it
 *     at compile time (caught by type checker), AND the runtime reservation
 *     assertion here fails telling the dev to sweep both surfaces.
 *   - Dev relaxes migration CHECK to allow e.g. `'SPOT'` without extending
 *     the TS union → `paper-trades-v3-side-enum-sync.test` migration-parser
 *     picks up `'SPOT'`, ACTIVE∪RESERVED partition-exactness fails loudly.
 *   - Dev renames `'YES'` to `'yes'` (lowercase) only in TS without migrating
 *     the CHECK → UPPERCASE style assertion fails.
 *
 * Symmetric to the prior integrity edges:
 *   #132 alert↔metric, #135 dashboard↔metric, #137 runbook-index↔file,
 *   #143 alert↔runbook URL, #145 doc-enum↔code-enum trigger_reason,
 *   #146 runbook↔code-metric, #148 CLI↔route, #150 CLI self-consistency,
 *   #152 CLAUDE phase guide↔CI gate, #153 decision enum 3-way sync,
 *   #154 strategy_review_tasks.status 4-surface sync, #155 kill-action enum,
 *   #156 kill-switch source enum, #157 qwen-signals-total result enum,
 *   #158 paper_trades_v3.status enum 3-surface sync.
 *
 * Opens the **16th integrity edge** — locks the Qwen paper-trade ledger's
 * SECOND column enum (after #158 locked `status`). This time with a 4→2
 * reserved-set asymmetry where the migration intentionally over-declares
 * relative to today's single-domain code path. Integrity pentadecagon →
 * hexadecagon (16-gon). Pillar 3 feedback-loop data-layer **side** + **status**
 * columns both locked — the Qwen A/B P&L ledger's row-level integrity contract
 * is fully covered.
 *
 * Non-goals: asserting the LIVE crypto trading path's `side: 'BUY' | 'SELL'`
 * types (they live in `src/polymarket/*` and `src/execution/*` and don't flow
 * into this table), validating prediction-market resolution semantics, or
 * constraining when `'BUY' / 'SELL'` should graduate from RESERVED to ACTIVE
 * (that's a future-PR policy decision).
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

/** Sides declared in migration CHECK but not yet written by any code path to paper_trades_v3. Reserved for future crypto paper-trade ledger expansion. */
const RESERVED_SIDES = new Set<string>(['BUY', 'SELL']);

/** Sides actively emitted today — prediction-market subset wired via PaperTrade.side TS type + orchestrator local-literal assignment. */
const ACTIVE_SIDES = new Set<string>(['YES', 'NO']);

/** Side values are uppercase acronyms (DB CHECK declares uppercase literals, TS unions match). Distinct from status/decision/trigger_reason which are snake_case. */
const STYLE_RE = /^[A-Z][A-Z0-9_]*$/;

/** Strip SQL `--` line comments and `/* ... *\/` block comments. */
function stripSqlComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

/** Strip JS/TS `//` line comments and `/* ... *\/` block comments so commented-out literals / example-in-docstring enums don't leak. */
function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Extract the `side IN (...)` literal list from migration 016's CHECK
 * constraint. Scoped to the `paper_trades_v3` table definition so that other
 * CHECK constraints in the file (e.g. `status IN ('open','closed')`, future
 * columns) don't leak.
 */
function extractMigrationSides(sql: string): Set<string> {
  const out = new Set<string>();
  const tableBlock =
    /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+paper_trades_v3\s*\(([\s\S]*?)\)\s*;/i.exec(
      sql,
    );
  if (!tableBlock) return out;
  const sideMatch =
    /\bside\s+TEXT[^,]*?CHECK\s*\(\s*side\s+IN\s*\(([\s\S]*?)\)\s*\)/i.exec(
      tableBlock[1],
    );
  if (!sideMatch) return out;
  for (const lit of sideMatch[1].matchAll(/'([^']+)'/g)) out.add(lit[1]);
  return out;
}

/**
 * Extract the TS union members from the `PaperTrade.side` interface field
 * declaration in `paper-trading-orchestrator.ts`. Anchored to the interface
 * declaration so unrelated `side: 'YES' | 'NO'` fields in other interfaces
 * that may be defined or imported in the same file don't leak (today there
 * is only one — future refactors might pull in other types).
 *
 * Pattern matched:
 *   `export interface PaperTrade {` ... `side: 'YES' | 'NO';` ... `}`
 */
function extractInterfaceSides(src: string): Set<string> {
  const out = new Set<string>();
  const clean = stripJsComments(src);
  const ifaceRe =
    /export\s+interface\s+PaperTrade\s*\{([\s\S]*?)^\s*\}\s*$/m;
  const iface = ifaceRe.exec(clean);
  if (!iface) return out;
  const fieldRe = /\bside\s*:\s*((?:'[A-Z_]+'\s*(?:\|\s*)?)+)/;
  const field = fieldRe.exec(iface[1]);
  if (!field) return out;
  for (const lit of field[1].matchAll(/'([A-Z_]+)'/g)) out.add(lit[1]);
  return out;
}

/**
 * Extract TS local literal assignments to `side` variables in the orchestrator
 * body. Matches both:
 *   - `const side: 'YES' | 'NO' = …` type annotation (captures the union)
 *   - `? 'YES' : 'NO'` / `= 'YES'` / `= 'NO'` runtime literal values
 *
 * Scoped to `side`-typed contexts so unrelated string literals (`'qwen'`,
 * `'deepseek'`, `'simple-arb'`, `'Endgame'`, etc.) don't leak.
 */
function extractOrchestratorLiterals(src: string): Set<string> {
  const out = new Set<string>();
  const clean = stripJsComments(src);

  // Typed assignment: `const side: 'X' | 'Y' = …`
  for (const m of clean.matchAll(
    /(?:const|let|var)\s+side\s*:\s*((?:'[A-Z_]+'\s*(?:\|\s*)?)+)/g,
  )) {
    for (const lit of m[1].matchAll(/'([A-Z_]+)'/g)) out.add(lit[1]);
  }

  // Ternary / direct literal assignment in `side` expression context:
  //   `const side: '...' = A ? 'YES' : 'NO';`
  //   `side === 'YES' ? entry : exit`
  //   `trade.side === 'YES' ? yes : no`
  for (const m of clean.matchAll(
    /\bside\s*(?:===|==|=)\s*'([A-Z_]+)'/g,
  )) {
    out.add(m[1]);
  }
  for (const m of clean.matchAll(
    /\btrade\.side\s*(?:===|==)\s*'([A-Z_]+)'/g,
  )) {
    out.add(m[1]);
  }
  return out;
}

describe('paper_trades_v3.side enum — 3-surface sync', () => {
  const migration = readFileSync(MIGRATION_PATH, 'utf8');
  const orchestrator = readFileSync(ORCHESTRATOR_PATH, 'utf8');

  const migrationSides = extractMigrationSides(stripSqlComments(migration));
  const interfaceSides = extractInterfaceSides(orchestrator);
  const literalSides = extractOrchestratorLiterals(orchestrator);
  const codeSides = new Set<string>([...interfaceSides, ...literalSides]);

  it('migration parser extracts at least 4 sides (sanity floor)', () => {
    expect(
      migrationSides.size,
      'migration 016 paper_trades_v3.side CHECK parsed < 4 values — table shape likely changed',
    ).toBeGreaterThanOrEqual(4);
    for (const v of ['BUY', 'SELL', 'YES', 'NO']) {
      expect(
        migrationSides.has(v),
        `migration 016 CHECK missing expected side '${v}'`,
      ).toBe(true);
    }
  });

  it('PaperTrade interface parser extracts exactly the ACTIVE sides (sanity floor)', () => {
    expect(
      interfaceSides.size,
      'paper-trading-orchestrator.ts PaperTrade.side union parsed 0 members — interface shape drifted',
    ).toBeGreaterThanOrEqual(2);
    expect([...interfaceSides].sort()).toEqual([...ACTIVE_SIDES].sort());
  });

  it('orchestrator local literal parser extracts at least 2 side values (sanity floor)', () => {
    expect(
      literalSides.size,
      'paper-trading-orchestrator.ts local side literal/assignment parser yielded 0 values — runtime branch shape drifted',
    ).toBeGreaterThanOrEqual(2);
  });

  it('all collected sides follow UPPERCASE style (DB CHECK discipline)', () => {
    const all = new Set<string>([...migrationSides, ...codeSides]);
    const offenders = [...all].filter((s) => !STYLE_RE.test(s));
    expect(
      offenders,
      `${offenders.length} side value(s) violate UPPERCASE style: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('every code side literal is declared in migration CHECK (no runtime CHECK violations)', () => {
    const unknown = [...codeSides].filter((s) => !migrationSides.has(s));
    expect(
      unknown,
      `code emits ${unknown.length} side(s) not declared in migration 016 CHECK: ${unknown.join(', ')} — would fail CHECK at runtime`,
    ).toEqual([]);
  });

  it('migration values are either active or explicitly reserved (no orphan)', () => {
    const uncategorised = [...migrationSides].filter(
      (s) => !ACTIVE_SIDES.has(s) && !RESERVED_SIDES.has(s),
    );
    expect(
      uncategorised,
      `migration declares ${uncategorised.length} side(s) not in ACTIVE_SIDES or RESERVED_SIDES: ${uncategorised.join(', ')} — either wire a code path or add to RESERVED_SIDES with a comment`,
    ).toEqual([]);
  });

  it('ACTIVE_SIDES (YES, NO) each appear in migration AND in orchestrator code', () => {
    for (const active of ACTIVE_SIDES) {
      expect(
        migrationSides.has(active),
        `migration 016 CHECK missing active side '${active}'`,
      ).toBe(true);
      expect(
        codeSides.has(active),
        `no orchestrator surface references active side '${active}'`,
      ).toBe(true);
    }
  });

  it('RESERVED_SIDES (BUY, SELL) appear in migration but NOT in orchestrator code (reservation semantics)', () => {
    for (const reserved of RESERVED_SIDES) {
      expect(
        migrationSides.has(reserved),
        `migration 016 CHECK missing reserved side '${reserved}' — reservation is stale`,
      ).toBe(true);
      expect(
        codeSides.has(reserved),
        `reserved side '${reserved}' leaked into orchestrator — graduate to ACTIVE_SIDES or remove from code`,
      ).toBe(false);
    }
  });

  it('interface union equals literal-assignment union (contract ↔ runtime parity)', () => {
    const only_in_iface = [...interfaceSides].filter(
      (s) => !literalSides.has(s),
    );
    const only_in_literals = [...literalSides].filter(
      (s) => !interfaceSides.has(s),
    );
    expect(
      only_in_iface,
      `PaperTrade.side declares ${only_in_iface.join(', ')} but orchestrator runtime never assigns those literals — dead branch in union`,
    ).toEqual([]);
    expect(
      only_in_literals,
      `orchestrator assigns ${only_in_literals.join(', ')} but PaperTrade.side union doesn't declare those — type narrowing broken at call site`,
    ).toEqual([]);
  });

  it('migration CHECK partition = ACTIVE_SIDES ∪ RESERVED_SIDES exactly (no overlap, no orphan)', () => {
    const union = new Set<string>([...ACTIVE_SIDES, ...RESERVED_SIDES]);
    expect(
      [...migrationSides].sort(),
      `migration CHECK (${[...migrationSides].join(
        ', ',
      )}) differs from ACTIVE∪RESERVED (${[...union].join(', ')})`,
    ).toEqual([...union].sort());
    const overlap = [...ACTIVE_SIDES].filter((s) => RESERVED_SIDES.has(s));
    expect(
      overlap,
      `ACTIVE_SIDES ∩ RESERVED_SIDES non-empty: ${overlap.join(
        ', ',
      )} — a side cannot be simultaneously wired and reserved`,
    ).toEqual([]);
  });

  it('RESERVED_SIDES list stays aligned with migration (no orphaned reservations)', () => {
    const orphaned = [...RESERVED_SIDES].filter((s) => !migrationSides.has(s));
    expect(
      orphaned,
      `RESERVED_SIDES references ${orphaned.length} value(s) absent from migration 016 CHECK: ${orphaned.join(', ')} — stale reservation`,
    ).toEqual([]);
  });
});
