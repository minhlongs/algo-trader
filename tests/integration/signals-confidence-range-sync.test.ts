/**
 * signals.confidence [0, 1] range-bound 5-surface sync — first boundary-constraint edge.
 *
 * `signals.confidence` is a REAL column on the canonical `signals` table
 * representing the AI validator's confidence score for a generated signal.
 * Semantically a probability ∈ [0, 1]. The DB enforces the range via
 * `CHECK (confidence >= 0 AND confidence <= 1)` at migration 014 line 10.
 * Downstream policy gates filter signals against tiered thresholds (FREE:
 * 0.7, PRO: 0.6, ENTERPRISE: 0.5) declared in TIER_SIGNAL_CONFIG. The
 * orchestrator's `MIN_AI_CONFIDENCE = 0.7` rejects signals below the FREE
 * tier threshold before routing to paper-trading.
 *
 * Unlike the 19 prior edges (16× string enums, 1× INTEGER binary flag #162,
 * 2× cross-module coordination), this is the **first range-bound / boundary
 * constraint edge** — values are validated as members of a closed interval
 * `[0, 1]`, not as members of a finite set. Novel invariant family:
 *   - **Boundary inclusivity** — CHECK uses `>=` and `<=` (inclusive).
 *     Drifting to `>` / `<` would silently reject the boundary values 0 and 1.
 *   - **Policy-threshold coverage** — every `minConfidence` threshold and the
 *     `MIN_AI_CONFIDENCE` constant must lie within the CHECK bounds.
 *     A threshold outside `[0, 1]` is an immediate dead gate (rejects
 *     everything or accepts everything) — a silent policy bypass.
 *   - **Type discipline** — SQL REAL maps to TS `number`. Drift to `string`
 *     would make comparisons lexicographic and break the range semantics.
 *   - **Inline-comment ↔ CHECK parity** — TS field comment `// 0..1` must
 *     match the migration CHECK bounds. A silent comment update to `// 0..100`
 *     without migration change would mislead operators reading the type.
 *
 * The range is declared across five surfaces that must stay in lockstep:
 *
 *   1. **Migration CHECK constraint** — `src/db/migrations/014_signal_feed.sql:10`:
 *        `confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1)`
 *      — authoritative range `[0, 1]` with inclusive bounds.
 *   2. **TS Signal interface** — `src/desk/signal/signal-types.ts:14`:
 *        `confidence: number;   // 0..1`
 *      — type is `number`, inline comment pins the semantic range.
 *   3. **TIER_SIGNAL_CONFIG thresholds** — `src/desk/signal/signal-types.ts:32-48`:
 *        FREE.minConfidence = 0.7, PRO.minConfidence = 0.6,
 *        ENTERPRISE.minConfidence = 0.5 — all must lie within CHECK bounds.
 *   4. **Orchestrator gate constant** — `src/wiring/paper-trading-orchestrator.ts:87`:
 *        `const MIN_AI_CONFIDENCE = 0.7` — AI validation gate. Must lie
 *      within CHECK bounds AND equal at least one TIER_SIGNAL_CONFIG
 *      threshold (policy consistency — the FREE tier threshold is the
 *      strictest gate).
 *   5. **Orchestrator gate comparison** — `paper-trading-orchestrator.ts:132`:
 *        `validation.confidence < MIN_AI_CONFIDENCE` — uses strict `<`,
 *      which is correct for a rejection gate (reject if BELOW threshold,
 *      accept at exactly `MIN_AI_CONFIDENCE`). Must remain strict; flipping
 *      to `<=` would reject signals with confidence exactly at threshold.
 *
 * Drift scenarios covered:
 *   - Migration CHECK relaxes to `>= -1 AND <= 2` (e.g. someone allows
 *     overshoots for raw-score storage) → case 1 lower/upper assertion
 *     fails; policy thresholds appear within new range but tier semantics
 *     silently drift.
 *   - TIER_SIGNAL_CONFIG adds a new tier with `minConfidence: 1.2` (typo
 *     for 0.12) → case 6 fails: threshold outside [0, 1], dead gate.
 *   - `MIN_AI_CONFIDENCE` drifts to 0.75 while FREE tier stays 0.7 → case 8
 *     fails: orchestrator gate no longer aligns with any tier (operators
 *     hit two different thresholds on the same data path).
 *   - Migration CHECK uses strict `>` / `<` → case 1 inclusivity check
 *     fails (can't insert confidence=0 or confidence=1).
 *   - TS inline comment drifts from `// 0..1` to `// 0..100` (refactor to
 *     percentage) without CHECK update → case 3 fails (comment
 *     disagreement).
 *   - Orchestrator comparison flipped to `confidence <= MIN_AI_CONFIDENCE`
 *     → case 9 fails (boundary-inclusion direction flipped).
 *
 * Symmetric to prior integrity edges:
 *   #132–#157 (Pillar 2 observability), #145 #153 #154 #158 #159 #160 #161
 *   (Pillar 3 enums), #162 signals.paper_only (Pillar 3 binary flag).
 *
 * Opens the **20th integrity edge — the ICOSAGON** (20-gon). First
 * range/boundary-constraint edge. Novel invariant family: numeric range
 * with inclusive bounds, policy-threshold coverage, type discipline,
 * inline-comment parity, rejection-gate direction. Integrity enneadecagon
 * → **icosagon** (20-gon). Pillar 3 feedback-loop data-validation
 * perimeter now complete: confidence ranges locked (precision), paper-gate
 * binary locked (#162), paper-trade state-machines locked (#158/#159/#160),
 * signals.source enum locked (#161), kill-switch state machines locked
 * (#154/#155/#156).
 *
 * Non-goals: validating that EVERY caller of `saveSignal(signal)` bounds
 * confidence ∈ [0, 1] before passing (callgraph audit out of scope — DB
 * CHECK is the last-resort guard), asserting Sharpe/win-rate numeric
 * bounds (separate candidate — reserved for future edge), constraining
 * raw-score models that may produce > 1 scores before normalization.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const MIGRATION_PATH = resolve(
  REPO_ROOT,
  'src/db/migrations/014_signal_feed.sql',
);
const SIGNAL_TYPES_PATH = resolve(REPO_ROOT, 'src/desk/signal/signal-types.ts');
const ORCHESTRATOR_PATH = resolve(
  REPO_ROOT,
  'src/wiring/paper-trading-orchestrator.ts',
);

/** Expected range for confidence column (inclusive). */
const EXPECTED_LOWER = 0;
const EXPECTED_UPPER = 1;

