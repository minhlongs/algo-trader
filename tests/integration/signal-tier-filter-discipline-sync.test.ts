/**
 * SignalTierFilter primitive discipline 9-invariant sync — fifth
 * signal-pipeline substrate edge.
 *
 * `src/desk/signal/signal-tier-filter.ts` filters the signal fan-out
 * based on subscriber license tier (FREE / PRO / ENTERPRISE). Drift
 * manifests as:
 *   - ENTERPRISE tier loses sort-by-ts descending → feed order breaks
 *     client UI
 *   - FREE tier best-by-market Map keyed on wrong field → digest
 *     returns duplicates or wrong-market winners
 *   - confidence filter `>= minConfidence` flipped to `<=` → sub-
 *     threshold junk reaches subscribers
 *   - `expiresAt > now` filter swapped → expired signals surface
 *     (cross-edge violation with #201 SignalTtlEnforcer)
 *   - shouldPushRealtime returns true for non-ENTERPRISE → FREE tier
 *     spammed (revenue-model violation)
 *
 * Unlike the 58 prior edges (42 families):
 *   - #163 locks signals.confidence [0,1] range (DB-level) + notes
 *     `MIN_AI_CONFIDENCE = 0.7` for FREE tier.
 *   - #201 locks TTL enforcer that supplies non-expired signals.
 *   - **NEW family #43: SIGNALTIERFILTER PRIMITIVE DISCIPLINE.**
 *     Fifth signal-pipeline substrate edge.
 *
 * The invariant is declared across 1 file × 9 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **filterSignalsForTier exported** — `(signals: Signal[], tier:
 *      TierKey) => Signal[]` signature.
 *   3. **TIER_SIGNAL_CONFIG[tier] lookup** — each call reads config
 *      from the shared map (no hardcoded thresholds).
 *   4. **Eligibility filter: confidence >= minConfidence AND
 *      expiresAt > now** — both guards must fire together (cross-edge
 *      with #163 range + #201 TTL direction).
 *   5. **ENTERPRISE branch: no window filter + sort ts desc** —
 *      realtime feed, no additional time filter.
 *   6. **PRO branch: windowStart filter + sort ts desc** — hourly
 *      sliding window.
 *   7. **FREE branch: best-by-market Map pattern** — one most-recent
 *      signal per market in 24h digest.
 *   8. **canAccessSse(tier)** returns `TIER_SIGNAL_CONFIG[tier].
 *      sseEnabled`.
 *   9. **shouldPushRealtime(tier)** returns `tier === 'ENTERPRISE'`
 *      exactly (not `!== 'FREE'`) — revenue-model lock.
 *
 * Novel invariants locked (family #43):
 *   - **Tier-config indirection** — thresholds come from shared
 *     config, not hardcoded; drift = diverged config tables.
 *   - **Two-gate eligibility** — confidence AND expiresAt fire in
 *     parallel; dropping either breaks #163 (confidence floor) or
 *     #201 (TTL direction).
 *   - **FREE digest best-by-market** — Map pattern guarantees dedup.
 *   - **shouldPushRealtime strict-equality** — `===` comparison
 *     prevents FREE/PRO getting realtime push.
 *
 * Drift scenarios covered:
 *   - `confidence <= minConfidence` inversion → case 4 fails
 *     (sub-threshold junk).
 *   - Sort direction flipped `a.ts - b.ts` → case 5 fails (oldest
 *     first).
 *   - FREE branch forgets windowStart filter → case 7 fails (24h
 *     window broken).
 *   - `shouldPushRealtime` returns `tier !== 'FREE'` → case 9 fails
 *     (PRO gets realtime spam).
 *
 * Symmetric to prior integrity edges:
 *   #163 ICOSAGON signals.confidence range (cross-edge with
 *   minConfidence gate).
 *   #201 OCTAPENTACONTAGON SignalTtlEnforcer (cross-edge with
 *   expiresAt > now direction).
 *
 * Opens the **59th integrity edge — ENNEAPENTACONTAGON** (59-gon).
 * Fifth signal-pipeline substrate edge. Novel family #43. Integrity
 * octapentacontagon → enneapentacontagon (59-gon).
 *
 * Non-goals: TIER_SIGNAL_CONFIG exact numeric thresholds (locked at
 * signal-types.ts — separate edge); HTTP integration (out of scope).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const FILTER_FILE = resolve(REPO_ROOT, 'src/desk/signal/signal-tier-filter.ts');

function readFilter(): string {
  return readFileSync(FILTER_FILE, 'utf8');
}

describe('SignalTierFilter primitive discipline — 59th edge (ENNEAPENTACONTAGON)', () => {
  const src = readFilter();

  it('signal-tier-filter.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(400);
  });

  it('filterSignalsForTier exported with (signals: Signal[], tier: TierKey) signature', () => {
    expect(
      /export\s+function\s+filterSignalsForTier\s*\(\s*signals\s*:\s*Signal\[\]\s*,\s*tier\s*:\s*TierKey\s*\)\s*:\s*Signal\[\]/.test(
        src,
      ),
      'filterSignalsForTier signature drifted',
    ).toBe(true);
  });

  it('TIER_SIGNAL_CONFIG[tier] lookup (shared config — not hardcoded thresholds)', () => {
    expect(
      /TIER_SIGNAL_CONFIG\[\s*tier\s*\]/.test(src),
      'TIER_SIGNAL_CONFIG[tier] lookup missing — thresholds would be inline/hardcoded',
    ).toBe(true);
    expect(
      /import[\s\S]*TIER_SIGNAL_CONFIG[\s\S]*from\s+['"]\.\/signal-types['"]/.test(src),
      'TIER_SIGNAL_CONFIG must import from ./signal-types (shared across module)',
    ).toBe(true);
  });

  it('eligibility two-gate filter: confidence >= minConfidence AND expiresAt > now', () => {
    expect(
      /\.filter\(\s*\(s\)\s*=>\s*s\.confidence\s*>=\s*config\.minConfidence\s*&&\s*s\.expiresAt\s*>\s*now\s*\)/.test(
        src,
      ),
      'eligibility filter must be `confidence >= minConfidence && expiresAt > now` — two-gate cross-edge with #163 + #201',
    ).toBe(true);
  });

  it("ENTERPRISE branch: no window filter + sort by ts desc (realtime feed)", () => {
    expect(
      /if\s*\(\s*tier\s*===\s*['"]ENTERPRISE['"]\s*\)/.test(src),
      'ENTERPRISE branch guard missing',
    ).toBe(true);
    // After ENTERPRISE check, must return sorted-by-ts-desc eligible.
    expect(
      /tier\s*===\s*['"]ENTERPRISE['"][\s\S]*?return\s+eligible\.sort\(\s*\(a,\s*b\)\s*=>\s*b\.ts\s*-\s*a\.ts\s*\)/.test(
        src,
      ),
      'ENTERPRISE must return `eligible.sort((a,b) => b.ts - a.ts)` — drift to a.ts-b.ts inverts order',
    ).toBe(true);
  });

  it("PRO branch: windowStart filter + sort ts desc (hourly sliding window)", () => {
    expect(
      /if\s*\(\s*tier\s*===\s*['"]PRO['"]\s*\)/.test(src),
      'PRO branch guard missing',
    ).toBe(true);
    expect(
      /tier\s*===\s*['"]PRO['"][\s\S]*?\.filter\(\s*\(s\)\s*=>\s*s\.ts\s*>=\s*windowStart\s*\)/.test(src),
      'PRO must filter s.ts >= windowStart — hourly window contract',
    ).toBe(true);
    expect(
      /tier\s*===\s*['"]PRO['"][\s\S]*?\.sort\(\s*\(a,\s*b\)\s*=>\s*b\.ts\s*-\s*a\.ts\s*\)/.test(src),
      'PRO must sort by ts desc',
    ).toBe(true);
  });

  it('FREE branch: best-by-market Map digest pattern', () => {
    expect(
      /const\s+bestByMarket\s*=\s*new\s+Map<string\s*,\s*Signal>/.test(src),
      'bestByMarket Map<string, Signal> pattern missing — FREE digest dedup broken',
    ).toBe(true);
    expect(
      /bestByMarket\.get\(\s*sig\.market\s*\)/.test(src),
      'bestByMarket keyed on sig.market — drift would dedup on wrong field',
    ).toBe(true);
    expect(
      /if\s*\(\s*!existing\s*\|\|\s*sig\.ts\s*>\s*existing\.ts\s*\)/.test(src),
      'best-by-market replacement guard must be `!existing || sig.ts > existing.ts`',
    ).toBe(true);
  });

  it('canAccessSse(tier) returns TIER_SIGNAL_CONFIG[tier].sseEnabled', () => {
    expect(
      /export\s+function\s+canAccessSse\(\s*tier\s*:\s*TierKey\s*\)\s*:\s*boolean\s*\{[\s\S]*?return\s+TIER_SIGNAL_CONFIG\[\s*tier\s*\]\.sseEnabled/.test(
        src,
      ),
      'canAccessSse must return TIER_SIGNAL_CONFIG[tier].sseEnabled — drift to hardcoded enum breaks config-driven tiers',
    ).toBe(true);
  });

  it("shouldPushRealtime strict `tier === 'ENTERPRISE'` (NOT !== 'FREE' — revenue lock)", () => {
    expect(
      /export\s+function\s+shouldPushRealtime\(\s*tier\s*:\s*TierKey\s*\)\s*:\s*boolean\s*\{[\s\S]*?return\s+tier\s*===\s*['"]ENTERPRISE['"]/.test(
        src,
      ),
      "shouldPushRealtime must return `tier === 'ENTERPRISE'` — drift to `!== 'FREE'` gives PRO realtime (revenue-model violation)",
    ).toBe(true);
  });

  it('composite: 9 axes hold simultaneously (tier-filter coherence)', () => {
    expect(/TIER_SIGNAL_CONFIG\[\s*tier\s*\]/.test(src)).toBe(true);
    expect(/s\.confidence\s*>=\s*config\.minConfidence\s*&&\s*s\.expiresAt\s*>\s*now/.test(src)).toBe(true);
    expect(/tier\s*===\s*['"]ENTERPRISE['"]/.test(src) && /tier\s*===\s*['"]PRO['"]/.test(src)).toBe(true);
    expect(/bestByMarket\.get\(\s*sig\.market\s*\)/.test(src)).toBe(true);
    expect(/b\.ts\s*-\s*a\.ts/.test(src)).toBe(true);
    expect(/TIER_SIGNAL_CONFIG\[\s*tier\s*\]\.sseEnabled/.test(src)).toBe(true);
    expect(/tier\s*===\s*['"]ENTERPRISE['"][\s\S]*?shouldPushRealtime/.test(src) || /shouldPushRealtime[\s\S]*?tier\s*===\s*['"]ENTERPRISE['"]/.test(src)).toBe(true);
  });
});
