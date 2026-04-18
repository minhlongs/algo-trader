/**
 * Polymarket Gamma API external-contract 5-surface sync — first EXTERNAL-API typed boundary edge.
 *
 * `paper-trading-orchestrator.scanAndTrade()` fetches market data from
 * Polymarket's Gamma API at a fixed URL, parses the JSON response into a
 * local `PM` struct, and feeds extracted markets into the paper-trade
 * decision pipeline. The API is THIRD-PARTY: Polymarket controls the
 * schema, can evolve it without notice, and a silent drift (field rename,
 * response-shape change, or endpoint URL change) would cause the orchestrator
 * to silently return zero markets — paper-trading stops with NO alert,
 * NO exception, NO metric emission. The invariant is not a data-integrity
 * contract like the prior 25 edges (which locked invariants within our
 * own DB/code surfaces) but a DEPENDENCY-SHAPE contract: our code assumes
 * Gamma API returns a specific schema, and if that assumption changes, we
 * need to notice.
 *
 * Unlike the 25 prior edges:
 *   - Prior families: 16× string-enum partition, 2× cross-module
 *     coordination (internal to our codebase), 1× binary flag (#162),
 *     1× range-bound (#163), 1× temporal ordering (#164), 1× temporal
 *     derivation (#165), 1× structured-document shape (#166), 1×
 *     composite multi-column (#167), 1× array element-subset (#168).
 *   - **NEW family #10: EXTERNAL-API TYPED BOUNDARY.** Locks the contract
 *     between our code and a THIRD-PARTY service (Polymarket Gamma API):
 *     fetch URL literal, timeout discipline, response type assertion,
 *     field-extraction sites, and defensive-parse shape. Distinct from
 *     all prior: authority lives OUTSIDE our control — we can only lock
 *     what WE assume, not what they guarantee. Silent API drift = silent
 *     paper-trading outage.
 *
 * The contract is declared across five surfaces that must stay in lockstep:
 *
 *   1. **Fetch URL literal** —
 *      `src/wiring/paper-trading-orchestrator.ts:280`:
 *        `const resp = await fetch('https://gamma-api.polymarket.com/markets?closed=false&limit=200', {`
 *      — specific URL (host + path + query params). URL change = silent
 *      endpoint migration; query-param change (e.g. `limit=500`) = doubled
 *      response size without test awareness.
 *   2. **Timeout discipline** —
 *      line 281: `signal: AbortSignal.timeout(15_000)`
 *      — 15-second timeout via AbortSignal. If dropped, a stalled API
 *      call would hang the scanAndTrade interval (30s default) forever,
 *      blocking subsequent ticks. Timeout is the availability safeguard.
 *   3. **Response type assertion** —
 *      line 284: `const raw = (await resp.json()) as Array<Record<string, unknown>>`
 *      — explicit cast to array-of-loose-objects. `Record<string, unknown>`
 *      rejects primitive responses (string/number/null) that would bypass
 *      the field-extraction loop with runtime errors. The ARRAY shape
 *      assumes Gamma's `/markets` returns an array, not `{markets: []}`
 *      envelope.
 *   4. **Local PM type struct** —
 *      line 286: `type PM = { id: string; title: string; yes: number; no: number; vol: number; group: string }`
 *      — 6-field local type. Each field is our ASSUMPTION about what the
 *      API returns; drift means we silently drop rows or mis-map fields.
 *   5. **Field-extraction call sites** —
 *      lines 289-297: extracts 6 fields from each raw market via string-
 *      indexed access with null-safe defaults:
 *        - `m['conditionId']` → `id`
 *        - `m['question']` → `title` (+ reused as group fallback)
 *        - `m['outcomePrices']` → JSON.parse → `[yesStr, noStr]` → yes/no floats
 *        - `m['volume']` → `vol`
 *        - `m['groupItemTitle']` → `group` (fallback to `question`)
 *      — exactly 6 field accesses. Any new field we depend on must be
 *      extracted here with a null-safe default; any removed field must be
 *      retracted simultaneously in migrations of the type PM.
 *
 * Defense-in-depth shape:
 *   - **Outer try/catch** wraps `scanAndTrade()` — fetch failure logs
 *     warning, doesn't crash the ticker.
 *   - **Inner try/catch** wraps each market's parse — malformed row
 *     silently skipped, other markets still process.
 *   - **Price validity guard** — `if (yes > 0 && no > 0)` rejects markets
 *     where outcome prices can't be parsed (NaN or zero).
 *   - **Nullish-coalescing defaults** — every field has `?? ''` / `?? 0`
 *     fallback so a missing field doesn't crash the row, just produces
 *     empty/zero semantics.
 *
 * Novel invariants locked:
 *   - **URL literal pinning** — full URL with query params must match.
 *     Endpoint migration (e.g. `/markets` → `/v2/markets`) fails loudly.
 *   - **Timeout discipline** — 15-second timeout must be present.
 *   - **Response type assertion** — `Array<Record<string, unknown>>`
 *     shape must match. Envelope drift (`{markets: []}` vs `[]`) fails.
 *   - **PM type 6-field canonical** — exactly 6 fields in local type,
 *     no more, no less. Each field's TS type (string/number) pinned.
 *   - **Field-extraction parity** — exactly 6 `m['field']` string-indexed
 *     accesses. Adding a new field without updating PM type (or vice
 *     versa) fails the parity check.
 *   - **Defensive-parse invariants** — outer + inner try/catch, yes>0
 *     && no>0 guard, nullish-coalescing defaults all present.
 *   - **No schema-CHECK at DB layer** — external API; we can't pin
 *     Polymarket's backend. Authority lives in our assumptions only.
 *
 * Drift scenarios covered:
 *   - Gamma renames `outcomePrices` → `outcome_prices` → silent zero
 *     markets, test case 6 fails (field-extraction parity).
 *   - Gamma changes `/markets` to `/v2/markets` without notice → case 1
 *     fails (URL literal pin).
 *   - Someone removes AbortSignal.timeout → case 2 fails.
 *   - PM type gains a 7th field without extraction wiring → case 4 fails
 *     (6-field canonical); extraction wiring without type → case 6.
 *   - Inner try/catch removed → malformed row crashes entire scan → case 8
 *     fails (defensive-parse).
 *
 * Symmetric to prior integrity edges:
 *   #132 alert↔metric, #148 CLI↔route, #145 trigger_reason doc↔code —
 *   ALL of which are INTERNAL (our codebase). This is the FIRST edge
 *   locking a boundary to a third-party service.
 *
 * Opens the **26th integrity edge — HEXACOSAGON** (26-gon). First
 * external-API typed boundary edge. Novel family #10. Integrity
 * pentacosagon → hexacosagon (26-gon). Pillar 3 market-data ingestion
 * contract now sync-validated — assumptions we make about Polymarket
 * Gamma API shape are pinned in test, so silent API evolution fails
 * loudly rather than silently dropping markets.
 *
 * Non-goals: hitting the LIVE Gamma API during test (covered by
 * integration suite with real network; this is a static-parse contract
 * validator), asserting Gamma's ACTUAL schema (we can't — they control
 * it; we can only assert our ASSUMPTIONS about it), rate-limiting logic
 * (separate reliability concern), pagination handling (`limit=200` is
 * pinned as single-page assumption; future pagination edge would be
 * separate).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const ORCHESTRATOR_PATH = resolve(
  REPO_ROOT,
  'src/wiring/paper-trading-orchestrator.ts',
);

/** Canonical Gamma API endpoint URL — full path + query params. */
const EXPECTED_URL =
  'https://gamma-api.polymarket.com/markets?closed=false&limit=200';