/**
 * Extract the confidence CHECK range from migration 014. Returns `{ lower,
 * upper, lowerInclusive, upperInclusive }` or all-null if shape drifted.
 * Scoped to the `confidence` column's CHECK (not other numeric CHECKs in
 * the file, e.g. future size_usd bounds).
 */
function extractMigrationRange(sql: string): {
  lower: number | null;
  upper: number | null;
  lowerInclusive: boolean;
  upperInclusive: boolean;
} {
  const re =
    /\bconfidence\s+REAL[^,]*?CHECK\s*\(\s*confidence\s*(>=|>)\s*(-?\d+(?:\.\d+)?)\s+AND\s+confidence\s*(<=|<)\s*(-?\d+(?:\.\d+)?)\s*\)/i;
  const m = re.exec(sql);
  if (!m) {
    return {
      lower: null,
      upper: null,
      lowerInclusive: false,
      upperInclusive: false,
    };
  }
  return {
    lower: parseFloat(m[2]),
    upper: parseFloat(m[4]),
    lowerInclusive: m[1] === '>=',
    upperInclusive: m[3] === '<=',
  };
}

/**
 * Extract the `confidence` field TS type declaration + inline range comment
 * from `signal-types.ts`. Expected shape: `confidence: number;   // 0..1`.
 */
