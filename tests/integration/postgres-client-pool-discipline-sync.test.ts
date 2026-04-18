/**
 * Postgres client pool discipline 8-invariant sync — first database-
 * client substrate edge.
 *
 * `src/db/postgres-client.ts` is the singleton Postgres connection pool
 * shared across the application (P&L tracking, signals, subscriber
 * attribution, auth). Drift manifests as:
 *   - Singleton broken → every `query()` creates a new Pool →
 *     connection exhaustion + socket leak in minutes
 *   - `maxConnections` lifted beyond what the DB accepts → refusals +
 *     `too many clients` errors
 *   - Transaction helper missing ROLLBACK → partial writes on error
 *     silently commit (data integrity risk)
 *   - Pool `error` listener missing → unexpected errors crash Node
 *     process rather than logging
 *
 * Unlike the 47 prior edges (31 families):
 *   - #190 locks Better-Auth's Postgres Pool env-driven creds but not
 *     the shared client pool singleton + transaction helper.
 *   - **NEW family #32: POSTGRES CLIENT POOL DISCIPLINE.** First
 *     database-client substrate edge.
 *
 * The invariant is declared across 1 file × 8 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **pg imported + Pool destructured** — baseline.
 *   3. **Singleton pool** — `let pool: pg.Pool | null = null` +
 *      `if (pool) return pool` guard prevents multiple instantiations.
 *   4. **Env-driven config** — DB_HOST/DB_PORT/DB_NAME/DB_USER/
 *      DB_PASSWORD all read from `process.env`.
 *   5. **maxConnections bound** — default ≤ 20 (tight upper bound;
 *      Neon free tier allows ~100 concurrent, leave headroom for other
 *      clients like Better-Auth).
 *   6. **pool.on('error', ...) handler** — unexpected error logged,
 *      does not crash process.
 *   7. **Transaction lifecycle** — BEGIN + COMMIT + ROLLBACK +
 *      client.release all present (proper cleanup).
 *   8. **Required exports** — `getDbClient` + `query` + `transaction`
 *      + `closeDbConnection` all exported.
 *
 * Novel invariants locked (family #32):
 *   - **Singleton enforcement** — drift = socket leak class.
 *   - **Connection-count bound** — prevents thundering herd.
 *   - **Transaction lifecycle** — ROLLBACK on error guarantees atomicity.
 *   - **logger.error on pool error** — NOT console.error (audit trail).
 *
 * Drift scenarios covered:
 *   - Developer removes singleton guard for "simpler code" → case 3
 *     fails.
 *   - maxConnections bumped to 100 to "fix load testing" → case 5
 *     fails.
 *   - ROLLBACK omitted from transaction helper → case 7 fails (data
 *     integrity regression).
 *   - Any of 4 exports accidentally removed → case 8 fails.
 *
 * Symmetric to prior integrity edges:
 *   #187 Health endpoint postgres-SELECT-1 check (downstream consumer).
 *   #190 Better-Auth Postgres Pool (complementary pool, different
 *   caller surface).
 *
 * Opens the **48th integrity edge — OCTATETRACONTAGON** (48-gon). First
 * database-client substrate edge. Novel family #32. Integrity
 * heptatetracontagon → octatetracontagon (48-gon).
 *
 * Non-goals: asserting SSL mode (env-dependent); query logging
 * (separate concern); connection retry/backoff (operational layer).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const CLIENT_FILE = resolve(REPO_ROOT, 'src/db/postgres-client.ts');

const MAX_CONNECTIONS_UPPER_BOUND = 20;
const REQUIRED_EXPORTS = ['getDbClient', 'query', 'transaction', 'closeDbConnection'];
const REQUIRED_ENV_VARS = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];

function readClient(): string {
  return readFileSync(CLIENT_FILE, 'utf8');
}

describe('Postgres client pool discipline — 48th edge (OCTATETRACONTAGON)', () => {
  const src = readClient();

  it('postgres-client.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(500);
  });

  it('pg imported + Pool destructured', () => {
    expect(
      /import\s+pg\s+from\s+['"]pg['"]/.test(src),
      'pg import missing',
    ).toBe(true);
    expect(
      /const\s*\{\s*Pool\s*\}\s*=\s*pg/.test(src),
      'Pool not destructured from pg — new Pool() lookup broken',
    ).toBe(true);
  });

  it('singleton pool: `let pool` at module scope + `if (pool) return pool` guard', () => {
    expect(
      /let\s+pool\s*:\s*pg\.Pool\s*\|\s*null\s*=\s*null/.test(src),
      'module-scope `let pool` declaration missing — singleton broken',
    ).toBe(true);
    expect(
      /if\s*\(\s*pool\s*\)\s*return\s+pool/.test(src),
      'singleton guard `if (pool) return pool` missing — every getDbClient() call would create new Pool (socket leak)',
    ).toBe(true);
  });

  it('env-driven config: DB_HOST/PORT/NAME/USER/PASSWORD all read from process.env', () => {
    for (const v of REQUIRED_ENV_VARS) {
      const re = new RegExp(`process\\.env\\.${v}\\b`);
      expect(re.test(src), `env ${v} not read — hardcoded connection string?`).toBe(true);
    }
  });

  it(`maxConnections default <= ${MAX_CONNECTIONS_UPPER_BOUND} (tight bound against thundering herd)`, () => {
    const m = /maxConnections\s*:\s*(\d+)/.exec(src);
    expect(m, 'maxConnections default not set').not.toBeNull();
    const max = m ? Number(m[1]) : 0;
    expect(max, `maxConnections=${max} — expected positive number`).toBeGreaterThan(0);
    expect(
      max <= MAX_CONNECTIONS_UPPER_BOUND,
      `maxConnections=${max} > ${MAX_CONNECTIONS_UPPER_BOUND} — Neon free tier ~100 shared clients, leave headroom`,
    ).toBe(true);
  });

  it('pool error listener present with logger.error (not console.error)', () => {
    expect(
      /pool\.on\(\s*['"]error['"]\s*,/.test(src),
      'pool.on("error", ...) listener missing — unexpected errors would crash process',
    ).toBe(true);
    expect(
      /logger\.error\(/.test(src),
      'logger.error not called — audit trail lost',
    ).toBe(true);
    expect(
      /console\.error\(/.test(src),
      'console.error used — should be logger.error (structured audit trail)',
    ).toBe(false);
  });

  it('transaction helper: BEGIN + COMMIT + ROLLBACK + client.release all present', () => {
    expect(
      /client\.query\(\s*['"]BEGIN['"]\s*\)/.test(src),
      'transaction helper missing BEGIN — transaction semantics broken',
    ).toBe(true);
    expect(
      /client\.query\(\s*['"]COMMIT['"]\s*\)/.test(src),
      'transaction helper missing COMMIT',
    ).toBe(true);
    expect(
      /client\.query\(\s*['"]ROLLBACK['"]\s*\)/.test(src),
      'transaction helper missing ROLLBACK — partial writes would silently commit on error',
    ).toBe(true);
    expect(
      /client\.release\(\)/.test(src),
      'transaction helper missing client.release() — connection leak on every call',
    ).toBe(true);
  });

  it('required exports present (getDbClient + query + transaction + closeDbConnection)', () => {
    const missing = REQUIRED_EXPORTS.filter((name) => {
      const re = new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`);
      return !re.test(src);
    });
    expect(
      missing,
      `postgres-client.ts missing exports: ${missing.join(', ')} — downstream callers break`,
    ).toEqual([]);
  });

  it('query() delegates to pool.query and typed via generic T', () => {
    expect(
      /export\s+async\s+function\s+query<T\s+extends\s+DbRow[^>]*>/.test(src),
      'query() not generic-typed with DbRow bound — type safety regression',
    ).toBe(true);
    expect(
      /client\.query\(\s*text\s*,\s*params\s*\)/.test(src),
      'query() does not delegate to client.query(text, params) — parameterization missing',
    ).toBe(true);
  });

  it('composite: 8 axes hold simultaneously (pool-client coherence)', () => {
    expect(/import\s+pg\s+from\s+['"]pg['"]/.test(src)).toBe(true);
    expect(/const\s*\{\s*Pool\s*\}\s*=\s*pg/.test(src)).toBe(true);
    expect(/if\s*\(\s*pool\s*\)\s*return\s+pool/.test(src)).toBe(true);
    for (const v of REQUIRED_ENV_VARS) {
      expect(new RegExp(`process\\.env\\.${v}\\b`).test(src)).toBe(true);
    }
    expect(/pool\.on\(\s*['"]error['"]/.test(src)).toBe(true);
    expect(/console\.error\(/.test(src)).toBe(false);
    expect(
      /BEGIN/.test(src) && /COMMIT/.test(src) && /ROLLBACK/.test(src) && /client\.release/.test(src),
    ).toBe(true);
    for (const name of REQUIRED_EXPORTS) {
      expect(
        new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`).test(src),
        `missing export ${name}`,
      ).toBe(true);
    }
  });
});
