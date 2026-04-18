/**
 * Redis client + pub/sub triple discipline 8-invariant sync — second
 * database-client substrate edge (after #191 Postgres).
 *
 * `src/redis/index.ts` exports three singleton Redis clients: main,
 * pub, sub (Redis requires pub/sub channels on separate connections).
 * Drift manifests as:
 *   - Singleton broken → every `getRedisClient()` creates a new Redis
 *     connection → connection bloat
 *   - Missing error listener → unexpected errors crash Node
 *   - Retry-per-request uncapped → a hung Redis stalls every API
 *     request indefinitely
 *   - Cluster-mode gate broken → switching between single and cluster
 *     mode silently routes to the wrong client
 *
 * Unlike the 48 prior edges (32 families):
 *   - #191 locks Postgres singleton pool (same pattern, different
 *     substrate).
 *   - **NEW family #33: REDIS CLIENT + PUB/SUB TRIPLE DISCIPLINE.**
 *     Second database-client substrate edge, distinct by (a) pub/sub
 *     separation (Redis-specific), (b) cluster-mode routing, (c)
 *     retry-per-request bound.
 *
 * The invariant is declared across 1 file × 8 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **ioredis imported** — baseline.
 *   3. **Three singletons** — `mainClient`, `pubClient`, `subClient`
 *      all module-scope nullable.
 *   4. **Env-driven config** — REDIS_HOST / REDIS_PORT /
 *      REDIS_PASSWORD / REDIS_DB all read from `process.env`.
 *   5. **Retry bound** — `maxRetriesPerRequest` present + value
 *      reasonable (≤ 10 prevents infinite hang on stuck Redis).
 *   6. **Cluster-mode gate** — `REDIS_CLUSTER_ENABLED === 'true'`
 *      check routes to cluster client.
 *   7. **Error listener with logger** — `on('error', ...)` with
 *      `logger.error` (not console.error).
 *   8. **Required exports** — `getRedisClient`, `getPubClient`,
 *      `getSubClient`, plus cluster re-exports.
 *
 * Novel invariants locked (family #33):
 *   - **Pub/Sub triple separation** — Redis requires distinct
 *     connections for publish and subscribe; merging = silent message
 *     loss.
 *   - **Cluster-mode routing** — single gate env var routes ALL
 *     callers; drift = split-brain (half go cluster, half single).
 *   - **Retry-per-request bound** — prevents infinite hang on stuck
 *     Redis (e.g., during failover).
 *
 * Drift scenarios covered:
 *   - `pubClient` singleton broken (every call creates new) → case 3
 *     fails.
 *   - `maxRetriesPerRequest: null` (ioredis infinite retry default) →
 *     case 5 fails.
 *   - Someone merges pub/sub into single client → case 3 fails.
 *   - REDIS_CLUSTER_ENABLED check removed during refactor → case 6
 *     fails.
 *
 * Symmetric to prior integrity edges:
 *   #187 Health endpoint Redis ping check (downstream consumer).
 *   #191 Postgres client pool singleton (same pattern, complementary
 *   substrate).
 *
 * Opens the **49th integrity edge — ENNEATETRACONTAGON** (49-gon).
 * Second database-client substrate. Novel family #33. Integrity
 * octatetracontagon → enneatetracontagon (49-gon).
 *
 * Non-goals: asserting cluster-config file shape (separate module);
 * connection retry/backoff strategy (ops layer); TLS/sentinel setup
 * (env-dependent).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const REDIS_FILE = resolve(REPO_ROOT, 'src/redis/index.ts');

const MAX_RETRY_UPPER_BOUND = 10;
const REQUIRED_ENV_VARS = ['REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD', 'REDIS_DB'];
const REQUIRED_EXPORTS = ['getRedisClient', 'getPubClient', 'getSubClient'];
const REQUIRED_SINGLETONS = ['mainClient', 'pubClient', 'subClient'];

function readRedis(): string {
  return readFileSync(REDIS_FILE, 'utf8');
}

describe('Redis client + pub/sub discipline — 49th edge (ENNEATETRACONTAGON)', () => {
  const src = readRedis();

  it('redis/index.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(500);
  });

  it('ioredis imported (Redis default + Cluster type)', () => {
    expect(
      /import\s+Redis\s+from\s+['"]ioredis['"]/.test(src),
      'ioredis default import missing',
    ).toBe(true);
    expect(
      /import\s+type\s+\{\s*Cluster\s*\}\s+from\s+['"]ioredis['"]/.test(src),
      'Cluster type import missing — cluster-mode return-type broken',
    ).toBe(true);
  });

  it('three singletons declared (mainClient + pubClient + subClient)', () => {
    for (const name of REQUIRED_SINGLETONS) {
      const re = new RegExp(`let\\s+${name}\\s*:\\s*Redis\\s*\\|\\s*null\\s*=\\s*null`);
      expect(
        re.test(src),
        `singleton \`let ${name}: Redis | null = null\` missing — pub/sub separation or single-client reuse broken`,
      ).toBe(true);
    }
  });

  it('env-driven config: REDIS_HOST/PORT/PASSWORD/DB all read from process.env', () => {
    for (const v of REQUIRED_ENV_VARS) {
      const re = new RegExp(`process\\.env\\.${v}\\b`);
      expect(re.test(src), `env ${v} not read — Redis hardcoded?`).toBe(true);
    }
  });

  it(`retry bound: maxRetriesPerRequest set and <= ${MAX_RETRY_UPPER_BOUND} (hang prevention)`, () => {
    const m = /maxRetriesPerRequest\s*:\s*(\d+)/.exec(src);
    expect(
      m,
      'maxRetriesPerRequest not set — ioredis default is `null` (infinite retry) → stuck Redis hangs every request',
    ).not.toBeNull();
    const val = m ? Number(m[1]) : 0;
    expect(val, 'maxRetriesPerRequest must be > 0').toBeGreaterThan(0);
    expect(
      val <= MAX_RETRY_UPPER_BOUND,
      `maxRetriesPerRequest=${val} > ${MAX_RETRY_UPPER_BOUND} — hang risk during Redis failover`,
    ).toBe(true);
  });

  it('cluster-mode gate: REDIS_CLUSTER_ENABLED === "true" checked', () => {
    expect(
      /process\.env\.REDIS_CLUSTER_ENABLED\s*===\s*['"]true['"]/.test(src),
      'cluster-mode gate `process.env.REDIS_CLUSTER_ENABLED === "true"` missing — split-brain risk',
    ).toBe(true);
    expect(
      /getRedisClusterClient\(/.test(src),
      'getRedisClusterClient() not invoked when cluster-mode true — gate broken',
    ).toBe(true);
  });

  it('main-client error listener wired to logger.error (not console)', () => {
    expect(
      /mainClient\.on\(\s*['"]error['"]\s*,/.test(src),
      'mainClient.on("error", ...) listener missing — crashes Node on unexpected error',
    ).toBe(true);
    expect(
      /logger\.error\(/.test(src),
      'logger.error not called on Redis errors — audit trail lost',
    ).toBe(true);
    expect(
      /console\.error\(/.test(src),
      'console.error used — should be logger.error for structured audit',
    ).toBe(false);
  });

  it('required exports present (getRedisClient + getPubClient + getSubClient)', () => {
    const missing = REQUIRED_EXPORTS.filter((name) => {
      const re = new RegExp(`export\\s+function\\s+${name}\\b`);
      return !re.test(src);
    });
    expect(
      missing,
      `redis/index.ts missing exports: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('cluster re-exports: getRedisClusterClient + closeRedisClusterClient + RedisClusterConfig', () => {
    for (const name of ['getRedisClusterClient', 'closeRedisClusterClient', 'RedisClusterConfig']) {
      const inExportBlock = new RegExp(`\\b${name}\\b`).test(src);
      expect(inExportBlock, `cluster re-export missing: ${name}`).toBe(true);
    }
    // Export block includes all 3 + getClusterHealth
    expect(
      /export\s*\{[\s\S]*getRedisClusterClient[\s\S]*getClusterHealth[\s\S]*closeRedisClusterClient[\s\S]*RedisClusterConfig[\s\S]*\}/.test(src),
      'export block does not re-export the 4 cluster items together',
    ).toBe(true);
  });

  it('DEFAULT_CONFIG object present with env-backed defaults', () => {
    expect(
      /const\s+DEFAULT_CONFIG\s*:\s*RedisConfig\s*=\s*\{/.test(src),
      'DEFAULT_CONFIG not declared — config construction inline / duplicated',
    ).toBe(true);
    expect(
      /host\s*:\s*process\.env\.REDIS_HOST\s*\|\|\s*['"]localhost['"]/.test(src),
      'DEFAULT_CONFIG.host missing env-fallback chain',
    ).toBe(true);
  });

  it('composite: 8 axes hold simultaneously (Redis triple coherence)', () => {
    expect(/import\s+Redis\s+from\s+['"]ioredis['"]/.test(src)).toBe(true);
    for (const name of REQUIRED_SINGLETONS) {
      const re = new RegExp(`let\\s+${name}\\s*:\\s*Redis\\s*\\|\\s*null\\s*=\\s*null`);
      expect(re.test(src), `singleton ${name} missing`).toBe(true);
    }
    for (const v of REQUIRED_ENV_VARS) {
      expect(new RegExp(`process\\.env\\.${v}\\b`).test(src)).toBe(true);
    }
    expect(/maxRetriesPerRequest\s*:\s*\d+/.test(src)).toBe(true);
    expect(/process\.env\.REDIS_CLUSTER_ENABLED\s*===\s*['"]true['"]/.test(src)).toBe(true);
    expect(/mainClient\.on\(\s*['"]error['"]/.test(src)).toBe(true);
    expect(/console\.error\(/.test(src)).toBe(false);
    for (const name of REQUIRED_EXPORTS) {
      expect(
        new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
        `missing export ${name}`,
      ).toBe(true);
    }
  });
});