function extractTsTypeAndRangeComment(src: string): {
  tsType: string | null;
  commentLower: number | null;
  commentUpper: number | null;
} {
  const re = /\bconfidence\s*:\s*(\w+)\s*;\s*\/\/\s*(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)/;
  const m = re.exec(src);
  if (!m) return { tsType: null, commentLower: null, commentUpper: null };
  return {
    tsType: m[1],
    commentLower: parseFloat(m[2]),
    commentUpper: parseFloat(m[3]),
  };
}

/**
 * Extract all `minConfidence: X` literals from the `TIER_SIGNAL_CONFIG`
 * const block. Scoped to the const body so unrelated `minConfidence` fields
 * elsewhere don't leak.
 */
function extractTierThresholds(src: string): number[] {
  const block = /export\s+const\s+TIER_SIGNAL_CONFIG\s*=\s*\{([\s\S]*?)^\}\s*as\s+const\s*;/m.exec(
    src,
  );
  if (!block) return [];
  const out: number[] = [];
  for (const m of block[1].matchAll(/minConfidence\s*:\s*(-?\d+(?:\.\d+)?)/g)) {
    out.push(parseFloat(m[1]));
  }
  return out;
}

/** Extract the MIN_AI_CONFIDENCE constant from the orchestrator. */
function extractOrchestratorGate(src: string): number | null {
  const m = /\bconst\s+MIN_AI_CONFIDENCE\s*=\s*(-?\d+(?:\.\d+)?)/.exec(src);
  return m ? parseFloat(m[1]) : null;
}

/**
 * Extract the comparison operator used in the orchestrator's rejection gate.
 * Expected: `validation.confidence < MIN_AI_CONFIDENCE` (strict less-than
 * — reject below threshold, accept at threshold).
 */
function extractGateComparison(src: string): string | null {
  const m = /validation\.confidence\s*(<=|<|>=|>)\s*MIN_AI_CONFIDENCE/.exec(src);
  return m ? m[1] : null;
}