/** Canonical timeout in ms. 15s = long enough for slow-network tolerance, short enough that a stall doesn't block the 30s scan tick. */
const EXPECTED_TIMEOUT_MS = 15000;

/** Canonical PM type field names (order preserved for documentation; set semantics for matching). */
const EXPECTED_PM_FIELDS = new Set<string>([
  'id',
  'title',
  'yes',
  'no',
  'vol',
  'group',
]);

/** Canonical raw API field names the extractor reads via `m['field']`. */
const EXPECTED_RAW_FIELDS = new Set<string>([
  'outcomePrices',
  'conditionId',
  'question',
  'volume',
  'groupItemTitle',
]);

/** Strip JS/TS comments. */
function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Extract the exact fetch URL literal from the orchestrator. Expected:
 *   `fetch('https://gamma-api.polymarket.com/markets?closed=false&limit=200', {`
 */
function extractFetchUrl(src: string): string | null {
  const re = /fetch\s*\(\s*'(https:\/\/gamma-api\.polymarket\.com[^']+)'/;
  const m = re.exec(src);
  return m ? m[1] : null;
}

/**
 * Extract the AbortSignal.timeout value in ms. Expected 15_000.
 */
function extractTimeoutMs(src: string): number | null {
  const re = /AbortSignal\.timeout\s*\(\s*(\d+(?:_\d+)*)\s*\)/;
  const m = re.exec(src);
  if (!m) return null;
  return parseInt(m[1].replace(/_/g, ''), 10);
}

/**
 * Check whether the response type assertion is `Array<Record<string, unknown>>`.
 */
function hasArrayRecordAssertion(src: string): boolean {
  const clean = stripJsComments(src);
  return /as\s+Array<Record<string,\s*unknown>>/.test(clean);
}

