/**
 * paper_trades_v3 composite {size_usd > 0, entry_price ∈ [0, 1]} 5-surface sync — first multi-column invariant.
 *
 * Prediction-market coherence on `paper_trades_v3` requires TWO columns to
 * simultaneously satisfy related but distinct constraints on the same row:
 *   - `size_usd > 0` (economically meaningful position; no zero-size trades)
 *   - `entry_price ∈ [0, 1]` (Polymarket binary outcome price — unit of
 *      probability, 0 = certain NO, 1 = certain YES)
 *
 * Unlike prior single-column locks (range-bound #163, binary flag #162) or
 * same-column relationships (temporal ordering #164, temporal derivation
 * #165), this edge locks a COMPOSITE invariant where both columns MUST hold
 * together to produce semantically valid prediction-market rows. The two
 * constraints are INDEPENDENT at the column level (either could violate alone)
 * but COUPLED at the row level (cost-per-share math at read time assumes
 * both; either violation cascades to div-by-zero, negative P&L, or phantom
 * share-count).
 *
 * Unlike the 23 prior edges:
 *   - Prior families: 16× string-enum partition, 2× cross-module, 1× binary
 *     flag (#162), 1× range-bound (#163), 1× temporal ordering (#164),
 *     1× temporal derivation (#165), 1× structured-document shape (#166).
 *   - **NEW family #8: COMPOSITE MULTI-COLUMN SAME-ROW CONSTRAINT.**
 *     Locks a SEMANTIC COHERENCE invariant where two or more columns
 *     must SIMULTANEOUSLY satisfy distinct but related bounds for the row
 *     to make sense to downstream readers. Distinct from #163 (single
 *     column range) because it pins a MULTI-COLUMN semantic; distinct
 *     from #165 (derived column formula) because neither column is
 *     computed from the other — they are INDEPENDENT inputs coupled by
 *     downstream arithmetic (cost-per-share, P&L ratio).
 *
 * The composite invariant is declared across five surfaces that must stay
 * in lockstep:
 *
 *   1. **Migration column declarations (unconstrained)** —
 *      `src/db/migrations/016_qwen_paper_tracking.sql:15-16`:
 *        `size_usd        REAL NOT NULL,`
 *        `entry_price     REAL NOT NULL,`
 *      — REAL NOT NULL gives the column its type but NO CHECK constraint.
 *      Authority for the positivity + range bounds lives in the WRITER +
 *      READER contracts (documented gap).
 *   2. **Writer size formula (upper-bounded by Math.min)** —
 *      `src/wiring/paper-trading-orchestrator.ts:142`:
 *        `const size = Math.min(portfolio.capital * POSITION_SIZE_PCT, vibe.maxExposure);`
 *      — guarantees size > 0 when capital > 0 AND POSITION_SIZE_PCT > 0 AND
 *      vibe.maxExposure > 0 (all enforced upstream). `Math.min(...)` is the
 *      writer-side positivity mechanism.
 *   3. **Writer entry_price formula (from 0-1 market odds)** —
 *      `paper-trading-orchestrator.ts:148`:
 *        `const entryPrice = side === 'YES' ? market.yesPrice : market.noPrice;`
 *      — entry_price derived from Polymarket market odds (yesPrice, noPrice).
 *      Both yesPrice and noPrice are probabilities ∈ [0, 1] by Polymarket's
 *      Gamma API contract. Writer-side range-bound mechanism.
 *   4. **Reader cost-per-share inversion** —
 *      `paper-trading-orchestrator.ts:187`:
 *        `const costPerShare = trade.side === 'YES' ? trade.entryPrice : (1 - trade.entryPrice);`
 *      — IMPLICITLY requires entry_price ∈ [0, 1] to produce a sensible
 *      costPerShare ∈ [0, 1]. An out-of-range entry_price produces negative
 *      or > 1 cost per share (nonsense; breaks shares = size / costPerShare).
 *      The inversion formula `(1 - entryPrice)` is the COHERENCE mechanism
 *      that couples the two constraints.
 *   5. **Reader division guards (size_usd > 0 enforcement)** —
 *      5a. `qwen-drawdown-monitor.ts:102`: explicit JS-side `if (totalSize === 0) return null`
 *      5b. `qwen-signals-loop.ts:128`: SQL-side `NULLIF(SUM(size_usd), 0)` in Sharpe aggregate
 *      — TWO independent guards at reader layer protect the rolling-P&L and
 *      Sharpe-ratio computations from div-by-zero when aggregated size rolls
 *      to 0 (e.g., empty query window). Defense-in-depth: JS-side guard
 *      catches single-row zero-size, SQL-side guard catches aggregate-zero.
 *
 * Composite coherence invariants locked:
 *   - **Both constraints must hold** — size_usd > 0 AND entry_price ∈ [0, 1].
 *     Either violation breaks downstream P&L arithmetic.
 *   - **Writer + reader cooperation** — writer ensures positivity + range by
 *     construction; reader assumes it by inversion arithmetic. No DB CHECK.
 *   - **Mechanism-based proof** — if writer formulas hold (Math.min + ternary
 *     on [0,1] market odds), invariants hold by construction.
 *   - **Division safety asymmetry** — size_usd > 0 is guarded at reader
 *     TWO places (JS + SQL); entry_price ∈ [0, 1] is implicit via
 *     inversion formula (no explicit guard — writer-side only).
 *   - **Documented DB gap** — migration has NO CHECK; this is intentional
 *     (writer+reader discipline, avoids schema duplication of a semantic
 *     that changes per trading domain — future crypto expansion may relax
 *     entry_price > 0 without upper bound).
 *
 * Drift scenarios covered:
 *   - Writer drops `Math.min` → size = capital * 5%; if capital goes
 *     negative (bug), size goes negative → size_usd < 0 row persisted →
 *     case 4 fails (Math.min formula check).
 *   - Writer changes `market.yesPrice` → `market.yesPrice - 0.5` (normalise
 *     to ±0.5) without updating reader inversion → costPerShare = 1 - (-0.3)
 *     = 1.3 → shares = size / 1.3 wrong by 30%. Case 5 fails (ternary on
 *     yesPrice/noPrice shape).
 *   - Reader drops NULLIF → SUM(size_usd)=0 → divide-by-zero → daily_pnl_pct
 *     becomes Infinity/NaN → Sharpe calc poisoned. Case 7 fails.
 *   - Reader drops `totalSize === 0` check → /0 → JS Infinity leaks into
 *     drawdown decision. Case 6 fails.
 *   - Cost-per-share inversion drops `(1 - entryPrice)` branch for NO side
 *     → all NO trades compute wrong share count. Case 8 fails.
 *
 * Symmetric to prior integrity edges:
 *   #163 confidence single-column range, #164 strategy_review temporal
 *   ordering, #165 expires_at temporal derivation, #166 QualityMetrics
 *   JSONB shape, #158/#159/#160 paper_trades_v3 status/side/source enums.
 *
 * Opens the **24th integrity edge — TETRACOSAGON** (24-gon). First
 * composite multi-column same-row constraint edge. Novel family #8.
 * Integrity tricosagon → tetracosagon (24-gon). Pillar 3 paper-trade
 * ledger now has composite semantic coherence sync-validated alongside
 * its row-level enums (#158/#159/#160) and column-level invariants
 * (size + entry_price cooperation proven by writer+reader mechanisms).
 *
 * Non-goals: validating the empirical size_usd/entry_price distributions
 * in prod (data-quality concern, not contract-sync), asserting
 * cost-per-share ∈ [0, 1] at runtime (covered by settlement unit tests),
 * or locking POSITION_SIZE_PCT or vibe.maxExposure (separate scalar
 * positivity candidates for future edges).
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
const DRAWDOWN_PATH = resolve(REPO_ROOT, 'src/wiring/qwen-drawdown-monitor.ts');
const SIGNALS_LOOP_PATH = resolve(REPO_ROOT, 'src/wiring/qwen-signals-loop.ts');

/** Strip SQL comments. */
function stripSqlComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