describe('signals.confidence [0, 1] range-bound 5-surface sync', () => {
  const migration = readFileSync(MIGRATION_PATH, 'utf8');
  const signalTypes = readFileSync(SIGNAL_TYPES_PATH, 'utf8');
  const orchestrator = readFileSync(ORCHESTRATOR_PATH, 'utf8');

  const migRange = extractMigrationRange(migration);
  const tsShape = extractTsTypeAndRangeComment(signalTypes);
  const tierThresholds = extractTierThresholds(signalTypes);
  const gateValue = extractOrchestratorGate(orchestrator);
  const gateOp = extractGateComparison(orchestrator);

  it('migration CHECK declares confidence in [0, 1] with INCLUSIVE bounds', () => {
    expect(
      migRange.lower,
      'migration 014 confidence CHECK lower bound parse failed — column shape drifted',
    ).toBe(EXPECTED_LOWER);
    expect(
      migRange.upper,
      'migration 014 confidence CHECK upper bound parse failed — column shape drifted',
    ).toBe(EXPECTED_UPPER);
    expect(
      migRange.lowerInclusive,
      'migration CHECK uses strict `>` for lower — confidence=0 would be rejected at runtime',
    ).toBe(true);
    expect(
      migRange.upperInclusive,
      'migration CHECK uses strict `<` for upper — confidence=1 would be rejected at runtime',
    ).toBe(true);
  });

  it('TS Signal.confidence declared as `number` (not string/unknown)', () => {
    expect(
      tsShape.tsType,
      'signal-types.ts `confidence: X;` type annotation did not parse — interface shape drifted',
    ).toBe('number');
  });

  it('TS inline `// 0..1` range comment matches migration CHECK bounds', () => {
    expect(
      tsShape.commentLower,
      'signal-types.ts inline comment `// X..Y` parse failed',
    ).not.toBeNull();
    expect(tsShape.commentLower).toBe(migRange.lower);
    expect(tsShape.commentUpper).toBe(migRange.upper);
  });

  it('TIER_SIGNAL_CONFIG parser extracts at least 3 tier thresholds (sanity floor)', () => {
    expect(
      tierThresholds.length,
      'TIER_SIGNAL_CONFIG minConfidence parser found < 3 tiers — FREE/PRO/ENTERPRISE shape drifted',
    ).toBeGreaterThanOrEqual(3);
  });

  it('every TIER_SIGNAL_CONFIG threshold lies within migration CHECK bounds [0, 1]', () => {
    for (const t of tierThresholds) {
      expect(
        t,
        `tier threshold ${t} below migration lower bound ${migRange.lower} — dead policy gate (rejects all signals)`,
      ).toBeGreaterThanOrEqual(migRange.lower!);
      expect(
        t,
        `tier threshold ${t} above migration upper bound ${migRange.upper} — dead policy gate (accepts no signals, DB CHECK would fail first)`,
      ).toBeLessThanOrEqual(migRange.upper!);
    }
  });

  it("tier thresholds are monotonically non-increasing by access level (FREE ≥ PRO ≥ ENTERPRISE — stricter gate for lower tier)", () => {
    // FREE is strictest (highest confidence required), ENTERPRISE most permissive.
    // Capture order in source is FREE → PRO → ENTERPRISE.
    for (let i = 1; i < tierThresholds.length; i++) {
      expect(
        tierThresholds[i],
        `tier threshold order drifted — tier[${i}]=${tierThresholds[i]} must be ≤ tier[${i - 1}]=${tierThresholds[i - 1]} (strictness decreases with access level)`,
      ).toBeLessThanOrEqual(tierThresholds[i - 1]);
    }
  });

  it('orchestrator MIN_AI_CONFIDENCE lies within migration CHECK bounds', () => {
    expect(
      gateValue,
      'MIN_AI_CONFIDENCE constant did not parse — orchestrator shape drifted',
    ).not.toBeNull();
    expect(gateValue!).toBeGreaterThanOrEqual(migRange.lower!);
    expect(gateValue!).toBeLessThanOrEqual(migRange.upper!);
  });

  it('orchestrator MIN_AI_CONFIDENCE equals the FREE tier threshold (strictest gate — policy consistency)', () => {
    // The orchestrator AI-validation gate should match the strictest tier's
    // threshold so that a FREE-tier operator and the AI validator agree on
    // what counts as "high confidence enough to trade on".
    const free = tierThresholds[0]; // first in source order is FREE
    expect(
      gateValue,
      `MIN_AI_CONFIDENCE (${gateValue}) ≠ FREE tier minConfidence (${free}) — orchestrator AI gate drifted from the strictest policy tier`,
    ).toBe(free);
  });

  it("orchestrator gate uses strict `<` rejection (accept-at-threshold semantics)", () => {
    expect(
      gateOp,
      'orchestrator `validation.confidence OP MIN_AI_CONFIDENCE` comparison parse failed',
    ).not.toBeNull();
    expect(
      gateOp,
      `orchestrator rejection gate uses '${gateOp}' — expected strict '<' so that signals AT the threshold are accepted (not rejected)`,
    ).toBe('<');
  });

  it('range boundary values (0 and 1) are both within CHECK partition', () => {
    // Meta-assertion: the inclusive [0, 1] CHECK must admit 0 and 1 literally,
    // not just "approximately 0" / "approximately 1". Catches subtle bugs
    // like `CHECK (confidence > 0.001 AND confidence < 0.999)`.
    expect(EXPECTED_LOWER).toBeGreaterThanOrEqual(migRange.lower!);
    expect(EXPECTED_LOWER).toBeLessThanOrEqual(migRange.upper!);
    expect(EXPECTED_UPPER).toBeGreaterThanOrEqual(migRange.lower!);
    expect(EXPECTED_UPPER).toBeLessThanOrEqual(migRange.upper!);
  });

  it('numeric range has non-zero width (upper > lower — prevents collapsed-to-constant regression)', () => {
    expect(
      migRange.upper! - migRange.lower!,
      `confidence range width = ${migRange.upper! - migRange.lower!} — a zero-width range collapses the column to a constant`,
    ).toBeGreaterThan(0);
  });
});