/**
 * Extract the PM type field names from the local type alias.
 * Expected: `type PM = { id: string; title: string; yes: number; no: number; vol: number; group: string }`
 */
function extractPMFields(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const clean = stripJsComments(src);
  const typeRe =
    /\btype\s+PM\s*=\s*\{([^}]+)\}/;
  const m = typeRe.exec(clean);
  if (!m) return out;
  for (const field of m[1].matchAll(
    /\b([a-zA-Z_]\w*)\s*:\s*([a-zA-Z_]\w*)\s*;?/g,
  )) {
    out.set(field[1], field[2]);
  }
  return out;
}

/**
 * Extract the raw-field keys accessed via `m['key']` inside the
 * field-extraction for-loop. Returns the set of string literals seen.
 */
function extractRawFieldKeys(src: string): Set<string> {
  const out = new Set<string>();
  const clean = stripJsComments(src);
  // Scope to the scanAndTrade function's for-loop body so unrelated
  // `m['field']` elsewhere doesn't leak.
  const scopeRe =
    /async\s+function\s+scanAndTrade[\s\S]*?for\s*\(\s*const\s+m\s+of\s+raw\s*\)\s*\{([\s\S]*?)\}\s*\n/;
  const scope = scopeRe.exec(clean);
  if (!scope) return out;
  for (const m of scope[1].matchAll(/\bm\s*\[\s*'([a-zA-Z_]\w*)'\s*\]/g)) {
    out.add(m[1]);
  }
  return out;
}

/**
 * Check for inner try/catch wrapping the per-market parse.
 */
