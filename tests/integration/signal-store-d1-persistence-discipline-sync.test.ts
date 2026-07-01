/**
 * SignalStoreD1 persistence discipline 10-invariant sync — third
 * signal-pipeline substrate edge.
 *
 * `src/desk/signal/signal-store-d1.ts` is the concrete SignalStore
 * implementation used by the SignalPublisher (#198) and instantiated
 * by the signal-ingest route (#193). Drift manifests as:
 *   - `deriveSource` misclassifies strategy prefix → violates PR #161
 *     signals.source enum + PR #160 paper_trades_v3.source enum
 *   - `paperOnly` binary gate flips direction → violates PR #162
 *     signals.paper_only binary semantic
 *   - INSERT column list drifts (order or count) → rows misaligned,
 *     production data corruption
 *   - `ON CONFLICT (id) DO NOTHING` dropped → retry logic writes
 *     duplicate rows (breaks #199 dedup guarantee)
 *   - getSubscriptions filter `active = 1` removed → inactive subs
 *     receive Telegram pushes
 *
 * Unlike the 56 prior edges (40 families):
 *   - #160 locks paper_trades_v3.source enum at DB level.
 *   - #161 locks signals.source enum at DB level.
 *   - #162 locks signals.paper_only binary flag at DB level.
 *   - #198 locks SignalPublisher fan-out that CALLS saveSignal.
 *   - **NEW family #41: SIGNALSTOREDB PERSISTENCE DISCIPLINE.** Third
 *     signal-pipeline substrate. Connects SignalPublisher runtime to
 *     the DB enum invariants.
 *
 * The invariant is declared across 1 file × 10 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **SignalStoreD1 class implements SignalStore interface** —
 *      structural bijection with #198.
 *   3. **deriveSource strategy-prefix enum** —
 *      qwen→'qwen-m1max' / deepseek→'deepseek' / swarm→'swarm' /
 *      default→'legacy' (cross-edge with PR #161 signals.source enum
 *      + PR #160 paper_trades_v3.source enum).
 *   4. **paperOnly binary gate** — `source === 'qwen-m1max' ? 1 : 0`
 *      (cross-edge with PR #162 signals.paper_only binary-flag DB
 *      constraint).
 *   5. **INSERT 12-column list in exact order** — id, ts, market, side,
 *      size, confidence, strategy, ttl, expires_at, created_at,
 *      source, paper_only.
 *   6. **ON CONFLICT (id) DO NOTHING** — idempotent retry (prevents
 *      duplicate rows + cross-edge with #199 dedup).
 *   7. **12 positional params exact order** matching the column list.
 *   8. **getSubscriptions filter: active = 1** + ORDER BY created_at
 *      ASC (newer subs don't jump queue).
 *   9. **Error handling**: saveSignal throws, getSubscriptions returns
 *      empty array on error (Telegram fan-out non-blocking).
 *  10. **Singleton export** — `signalStoreD1 = new SignalStoreD1()`.
 *
 * Novel invariants locked (family #41):
 *   - **deriveSource enum bijection** — output must be one of 4
 *     tokens; prefix mapping locked at runtime side.
 *   - **paper_only gate direction** — qwen→1 (paper) / everything
 *     else→0 (live-eligible). Flip = live-by-default for Qwen.
 *   - **Column-list arity + order** — drift = data corruption.
 *   - **ON CONFLICT idempotency** — retry safety.
 *   - **active=1 filter** — inactive subs excluded from push.
 *
 * Drift scenarios covered:
 *   - `deriveSource` removed → case 3 fails.
 *   - `paperOnly = source === 'qwen-m1max' ? 0 : 1` (inverted) →
 *     case 4 fails (Qwen → live).
 *   - Column-list reorder → case 5 fails.
 *   - ON CONFLICT removed → case 6 fails.
 *   - getSubscriptions drops WHERE active=1 → case 8 fails.
 *
 * Symmetric to prior integrity edges:
 *   #160 paper_trades_v3.source DB enum.
 *   #161 signals.source DB enum.
 *   #162 signals.paper_only DB binary flag.
 *   #198 SignalPublisher fan-out (caller).
 *   #199 SignalDedupGuard (dedup upstream of saveSignal).
 *
 * Opens the **57th integrity edge — HEPTAPENTACONTAGON** (57-gon).
 * Third signal-pipeline substrate edge. Novel family #41. Integrity
 * hexapentacontagon → heptapentacontagon (57-gon).
 *
 * Non-goals: asserting SQL execution (DB runtime concern); column-
 * level CHECK constraints (locked at DB layer by prior edges); HTTP
 * integration (covered elsewhere).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const STORE_FILE = resolve(REPO_ROOT, 'src/desk/signal/signal-store-d1.ts');

const EXPECTED_INSERT_COLUMNS = [
  'id',
  'ts',
  'market',
  'side',
  'size',
  'confidence',
  'strategy',
  'ttl',
  'expires_at',
  'created_at',
  'source',
  'paper_only',
];

function readStore(): string {
  return readFileSync(STORE_FILE, 'utf8');
}

describe('SignalStoreD1 persistence discipline — 57th edge (HEPTAPENTACONTAGON)', () => {
  const src = readStore();

  it('signal-store-d1.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(800);
  });

  it('SignalStoreD1 class implements SignalStore interface', () => {
    expect(
      /export\s+class\s+SignalStoreD1\s+implements\s+SignalStore/.test(src),
      'SignalStoreD1 must `implements SignalStore` — structural bijection with SignalPublisher (PR #198)',
    ).toBe(true);
  });

  it("deriveSource maps strategy prefix → source token (cross-edge #160+#161)", () => {
    expect(
      /startsWith\(\s*['"]qwen['"]\s*\)[\s\S]*?return\s+['"]qwen-m1max['"]/.test(src),
      "qwen prefix must map to 'qwen-m1max' — cross-edge with #161 signals.source enum",
    ).toBe(true);
    expect(
      /startsWith\(\s*['"]deepseek['"]\s*\)[\s\S]*?return\s+['"]deepseek['"]/.test(src),
      "deepseek prefix must map to 'deepseek'",
    ).toBe(true);
    expect(
      /startsWith\(\s*['"]swarm['"]\s*\)[\s\S]*?return\s+['"]swarm['"]/.test(src),
      "swarm prefix must map to 'swarm'",
    ).toBe(true);
    expect(
      /return\s+['"]legacy['"]/.test(src),
      "default branch must return 'legacy'",
    ).toBe(true);
  });

  it("paperOnly binary gate: source === 'qwen-m1max' ? 1 : 0 (cross-edge #162)", () => {
    expect(
      /source\s*===\s*['"]qwen-m1max['"]\s*\?\s*1\s*:\s*0/.test(src),
      "paperOnly must be `source === 'qwen-m1max' ? 1 : 0` — inverted ternary = Qwen signals go LIVE by default (CVE)",
    ).toBe(true);
  });

  it('INSERT 12-column list in exact order (data-alignment lock)', () => {
    const m = /INSERT\s+INTO\s+signals\s*\(([^)]+)\)/i.exec(src);
    expect(m, 'INSERT INTO signals (...) column list not found').not.toBeNull();
    const cols = m ? m[1].split(',').map((c) => c.trim()) : [];
    expect(
      cols,
      `INSERT columns drifted — expected: ${EXPECTED_INSERT_COLUMNS.join(', ')}; got: ${cols.join(', ')}`,
    ).toEqual(EXPECTED_INSERT_COLUMNS);
  });

  it('ON CONFLICT (id) DO NOTHING (idempotent retry — cross-edge #199 dedup)', () => {
    expect(
      /ON\s+CONFLICT\s*\(\s*id\s*\)\s+DO\s+NOTHING/i.test(src),
      'ON CONFLICT (id) DO NOTHING missing — retry writes duplicate rows, violates #199 dedup guarantee',
    ).toBe(true);
  });

  it('12 positional params in exact order matching column list', () => {
    // Expected param mapping (TS-side identifiers bound to $1..$12):
    const expectedParams = [
      'signal.id',
      'signal.ts',
      'signal.market',
      'signal.side',
      'signal.size',
      'signal.confidence',
      'signal.strategy',
      'signal.ttl',
      'signal.expiresAt',
      'Date.now()',
      'source',
      'paperOnly',
    ];
    // Find the positional args block `[ ... ]` that follows the INSERT text.
    const paramMatch = /ON\s+CONFLICT[\s\S]*?\`\s*,\s*\[([\s\S]*?)\]\s*\)/i.exec(src);
    expect(paramMatch, 'positional params array block not parsed').not.toBeNull();
    const rawParams = paramMatch ? paramMatch[1].split(',').map((p) => p.trim()).filter(Boolean) : [];
    expect(rawParams.length, `expected 12 params, got ${rawParams.length}`).toBe(12);
    for (let i = 0; i < expectedParams.length; i++) {
      expect(
        rawParams[i],
        `param at position $${i + 1} drifted — expected ${expectedParams[i]}, got ${rawParams[i]}`,
      ).toBe(expectedParams[i]);
    }
  });

  it('getSubscriptions filter: WHERE active = 1 + ORDER BY created_at ASC', () => {
    expect(
      /WHERE\s+active\s*=\s*1/i.test(src),
      'getSubscriptions missing WHERE active = 1 — inactive subs would receive Telegram pushes',
    ).toBe(true);
    expect(
      /ORDER\s+BY\s+created_at\s+ASC/i.test(src),
      'getSubscriptions missing ORDER BY created_at ASC — ordering drift = subscriber queue-jumping',
    ).toBe(true);
  });

  it('error handling: saveSignal rethrows, getSubscriptions returns [] on error', () => {
    // saveSignal must rethrow (SignalPublisher expects to catch).
    expect(
      /saveSignal[\s\S]*?catch\s*\([^)]*\)\s*\{[\s\S]*?throw\s+err/i.test(src),
      'saveSignal must rethrow errors — SignalPublisher DB-save catch depends on it',
    ).toBe(true);
    // getSubscriptions must return empty array on error (non-blocking for Telegram).
    expect(
      /getSubscriptions[\s\S]*?catch[\s\S]*?return\s+\[\]/i.test(src),
      'getSubscriptions must return [] on error — non-blocking Telegram fan-out',
    ).toBe(true);
  });

  it('singleton export: `export const signalStoreD1 = new SignalStoreD1()`', () => {
    expect(
      /export\s+const\s+signalStoreD1\s*=\s*new\s+SignalStoreD1\(\s*\)/.test(src),
      'singleton export missing — server.ts import would fail',
    ).toBe(true);
  });

  it('composite: 10 axes hold simultaneously (D1 persistence coherence)', () => {
    expect(/export\s+class\s+SignalStoreD1\s+implements\s+SignalStore/.test(src)).toBe(true);
    expect(/return\s+['"]qwen-m1max['"]/.test(src)).toBe(true);
    expect(/return\s+['"]legacy['"]/.test(src)).toBe(true);
    expect(/source\s*===\s*['"]qwen-m1max['"]\s*\?\s*1\s*:\s*0/.test(src)).toBe(true);
    const m = /INSERT\s+INTO\s+signals\s*\(([^)]+)\)/i.exec(src);
    const cols = m ? m[1].split(',').map((c) => c.trim()) : [];
    expect(cols).toEqual(EXPECTED_INSERT_COLUMNS);
    expect(/ON\s+CONFLICT\s*\(\s*id\s*\)\s+DO\s+NOTHING/i.test(src)).toBe(true);
    expect(/WHERE\s+active\s*=\s*1/i.test(src)).toBe(true);
    expect(/export\s+const\s+signalStoreD1\s*=\s*new\s+SignalStoreD1\(\s*\)/.test(src)).toBe(true);
  });
});
