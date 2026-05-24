/**
 * SignalDedupGuard primitive discipline 9-invariant sync — second
 * signal-pipeline substrate edge (complementary to #198 fan-out).
 *
 * `src/signal/signal-dedup-guard.ts` implements the in-memory dedup
 * primitive the SignalPublisher (#198) calls BEFORE saving to DB. Drift
 * manifests as:
 *   - buildId raw-string order changes → PR #198 buildId callsite
 *     drifts invisibly (cross-edge coupling)
 *   - SHA-256 algo swapped to md5/sha1 → collision surface
 *   - isDuplicate check-then-set reversed → race-window where same
 *     signal registered twice appears unique on second call
 *   - cleanupInterval default shortened to 100ms → CPU burn
 *   - Singleton export removed → every import site creates new guard
 *     → dedup surface shattered across modules
 *
 * Unlike the 55 prior edges (39 families):
 *   - #198 locks SignalPublisher fan-out that USES this primitive.
 *   - **NEW family #40: SIGNALDEDUPGUARD PRIMITIVE DISCIPLINE.**
 *     Second signal-pipeline substrate. 40 families MILESTONE.
 *
 * The invariant is declared across 1 file × 9 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **crypto.createHash imported** — baseline.
 *   3. **SignalDedupGuard class exported** with private `seen: Map`
 *      + optional `cleanupIntervalId`.
 *   4. **buildId static method** — `(strategy, market, side, ts,
 *      ttlSec)` positional args, exact raw-string order
 *      `${strategy}|${market}|${side}|${bucketTs}`, SHA-256
 *      `.slice(0, 32)` truncation.
 *   5. **buildId bucketing math** — `bucketTs = Math.floor(ts /
 *      bucketMs) * bucketMs` where `bucketMs = ttlSec * 1000`.
 *   6. **isDuplicate check-then-set ordering** — read from map BEFORE
 *      set; return true only if entry + not expired.
 *   7. **cleanupInterval default = 60_000ms** (1 minute) — reasonable
 *      bound; setInterval stored in cleanupIntervalId for destroy().
 *   8. **evictExpired + destroy lifecycle** — evictExpired iterates
 *      and deletes expired; destroy clears interval.
 *   9. **Singleton export** — `export const signalDedupGuard = new
 *      SignalDedupGuard();` (shared across all callers).
 *
 * Novel invariants locked (family #40):
 *   - **buildId raw-string bijection** — cross-edge with #198 callsite
 *     arg order; both must agree on positional semantics.
 *   - **SHA-256 + 32-char slice** — hash collision resistance +
 *     bounded-length key.
 *   - **Check-then-set race protection** — ordering guarantees first-
 *     write wins within the same isDuplicate call.
 *   - **Singleton export** — dedup state cannot be shattered.
 *
 * Drift scenarios covered:
 *   - buildId raw changed to `${side}|${strategy}...` → case 4 fails
 *     (breaks bijection with #198).
 *   - Hash dropped from sha256 to md5 → case 4 fails.
 *   - Bucketing math simplified to `ts` (no bucket) → case 5 fails
 *     (dedup window collapses).
 *   - isDuplicate reordered set-before-read → case 6 fails.
 *   - Singleton removed → case 9 fails (every import creates guard).
 *
 * Symmetric to prior integrity edges:
 *   #168 PENTACOSAGON qwen_signals_loop_runs trigger_reasons (consumer
 *   of deduped signals).
 *   #198 PENTAPENTACONTAGON SignalPublisher fan-out (upstream caller).
 *
 * Opens the **56th integrity edge — HEXAPENTACONTAGON** (56-gon).
 * Second signal-pipeline substrate edge. Novel family #40 (milestone).
 * Integrity pentapentacontagon → hexapentacontagon (56-gon).
 *
 * Non-goals: race-condition stress test (runtime concern); Redis-backed
 * dedup migration (YAGNI); exact SHA-256 output values (algorithm
 * verification, not contract).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const DEDUP_FILE = resolve(REPO_ROOT, 'src/signal/signal-dedup-guard.ts');

const EXPECTED_CLEANUP_INTERVAL_MS = 60_000;

function readDedup(): string {
  return readFileSync(DEDUP_FILE, 'utf8');
}

describe('SignalDedupGuard primitive discipline — 56th edge (HEXAPENTACONTAGON)', () => {
  const src = readDedup();

  it('signal-dedup-guard.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(400);
  });

  it('crypto.createHash imported from node:crypto', () => {
    expect(
      /import\s*\{\s*createHash\s*\}\s+from\s+['"]crypto['"]/.test(src),
      'createHash import missing',
    ).toBe(true);
  });

  it('SignalDedupGuard class exported with private `seen` Map + cleanupIntervalId', () => {
    expect(
      /export\s+class\s+SignalDedupGuard\s*\{/.test(src),
      'SignalDedupGuard class not exported',
    ).toBe(true);
    expect(
      /private\s+seen\s*:\s*Map<string\s*,\s*ExpiryEntry>/.test(src),
      'private seen: Map<string, ExpiryEntry> field missing',
    ).toBe(true);
    expect(
      /cleanupIntervalId\s*:\s*ReturnType<typeof\s+setInterval>\s*\|\s*null/.test(src),
      'cleanupIntervalId field typing drifted',
    ).toBe(true);
  });

  it('buildId static: 5-param positional + raw-string order + SHA-256 + .slice(0,32)', () => {
    expect(
      /static\s+buildId\(\s*strategy\s*:\s*string\s*,\s*market\s*:\s*string\s*,\s*side\s*:\s*string\s*,\s*ts\s*:\s*number\s*,\s*ttlSec\s*:\s*number\s*\)/.test(
        src,
      ),
      'buildId signature drifted — must be (strategy, market, side, ts, ttlSec) in this order',
    ).toBe(true);
    expect(
      /\$\{strategy\}\|\$\{market\}\|\$\{side\}\|\$\{bucketTs\}/.test(src),
      'buildId raw string must be `${strategy}|${market}|${side}|${bucketTs}` — reorder breaks bijection with #198 callsite',
    ).toBe(true);
    expect(
      /createHash\(\s*['"]sha256['"]/.test(src),
      'createHash must use "sha256" — drop to md5/sha1 exposes collision surface',
    ).toBe(true);
    expect(
      /\.slice\(\s*0\s*,\s*32\s*\)/.test(src),
      '.slice(0, 32) missing — bounded-length key drifted',
    ).toBe(true);
  });

  it('buildId bucketing math: bucketMs = ttlSec*1000, bucketTs = floor(ts/bucketMs)*bucketMs', () => {
    expect(
      /const\s+bucketMs\s*=\s*ttlSec\s*\*\s*1000/.test(src),
      'bucketMs = ttlSec * 1000 math missing',
    ).toBe(true);
    expect(
      /const\s+bucketTs\s*=\s*Math\.floor\(\s*ts\s*\/\s*bucketMs\s*\)\s*\*\s*bucketMs/.test(src),
      'bucketTs = Math.floor(ts / bucketMs) * bucketMs math drifted — dedup window collapses if simplified',
    ).toBe(true);
  });

  it('isDuplicate check-then-set ordering (race protection)', () => {
    // Scope search to the span between `isDuplicate(` and the next sibling method `evictExpired(`.
    const startIdx = src.indexOf('isDuplicate(');
    const endIdx = src.indexOf('evictExpired(', startIdx);
    expect(startIdx, 'isDuplicate method missing').toBeGreaterThan(-1);
    expect(endIdx, 'evictExpired sibling method missing').toBeGreaterThan(startIdx);
    const body = src.slice(startIdx, endIdx);
    const getIdx = body.indexOf('this.seen.get(');
    const setIdx = body.indexOf('this.seen.set(');
    expect(getIdx, 'this.seen.get(...) missing').toBeGreaterThan(-1);
    expect(setIdx, 'this.seen.set(...) missing').toBeGreaterThan(-1);
    expect(
      getIdx < setIdx,
      'isDuplicate must read before write — reversed order breaks race protection',
    ).toBe(true);
    expect(
      /entry\.expiresAt\s*>\s*now/.test(body),
      'isDuplicate must check `entry.expiresAt > now` for live duplicate detection',
    ).toBe(true);
  });

  it(`cleanupInterval default = ${EXPECTED_CLEANUP_INTERVAL_MS}ms (bounded CPU burn)`, () => {
    const re = new RegExp(`cleanupIntervalMs\\s*=\\s*${EXPECTED_CLEANUP_INTERVAL_MS}\\b`);
    const under = /cleanupIntervalMs\s*=\s*60_000\b/.test(src);
    expect(
      re.test(src) || under,
      `cleanupIntervalMs constructor default must be ${EXPECTED_CLEANUP_INTERVAL_MS}ms — drift = CPU burn or stale map`,
    ).toBe(true);
    expect(
      /setInterval\(\s*\(\s*\)\s*=>\s*this\.evictExpired\(\)/.test(src),
      'setInterval must invoke this.evictExpired() — cleanup wiring broken',
    ).toBe(true);
  });

  it('evictExpired + destroy lifecycle: iterates and deletes + clears interval', () => {
    expect(
      /evictExpired\(\s*\)\s*:\s*void\s*\{[\s\S]*?this\.seen\.delete\(/.test(src),
      'evictExpired must iterate and delete expired entries',
    ).toBe(true);
    expect(
      /destroy\(\s*\)\s*:\s*void\s*\{[\s\S]*?clearInterval\(\s*this\.cleanupIntervalId\s*\)/.test(src),
      'destroy must call clearInterval(this.cleanupIntervalId) — timer leak on shutdown',
    ).toBe(true);
  });

  it('singleton export: `export const signalDedupGuard = new SignalDedupGuard();`', () => {
    expect(
      /export\s+const\s+signalDedupGuard\s*=\s*new\s+SignalDedupGuard\(\s*\)/.test(src),
      'singleton export missing — dedup state shattered across import sites',
    ).toBe(true);
  });

  it('composite: 9 axes hold simultaneously (dedup primitive coherence)', () => {
    expect(/import\s*\{\s*createHash\s*\}\s+from\s+['"]crypto['"]/.test(src)).toBe(true);
    expect(/export\s+class\s+SignalDedupGuard\s*\{/.test(src)).toBe(true);
    expect(/\$\{strategy\}\|\$\{market\}\|\$\{side\}\|\$\{bucketTs\}/.test(src)).toBe(true);
    expect(/createHash\(\s*['"]sha256['"]/.test(src) && /\.slice\(\s*0\s*,\s*32\s*\)/.test(src)).toBe(true);
    expect(
      /const\s+bucketMs\s*=\s*ttlSec\s*\*\s*1000/.test(src) &&
        /const\s+bucketTs\s*=\s*Math\.floor\(\s*ts\s*\/\s*bucketMs\s*\)\s*\*\s*bucketMs/.test(src),
    ).toBe(true);
    expect(/export\s+const\s+signalDedupGuard\s*=\s*new\s+SignalDedupGuard\(\s*\)/.test(src)).toBe(true);
  });
});