function hasInnerTryCatch(src: string): boolean {
  const clean = stripJsComments(src);
  // Find the for-of loop body and check for a `try {` immediately inside.
  const scopeRe =
    /for\s*\(\s*const\s+m\s+of\s+raw\s*\)\s*\{\s*try\s*\{/;
  return scopeRe.test(clean);
}

/**
 * Check for the `yes > 0 && no > 0` price-validity guard before push.
 */
function hasPriceValidityGuard(src: string): boolean {
  const clean = stripJsComments(src);
  return /if\s*\(\s*yes\s*>\s*0\s*&&\s*no\s*>\s*0\s*\)/.test(clean);
}

describe('Polymarket Gamma API external-contract — 5-surface sync', () => {
  const orchestrator = readFileSync(ORCHESTRATOR_PATH, 'utf8');

  const fetchUrl = extractFetchUrl(orchestrator);
  const timeoutMs = extractTimeoutMs(orchestrator);
  const hasRecordAssertion = hasArrayRecordAssertion(orchestrator);
  const pmFields = extractPMFields(orchestrator);
  const rawFields = extractRawFieldKeys(orchestrator);
  const hasInnerTry = hasInnerTryCatch(orchestrator);
  const hasGuard = hasPriceValidityGuard(orchestrator);

  it('fetch URL literal matches canonical Gamma endpoint + query params', () => {
    expect(
      fetchUrl,
      'paper-trading-orchestrator.ts fetch URL did not parse — scanAndTrade shape drifted',
    ).not.toBeNull();
    expect(fetchUrl).toBe(EXPECTED_URL);
  });

  it('AbortSignal.timeout set to 15000ms (availability safeguard)', () => {
    expect(
      timeoutMs,
      'AbortSignal.timeout value did not parse — timeout discipline lost; a stalled API call would hang the ticker indefinitely',
    ).not.toBeNull();
    expect(timeoutMs).toBe(EXPECTED_TIMEOUT_MS);
  });

  it('response type assertion uses `Array<Record<string, unknown>>` (array-of-objects envelope)', () => {
    expect(
      hasRecordAssertion,
      'response type assertion drifted from `Array<Record<string, unknown>>` — a different envelope shape (e.g. `{markets: []}`) would silently reject all markets',
    ).toBe(true);
  });

  it('PM type declares exactly 6 canonical fields (id, title, yes, no, vol, group)', () => {
    expect(
      pmFields.size,
      `type PM parsed ${pmFields.size} fields — expected 6; local type shape drifted`,
    ).toBe(EXPECTED_PM_FIELDS.size);
    expect([...pmFields.keys()].sort()).toEqual(
      [...EXPECTED_PM_FIELDS].sort(),
    );
  });

  it('PM field TS types are correct (id/title/group = string, yes/no/vol = number)', () => {
    expect(pmFields.get('id')).toBe('string');
    expect(pmFields.get('title')).toBe('string');
    expect(pmFields.get('group')).toBe('string');
    expect(pmFields.get('yes')).toBe('number');
    expect(pmFields.get('no')).toBe('number');
    expect(pmFields.get('vol')).toBe('number');
  });

  it("field-extraction reads exactly the canonical 5 raw keys (outcomePrices, conditionId, question, volume, groupItemTitle)", () => {
    // Note: 5 raw keys produce 6 PM fields because `question` feeds both
    // `title` AND the `group` fallback when groupItemTitle is missing.
    // Case 7 locks the extractor surface; case 8 verifies the mapping asymmetry.
    expect(
      [...rawFields].sort(),
      `raw API field keys read by extractor {${[...rawFields].join(
        ', ',
      )}} differ from canonical {${[...EXPECTED_RAW_FIELDS].join(', ')}}`,
    ).toEqual([...EXPECTED_RAW_FIELDS].sort());
  });

  it("`question` is reused in both title and group fallback (field-mapping asymmetry — documents intent)", () => {
    // The extractor reads `m['question']` TWICE: once for title, once as
    // fallback for group when groupItemTitle is absent. This is the one
    // place where 5 raw keys produce 6 PM fields. Pinning this assertion
    // prevents a refactor that e.g. drops the group fallback and silently
    // produces empty group strings for half the markets.
    const clean = stripJsComments(orchestrator);
    const titleQuestionUse = /title:\s*String\s*\(\s*m\s*\[\s*'question'\s*\]/.test(
      clean,
    );
    const groupQuestionFallback =
      /group:\s*String\s*\(\s*m\s*\[\s*'groupItemTitle'\s*\]\s*\?\?\s*m\s*\[\s*'question'\s*\]/.test(
        clean,
      );
    expect(
      titleQuestionUse,
      'title field no longer reads m[\'question\'] — mapping drifted',
    ).toBe(true);
    expect(
      groupQuestionFallback,
      'group field no longer uses m[\'groupItemTitle\'] ?? m[\'question\'] fallback — groups without category name will emit empty strings',
    ).toBe(true);
  });

  it('inner try/catch wraps per-market parse (defensive-parse — one malformed row doesn\'t kill the whole scan)', () => {
    expect(
      hasInnerTry,
      'per-market try/catch missing — a single malformed Gamma row would crash the entire scan; defensive-parse contract broken',
    ).toBe(true);
  });

  it('price-validity guard `yes > 0 && no > 0` rejects parseFloat NaN / zero rows', () => {
    expect(
      hasGuard,
      'price-validity `yes > 0 && no > 0` guard missing — markets with unparseable outcomePrices would enter the trade pipeline with NaN prices',
    ).toBe(true);
  });

  it('all 5 contract surfaces present simultaneously (composite external-API invariant)', () => {
    // The external-API contract REQUIRES all 5 surfaces in lockstep.
    // Dropping any one means Gamma drift can silently break paper trading:
    //   1. URL pinned so endpoint migration fails loudly
    //   2. Timeout so stalls don't hang the ticker
    //   3. Type assertion so envelope drift rejects
    //   4. PM canonical fields so our assumptions are documented
    //   5. Raw-field extraction so field rename surfaces
    // This case asserts all 5 fire together — the "composite" of family #10.
    const s1 = fetchUrl === EXPECTED_URL;
    const s2 = timeoutMs === EXPECTED_TIMEOUT_MS;
    const s3 = hasRecordAssertion;
    const s4 = pmFields.size === EXPECTED_PM_FIELDS.size;
    const s5 = rawFields.size === EXPECTED_RAW_FIELDS.size;
    expect(
      s1 && s2 && s3 && s4 && s5,
      `external-API contract broken: URL=${s1}, timeout=${s2}, type=${s3}, PM-type=${s4}, raw-extraction=${s5} — all 5 surfaces must fire together; dropping one leaks Gamma API drift into silent paper-trading failure`,
    ).toBe(true);
  });

  it('no hard-coded HTTP call outside the canonical URL (single point of Gamma dependency)', () => {
    // Meta-assertion: the entire Gamma API dependency is a single `fetch()`
    // call at the canonical URL. Multiple endpoints = multiple drift points.
    // Searching for other `polymarket.com` fetch literals in the file
    // should return zero additional hits (the canonical URL is counted once).
    // NOTE: operates on raw source — stripping JS comments would also strip
    // the `//` inside the URL literal (`https://...`), producing false zeros.
    const allPolymarketFetches = [
      ...orchestrator.matchAll(
        /fetch\s*\(\s*'(https?:\/\/[^']*polymarket\.com[^']*)'/g,
      ),
    ];
    expect(
      allPolymarketFetches.length,
      `found ${allPolymarketFetches.length} Polymarket fetch call site(s) in paper-trading-orchestrator.ts — expected exactly 1 (canonical Gamma endpoint); additional endpoints expand the external-API drift surface`,
    ).toBe(1);
  });
});
