/**
 * SignalRestCache primitive discipline 9-invariant sync — ninth
 * signal-pipeline substrate edge.
 *
 * `src/signal/signal-rest-cache.ts` is the Redis-backed KV cache for
 * paginated signal REST responses. Drift manifests as:
 *   - CACHE_TTL_SEC lengthens from 10s → 5min → stale signals served
 *     (signal-feed UX degradation; confidence/expiresAt lock broken)
 *   - Cache key omits tier → cross-tier serving (FREE sees ENTERPRISE
 *     signals, revenue-tier violation)
 *   - invalidateSignalCache skipped after publish → stale cache lingers
 *     through TTL instead of immediate flush (cross-edge with #198)
 *   - Graceful try/catch removed → Redis outage crashes /api/signals
 *     REST route
 *
 * Unlike the 62 prior edges (46 families):
 *   - #192 ENNEATETRACONTAGON locks Redis client primitive.
 *   - #198 PENTAPENTACONTAGON SignalPublisher calls
 *     `invalidateSignalCache()` after DB save.
 *   - #202 ENNEAPENTACONTAGON SignalTierFilter supplies TierKey.
 *   - **NEW family #47: SIGNALRESTCACHE PRIMITIVE DISCIPLINE.** Ninth
 *     signal-pipeline substrate edge.
 *
 * The invariant is declared across 1 file × 9 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **CACHE_TTL_SEC = 10** — short TTL; signals are time-sensitive.
 *   3. **KEY_PREFIX = 'signal:rest:'** — namespacing (distinct from
 *      other Redis keys).
 *   4. **cacheKey(tier, since, limit)** positional args + colon-
 *      separated concatenation — prevents cross-tier serving.
 *   5. **setCachedSignals uses redis.setex(key, CACHE_TTL_SEC, JSON)**
 *      — atomic write-with-TTL.
 *   6. **getCachedSignals returns null on miss** — caller can
 *      fall-through to DB query.
 *   7. **invalidateSignalCache uses `redis.keys(prefix*) + redis.del`**
 *      — wildcard invalidation after publish.
 *   8. **try/catch + logger.warn on all 3 ops** — Redis outage non-
 *      crashing (REST still works, cache misses).
 *   9. **Required exports** — setCachedSignals + getCachedSignals +
 *      invalidateSignalCache.
 *
 * Novel invariants locked (family #47):
 *   - **TTL constant** — 10s short enough to mask staleness, long
 *     enough to shed traffic during burst.
 *   - **Key namespacing** — prefix isolates from other Redis uses
 *     (#192 primitive).
 *   - **Tier in key** — positional arg in cacheKey prevents revenue-
 *     tier violation via cache serving.
 *   - **Wildcard invalidate** — single call clears all pages after
 *     publish (cross-edge with #198 fan-out ordering).
 *
 * Drift scenarios covered:
 *   - CACHE_TTL_SEC bumped to 3600 for "better cache hit rate" →
 *     case 2 fails (stale signals).
 *   - Cache key drops tier → case 4 fails (cross-tier serving).
 *   - invalidateSignalCache stops using redis.keys/del → case 7
 *     fails (publish doesn't flush cache).
 *   - try/catch removed → case 8 fails (Redis outage crashes REST).
 *
 * Symmetric to prior integrity edges:
 *   #192 ENNEATETRACONTAGON Redis client primitive.
 *   #198 PENTAPENTACONTAGON SignalPublisher (caller of
 *   invalidateSignalCache).
 *   #202 ENNEAPENTACONTAGON SignalTierFilter (TierKey supplier).
 *
 * Opens the **63rd integrity edge — TRIHEXACONTAGON** (63-gon). Ninth
 * signal-pipeline substrate edge. Novel family #47. Integrity
 * dihexacontagon → trihexacontagon (63-gon).
 *
 * Non-goals: Redis integration test (external dependency); TTL
 * tuning recommendations (operational layer); pagination
 * correctness (upstream REST concern).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const CACHE_FILE = resolve(REPO_ROOT, 'src/signal/signal-rest-cache.ts');

const REQUIRED_EXPORTS = ['setCachedSignals', 'getCachedSignals', 'invalidateSignalCache'];

function readCache(): string {
  return readFileSync(CACHE_FILE, 'utf8');
}

describe('SignalRestCache primitive discipline — 63rd edge (TRIHEXACONTAGON)', () => {
  const src = readCache();

  it('signal-rest-cache.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(400);
  });

  it('CACHE_TTL_SEC = 10 (short TTL — signals are time-sensitive)', () => {
    expect(
      /const\s+CACHE_TTL_SEC\s*=\s*10\b/.test(src),
      'CACHE_TTL_SEC must equal 10 — longer TTL serves stale signals; shorter defeats cache purpose',
    ).toBe(true);
  });

  it("KEY_PREFIX = 'signal:rest:' (Redis namespace isolation)", () => {
    expect(
      /const\s+KEY_PREFIX\s*=\s*['"]signal:rest:['"]/.test(src),
      "KEY_PREFIX must equal 'signal:rest:' — namespacing isolates from other Redis keys (#192 primitive)",
    ).toBe(true);
  });

  it('cacheKey(tier, since, limit) positional args + colon-separated build', () => {
    expect(
      /function\s+cacheKey\(\s*tier\s*:\s*TierKey\s*,\s*since\s*:\s*number\s*,\s*limit\s*:\s*number\s*\)\s*:\s*string/.test(
        src,
      ),
      'cacheKey signature must be (tier: TierKey, since: number, limit: number): string — positional order load-bearing',
    ).toBe(true);
    expect(
      /\$\{KEY_PREFIX\}\$\{tier\}:\$\{since\}:\$\{limit\}/.test(src),
      'cacheKey body must concat `${KEY_PREFIX}${tier}:${since}:${limit}` — tier FIRST prevents revenue-tier cross-serving',
    ).toBe(true);
  });

  it('setCachedSignals uses redis.setex(key, CACHE_TTL_SEC, JSON.stringify)', () => {
    expect(
      /redis\.setex\(\s*key\s*,\s*CACHE_TTL_SEC\s*,\s*JSON\.stringify\(\s*signals\s*\)\s*\)/.test(src),
      'setCachedSignals must use redis.setex(key, CACHE_TTL_SEC, JSON.stringify(signals)) — atomic write-with-TTL',
    ).toBe(true);
  });

  it('getCachedSignals returns null on miss + JSON.parse on hit', () => {
    const startIdx = src.indexOf('export async function getCachedSignals');
    const endIdx = src.indexOf('export async function invalidateSignalCache', startIdx);
    expect(startIdx, 'getCachedSignals method missing').toBeGreaterThan(-1);
    const body = src.slice(startIdx, endIdx);
    expect(
      /if\s*\(\s*!raw\s*\)\s*return\s+null/.test(body),
      'getCachedSignals must return null on cache miss — enables fall-through to DB',
    ).toBe(true);
    expect(
      /JSON\.parse\(\s*raw\s*\)\s+as\s+Signal\[\]/.test(body),
      'getCachedSignals must JSON.parse + typed cast on hit',
    ).toBe(true);
  });

  it('invalidateSignalCache uses `redis.keys(KEY_PREFIX*) + redis.del(...keys)`', () => {
    expect(
      /redis\.keys\(\s*`\$\{KEY_PREFIX\}\*`\s*\)/.test(src),
      'invalidateSignalCache must call redis.keys(`${KEY_PREFIX}*`) — wildcard lookup',
    ).toBe(true);
    expect(
      /keys\.length\s*>\s*0[\s\S]*?redis\.del\(\s*\.\.\.keys\s*\)/.test(src),
      'invalidateSignalCache must guard `keys.length > 0` then `redis.del(...keys)` — spread unpack',
    ).toBe(true);
  });

  it('all 3 ops wrapped in try/catch + logger.warn (Redis outage non-crashing)', () => {
    // Count try/catch blocks + logger.warn in same file.
    const tryCount = (src.match(/try\s*\{/g) || []).length;
    const catchCount = (src.match(/\}\s*catch\s*\(/g) || []).length;
    expect(tryCount, `expected ≥3 try blocks (3 ops), got ${tryCount}`).toBeGreaterThanOrEqual(3);
    expect(catchCount, `expected ≥3 catch blocks (3 ops), got ${catchCount}`).toBeGreaterThanOrEqual(3);
    // Each catch should log via logger.warn (not throw).
    const warnCount = (src.match(/logger\.warn\(/g) || []).length;
    expect(
      warnCount,
      `expected ≥3 logger.warn calls (1 per op), got ${warnCount} — Redis outage would crash REST if missing`,
    ).toBeGreaterThanOrEqual(3);
  });

  it('required exports present (setCachedSignals + getCachedSignals + invalidateSignalCache)', () => {
    const missing = REQUIRED_EXPORTS.filter((name) => {
      const re = new RegExp(`export\\s+async\\s+function\\s+${name}\\b`);
      return !re.test(src);
    });
    expect(
      missing,
      `signal-rest-cache.ts missing exports: ${missing.join(', ')} — downstream callers break`,
    ).toEqual([]);
  });

  it('composite: 9 axes hold simultaneously (REST cache coherence)', () => {
    expect(/const\s+CACHE_TTL_SEC\s*=\s*10\b/.test(src)).toBe(true);
    expect(/const\s+KEY_PREFIX\s*=\s*['"]signal:rest:['"]/.test(src)).toBe(true);
    expect(/\$\{KEY_PREFIX\}\$\{tier\}:\$\{since\}:\$\{limit\}/.test(src)).toBe(true);
    expect(/redis\.setex\(\s*key\s*,\s*CACHE_TTL_SEC\s*,\s*JSON\.stringify/.test(src)).toBe(true);
    expect(/redis\.keys\(\s*`\$\{KEY_PREFIX\}\*`\s*\)/.test(src)).toBe(true);
    expect(/redis\.del\(\s*\.\.\.keys\s*\)/.test(src)).toBe(true);
    for (const name of REQUIRED_EXPORTS) {
      expect(
        new RegExp(`export\\s+async\\s+function\\s+${name}\\b`).test(src),
        `missing export ${name}`,
      ).toBe(true);
    }
  });
});
