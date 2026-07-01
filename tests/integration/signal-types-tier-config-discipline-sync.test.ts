/**
 * Signal-types TIER_SIGNAL_CONFIG + interface-triple discipline 10-invariant sync.
 * HEXACONTAGON MILESTONE (60-gon = 3× icosagon).
 *
 * `src/desk/signal/signal-types.ts` is the canonical shape declaration
 * consumed by every signal-pipeline module:
 *   - #163 ICOSAGON: signals.confidence [0,1] + FREE tier floor 0.7
 *   - #165 DOICOSAGON: signals.expires_at = ts + ttl*1000
 *   - #198 PENTAPENTACONTAGON: SignalPublisher RawSignalInput
 *   - #199 HEXAPENTACONTAGON: SignalDedupGuard buildId
 *   - #202 ENNEAPENTACONTAGON: SignalTierFilter TIER_SIGNAL_CONFIG[tier]
 *
 * Drift manifests as:
 *   - Signal interface loses `expiresAt` → PR #165 DB-level CHECK
 *     loses runtime half of the bijection
 *   - TIER_SIGNAL_CONFIG loses `as const` → TypeScript widens types,
 *     TierKey becomes `string` (type-safety regression)
 *   - FREE minConfidence drops below 0.7 → violates PR #163 tier-floor
 *   - ENTERPRISE sseEnabled flipped to false → PR #202 canAccessSse
 *     would return false for ENTERPRISE (revenue regression)
 *   - minIntervalMs units drift (hour vs day) → tier windows corrupt
 *
 * Unlike the 59 prior edges (43 families):
 *   - Dozens of prior edges CONSUME these types but none locks the
 *     canonical declaration itself.
 *   - **NEW family #44: SIGNAL-TYPES TIER CONFIG + INTERFACE TRIPLE
 *     DISCIPLINE.** Sixth signal-pipeline substrate edge.
 *     HEXACONTAGON MILESTONE (60-gon = 3× icosagon).
 *
 * The invariant is declared across 1 file × 10 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **Signal interface 9 fields** — id, ts, market, side, size,
 *      confidence, strategy, ttl, expiresAt.
 *   3. **Signal.side union `'BUY' | 'SELL'`** — closed enum.
 *   4. **SignalSubscription 7 fields** — id, subscriberId, chatId?,
 *      tier, active, createdAt, updatedAt.
 *   5. **SignalSubscription.tier union** — `'FREE' | 'PRO' |
 *      'ENTERPRISE'` (cross-edge with TIER_SIGNAL_CONFIG keys).
 *   6. **TIER_SIGNAL_CONFIG declared with `as const`** — TypeScript
 *      literal-type narrowing; drift = TierKey widens to string.
 *   7. **FREE tier values** — sseEnabled=false, minIntervalMs=24h
 *      (86_400_000), minConfidence=0.7 (cross-edge with PR #163 FREE
 *      tier floor).
 *   8. **PRO tier values** — sseEnabled=false, minIntervalMs=1h
 *      (3_600_000), minConfidence=0.6.
 *   9. **ENTERPRISE tier values** — sseEnabled=true (realtime SSE),
 *      minIntervalMs=0, minConfidence=0.5.
 *  10. **TierKey type** — `keyof typeof TIER_SIGNAL_CONFIG`.
 *
 * Novel invariants locked (family #44 — HEXACONTAGON milestone):
 *   - **Canonical declaration pin** — 3 downstream primitives (#198
 *     publisher, #199 dedup, #202 filter) + 2 DB edges (#163, #165)
 *     all depend on this file's literals.
 *   - **as const narrowing** — preserves TypeScript literal types
 *     across consumer modules.
 *   - **Tier-values tuple** — (sseEnabled, minIntervalMs, minConfidence)
 *     per tier. Drift in any column corrupts product-tier semantics.
 *   - **Cross-edge bijection** — FREE minConfidence=0.7 must match
 *     PR #163 signals.confidence range + MIN_AI_CONFIDENCE constant.
 *
 * Drift scenarios covered:
 *   - Adding a fourth tier 'ADMIN' → case 6 fails if `as const`
 *     dropped (TierKey widens).
 *   - FREE minConfidence reduced to 0.5 "to increase signup" → case 7
 *     fails (revenue-tier violation + PR #163 cross-edge).
 *   - ENTERPRISE sseEnabled accidentally set to false → case 9 fails
 *     (ENTERPRISE loses realtime push).
 *   - TIER_SIGNAL_CONFIG key renamed 'FREE' → 'STARTER' → case 5
 *     fails (downstream type union broken).
 *
 * Symmetric to prior integrity edges:
 *   #163 ICOSAGON signals.confidence [0,1] range (DB-level).
 *   #165 DOICOSAGON signals.expires_at temporal derivation (DB-level).
 *   #198 PENTAPENTACONTAGON SignalPublisher fan-out (consumer).
 *   #199 HEXAPENTACONTAGON SignalDedupGuard (consumer).
 *   #202 ENNEAPENTACONTAGON SignalTierFilter (consumer of TIER_SIGNAL_CONFIG).
 *
 * Opens the **60th integrity edge — HEXACONTAGON** (60-gon = 3×
 * icosagon MILESTONE). Sixth signal-pipeline substrate edge. Novel
 * family #44. Integrity enneapentacontagon → HEXACONTAGON.
 *
 * Non-goals: asserting field comments verbatim (docstring volatility);
 * TypeScript compile-time integration test (out of scope).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const TYPES_FILE = resolve(REPO_ROOT, 'src/desk/signal/signal-types.ts');

const SIGNAL_FIELDS = [
  'id',
  'ts',
  'market',
  'side',
  'size',
  'confidence',
  'strategy',
  'ttl',
  'expiresAt',
];

const SUBSCRIPTION_FIELDS = [
  'id',
  'subscriberId',
  'chatId',
  'tier',
  'active',
  'createdAt',
  'updatedAt',
];

function readTypes(): string {
  return readFileSync(TYPES_FILE, 'utf8');
}

describe('Signal-types TIER_SIGNAL_CONFIG + interface triple discipline — 60th edge (HEXACONTAGON milestone)', () => {
  const src = readTypes();

  it('signal-types.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(400);
  });

  it('Signal interface declares all 9 required fields', () => {
    // Extract the Signal interface body.
    const m = /export\s+interface\s+Signal\s*\{([\s\S]*?)\n\}/.exec(src);
    expect(m, 'Signal interface body not found').not.toBeNull();
    const body = m ? m[1] : '';
    for (const f of SIGNAL_FIELDS) {
      const re = new RegExp(`\\b${f}\\s*:\\s*\\S`);
      expect(re.test(body), `Signal.${f} field missing`).toBe(true);
    }
  });

  it("Signal.side union = 'BUY' | 'SELL' (closed enum)", () => {
    expect(
      /side\s*:\s*['"]BUY['"]\s*\|\s*['"]SELL['"]/.test(src),
      "Signal.side must be `'BUY' | 'SELL'` — opening to `string` breaks consumer dedup (PR #199 buildId) + DB enum (PR #159)",
    ).toBe(true);
  });

  it('SignalSubscription interface declares all 7 required fields', () => {
    const m = /export\s+interface\s+SignalSubscription\s*\{([\s\S]*?)\n\}/.exec(src);
    expect(m, 'SignalSubscription interface body not found').not.toBeNull();
    const body = m ? m[1] : '';
    for (const f of SUBSCRIPTION_FIELDS) {
      const re = new RegExp(`\\b${f}\\??\\s*:\\s*\\S`);
      expect(re.test(body), `SignalSubscription.${f} field missing`).toBe(true);
    }
  });

  it("SignalSubscription.tier union = 'FREE' | 'PRO' | 'ENTERPRISE' (cross-edge with TIER_SIGNAL_CONFIG keys)", () => {
    expect(
      /tier\s*:\s*['"]FREE['"]\s*\|\s*['"]PRO['"]\s*\|\s*['"]ENTERPRISE['"]/.test(src),
      "SignalSubscription.tier must be 'FREE' | 'PRO' | 'ENTERPRISE' — union must bijection TIER_SIGNAL_CONFIG keys",
    ).toBe(true);
  });

  it("TIER_SIGNAL_CONFIG declared with `as const` (literal-type narrowing)", () => {
    expect(
      /TIER_SIGNAL_CONFIG\s*=\s*\{[\s\S]*?\}\s*as\s+const/.test(src),
      'TIER_SIGNAL_CONFIG must be `as const` — drop widens TierKey to `string`',
    ).toBe(true);
  });

  it('FREE tier: sseEnabled=false + minIntervalMs=24h + minConfidence=0.7 (cross-edge PR #163 floor)', () => {
    const freeMatch = /FREE\s*:\s*\{([\s\S]*?)\}/.exec(src);
    expect(freeMatch, 'FREE tier block missing').not.toBeNull();
    const body = freeMatch ? freeMatch[1] : '';
    expect(/sseEnabled\s*:\s*false/.test(body), 'FREE.sseEnabled must be false').toBe(true);
    expect(
      /minIntervalMs\s*:\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(body) ||
        /minIntervalMs\s*:\s*86_?400_?000/.test(body),
      'FREE.minIntervalMs must equal 24h (86_400_000 ms) — drift breaks daily-digest window',
    ).toBe(true);
    expect(
      /minConfidence\s*:\s*0\.7\b/.test(body),
      'FREE.minConfidence must equal 0.7 — cross-edge with PR #163 MIN_AI_CONFIDENCE; drift lowers revenue-tier floor',
    ).toBe(true);
  });

  it('PRO tier: sseEnabled=false + minIntervalMs=1h + minConfidence=0.6', () => {
    const proMatch = /PRO\s*:\s*\{([\s\S]*?)\}/.exec(src);
    expect(proMatch, 'PRO tier block missing').not.toBeNull();
    const body = proMatch ? proMatch[1] : '';
    expect(/sseEnabled\s*:\s*false/.test(body), 'PRO.sseEnabled must be false').toBe(true);
    expect(
      /minIntervalMs\s*:\s*60\s*\*\s*60\s*\*\s*1000/.test(body) ||
        /minIntervalMs\s*:\s*3_?600_?000/.test(body),
      'PRO.minIntervalMs must equal 1h (3_600_000 ms)',
    ).toBe(true);
    expect(
      /minConfidence\s*:\s*0\.6\b/.test(body),
      'PRO.minConfidence must equal 0.6',
    ).toBe(true);
  });

  it('ENTERPRISE tier: sseEnabled=true + minIntervalMs=0 + minConfidence=0.5', () => {
    const entMatch = /ENTERPRISE\s*:\s*\{([\s\S]*?)\}/.exec(src);
    expect(entMatch, 'ENTERPRISE tier block missing').not.toBeNull();
    const body = entMatch ? entMatch[1] : '';
    expect(
      /sseEnabled\s*:\s*true/.test(body),
      'ENTERPRISE.sseEnabled must be true — realtime SSE is the ENTERPRISE feature',
    ).toBe(true);
    expect(
      /minIntervalMs\s*:\s*0\b/.test(body),
      'ENTERPRISE.minIntervalMs must be 0 — realtime, no window',
    ).toBe(true);
    expect(
      /minConfidence\s*:\s*0\.5\b/.test(body),
      'ENTERPRISE.minConfidence must equal 0.5',
    ).toBe(true);
  });

  it('TierKey = keyof typeof TIER_SIGNAL_CONFIG', () => {
    expect(
      /export\s+type\s+TierKey\s*=\s*keyof\s+typeof\s+TIER_SIGNAL_CONFIG/.test(src),
      'TierKey must be `keyof typeof TIER_SIGNAL_CONFIG` — downstream type unions depend on narrowing',
    ).toBe(true);
  });

  it('composite: 10 axes hold simultaneously (signal-types canonical coherence)', () => {
    for (const f of SIGNAL_FIELDS) {
      expect(new RegExp(`\\b${f}\\s*:\\s*\\S`).test(src), `missing Signal.${f}`).toBe(true);
    }
    expect(/side\s*:\s*['"]BUY['"]\s*\|\s*['"]SELL['"]/.test(src)).toBe(true);
    expect(/TIER_SIGNAL_CONFIG\s*=\s*\{[\s\S]*?\}\s*as\s+const/.test(src)).toBe(true);
    expect(/minConfidence\s*:\s*0\.7\b/.test(src)).toBe(true);
    expect(/minConfidence\s*:\s*0\.6\b/.test(src)).toBe(true);
    expect(/minConfidence\s*:\s*0\.5\b/.test(src)).toBe(true);
    expect(/sseEnabled\s*:\s*true/.test(src)).toBe(true);
    expect(/export\s+type\s+TierKey\s*=\s*keyof\s+typeof\s+TIER_SIGNAL_CONFIG/.test(src)).toBe(true);
  });
});