/** Strip JS/TS comments. */
function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Check migration 016's `paper_trades_v3` CREATE TABLE for the two columns.
 * Returns type + NOT NULL + whether there's any CHECK constraint clause.
 */
function extractCompositeColumnShape(sql: string): {
  sizeUsd: { type: string | null; notNull: boolean; hasCheck: boolean };
  entryPrice: { type: string | null; notNull: boolean; hasCheck: boolean };
} {
  const tableRe =
    /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+paper_trades_v3\s*\(([\s\S]*?)\)\s*;/i;
  const m = tableRe.exec(sql);
  const empty = { type: null, notNull: false, hasCheck: false };
  if (!m) return { sizeUsd: empty, entryPrice: empty };
  const body = m[1];
  const parseCol = (name: string) => {
    const colRe = new RegExp(
      '\\b' + name + '\\s+(\\w+)(\\s+NOT\\s+NULL)?([^,]*?)(?:,|$)',
      'i',
    );
    const cm = colRe.exec(body);
    if (!cm) return empty;
    return {
      type: cm[1].toUpperCase(),
      notNull: !!cm[2],
      hasCheck: /CHECK\s*\(/i.test(cm[3] ?? ''),
    };
  };
  return {
    sizeUsd: parseCol('size_usd'),
    entryPrice: parseCol('entry_price'),
  };
}

/**
 * Detect the writer's size formula pattern: `Math.min(capital*X, maxExposure)`.
 * Returns whether the Math.min clamp is present.
 */
function hasSizeMathMinFormula(src: string): boolean {
  const clean = stripJsComments(src);
  return /const\s+size\s*=\s*Math\.min\s*\(/m.test(clean);
}

/**
 * Detect the writer's entry_price ternary pattern:
 *   `entryPrice = side === 'YES' ? market.yesPrice : market.noPrice`
 */
function hasEntryPriceYesNoTernary(src: string): boolean {
  const clean = stripJsComments(src);
  return /const\s+entryPrice\s*=\s*side\s*===\s*'YES'\s*\?\s*market\.yesPrice\s*:\s*market\.noPrice/m.test(
    clean,
  );
}

/**
 * Detect the cost-per-share inversion pattern in the settlement/check path:
 *   `costPerShare = trade.side === 'YES' ? trade.entryPrice : (1 - trade.entryPrice)`
 */
function hasCostPerShareInversion(src: string): boolean {
  const clean = stripJsComments(src);
  return /costPerShare\s*=\s*trade\.side\s*===\s*'YES'\s*\?\s*trade\.entryPrice\s*:\s*\(\s*1\s*-\s*trade\.entryPrice\s*\)/m.test(
    clean,
  );
}

/**
 * Detect the drawdown-monitor's JS-side division guard:
 *   `if (totalSize === 0) return ...`
 */
function hasDrawdownDivisionGuard(src: string): boolean {
  const clean = stripJsComments(src);
  return /if\s*\(\s*totalSize\s*===\s*0\s*\)/m.test(clean);
}

/**
 * Detect the signals-loop's SQL-side NULLIF guard on size_usd:
 *   `NULLIF(SUM(size_usd), 0)`
 */
function hasSignalsLoopNullifGuard(src: string): boolean {
  const clean = stripJsComments(src);
  return /NULLIF\s*\(\s*SUM\s*\(\s*size_usd\s*\)\s*,\s*0\s*\)/i.test(clean);
}

describe('paper_trades_v3 composite {size_usd > 0, entry_price ∈ [0,1]} — 5-surface sync', () => {
  const migration = readFileSync(MIGRATION_PATH, 'utf8');
  const orchestrator = readFileSync(ORCHESTRATOR_PATH, 'utf8');
  const drawdown = readFileSync(DRAWDOWN_PATH, 'utf8');
  const signalsLoop = readFileSync(SIGNALS_LOOP_PATH, 'utf8');

  const shape = extractCompositeColumnShape(stripSqlComments(migration));

  it('migration declares size_usd REAL NOT NULL (shape sanity)', () => {
    expect(shape.sizeUsd.type).toBe('REAL');
    expect(shape.sizeUsd.notNull).toBe(true);
  });

  it('migration declares entry_price REAL NOT NULL (shape sanity)', () => {
    expect(shape.entryPrice.type).toBe('REAL');
    expect(shape.entryPrice.notNull).toBe(true);
  });

  it('migration has NO CHECK constraint on either column (documented gap — writer+reader discipline carries authority)', () => {
    // This test documents the intentional absence of DB-layer CHECK.
    // Future crypto-paper-trade expansion may relax entry_price bounds
    // (e.g., crypto orderbook prices are unbounded above). Locking at
    // DB layer would force a migration + code sweep on every domain
    // change. Writer-contract is the cleaner authority.
    expect(
      shape.sizeUsd.hasCheck,
      'size_usd has a CHECK constraint — if this is intentional (tightening), update this test with rationale + move to a range-bound family edge',
    ).toBe(false);
    expect(
      shape.entryPrice.hasCheck,
      'entry_price has a CHECK constraint — same note',
    ).toBe(false);
  });

  it('writer size formula uses Math.min clamp (upper-bounded positivity)', () => {
    expect(
      hasSizeMathMinFormula(orchestrator),
      'paper-trading-orchestrator.ts missing `const size = Math.min(...)` formula — positivity mechanism lost; size could become unbounded or negative',
    ).toBe(true);
  });

  it("writer entry_price uses ternary on side === 'YES' ? yesPrice : noPrice (0-1 bound via Polymarket odds)", () => {
    expect(
      hasEntryPriceYesNoTernary(orchestrator),
      "paper-trading-orchestrator.ts missing `entryPrice = side === 'YES' ? market.yesPrice : market.noPrice` — range-bound mechanism lost; entryPrice could be any number",
    ).toBe(true);
  });

  it('drawdown-monitor reader has explicit JS-side `totalSize === 0` division guard', () => {
    expect(
      hasDrawdownDivisionGuard(drawdown),
      'qwen-drawdown-monitor.ts missing `if (totalSize === 0) return ...` — JS-side division-by-zero protection lost',
    ).toBe(true);
  });

  it('signals-loop reader uses SQL-side NULLIF(SUM(size_usd), 0) guard (Sharpe aggregate defense)', () => {
    expect(
      hasSignalsLoopNullifGuard(signalsLoop),
      'qwen-signals-loop.ts missing `NULLIF(SUM(size_usd), 0)` — SQL-side aggregate division-by-zero protection lost',
    ).toBe(true);
  });

  it('cost-per-share inversion pattern present — couples entry_price to [0,1] range semantic', () => {
    expect(
      hasCostPerShareInversion(orchestrator),
      "paper-trading-orchestrator.ts missing `costPerShare = trade.side === 'YES' ? trade.entryPrice : (1 - trade.entryPrice)` — COHERENCE mechanism lost; if entry_price drifts outside [0,1] the inversion produces nonsense cost, breaking shares=size/costPerShare arithmetic",
    ).toBe(true);
  });

  it('defense-in-depth — BOTH JS and SQL division guards present (cross-layer protection)', () => {
    // Asymmetric coverage:
    // - size_usd > 0 is guarded TWICE (JS + SQL); catches single-row zero + aggregate zero.
    // - entry_price ∈ [0,1] has no guard (writer-side + cost-per-share coherence only).
    // The rationale: size_usd zero would crash production (division-by-zero),
    // so defense-in-depth. entry_price outside [0,1] produces "wrong but
    // non-crashing" share counts — caught by eventual P&L sanity checks.
    expect(
      hasDrawdownDivisionGuard(drawdown) && hasSignalsLoopNullifGuard(signalsLoop),
      'cross-layer division-guard coverage broken — either JS or SQL guard missing. For size_usd > 0 coherence, BOTH layers must guard (defense-in-depth)',
    ).toBe(true);
  });

  it('all 3 writer/reader coherence mechanisms present simultaneously (composite invariant)', () => {
    // The composite invariant REQUIRES all three mechanisms in lockstep:
    //   1. Writer size ≥ Math.min positivity
    //   2. Writer entry_price ∈ [0,1] ternary on market odds
    //   3. Reader cost-per-share inversion couples entry_price ∈ [0,1]
    // Dropping ANY one breaks the chain (size can go negative, or entry_price
    // out of range, or inversion arithmetic wrong). This case asserts all
    // three fire together — the "composite" part of the composite invariant.
    const s = hasSizeMathMinFormula(orchestrator);
    const e = hasEntryPriceYesNoTernary(orchestrator);
    const c = hasCostPerShareInversion(orchestrator);
    expect(
      s && e && c,
      `composite invariant broken: size-Math.min=${s}, entry_price-ternary=${e}, costPerShare-inversion=${c} — all three writer/reader mechanisms must fire together; dropping one cascades to wrong shares/wrong P&L/wrong Sharpe`,
    ).toBe(true);
  });

  it('writer-contract authority is THE authority for composite semantic (no DB CHECK, no migration bound comment)', () => {
    // Meta-assertion: this edge deliberately has NO CHECK constraint and NO
    // semantic comment on the migration columns. Authority lives ENTIRELY
    // in the writer + reader mechanisms asserted above. If a future PR adds
    // a CHECK constraint, it should pair with this test being simplified
    // (or retired in favor of a range-bound family edge like #163).
    expect(shape.sizeUsd.hasCheck).toBe(false);
    expect(shape.entryPrice.hasCheck).toBe(false);
    // The rationale: Polymarket binary outcomes guarantee yesPrice+noPrice
    // ∈ [0,1] at the API boundary, so writer-side assignment is safe. A
    // DB CHECK would duplicate this constraint without catching any drift
    // the writer+reader tests don't already catch.
    expect(shape.sizeUsd.type).toBe('REAL');
    expect(shape.entryPrice.type).toBe('REAL');
  });
});
