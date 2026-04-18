/**
 * SseSignalBroadcaster primitive discipline 10-invariant sync — seventh
 * signal-pipeline substrate edge.
 *
 * `src/signal/sse-signal-broadcaster.ts` is the in-process SSE fan-out
 * that delivers realtime signals to ENTERPRISE SSE subscribers. Drift
 * manifests as:
 *   - Missing `X-Accel-Buffering: no` → nginx buffers SSE → clients
 *     see bursts or timeouts
 *   - Heartbeat disabled → clients disconnect after idle (~30s for
 *     proxies)
 *   - Singleton pattern broken → multiple Broadcaster instances →
 *     clients split across them (partial fan-out)
 *   - Dead-connection GC missing → `res.write` throws accumulate,
 *     broadcast error bubbles
 *   - setMaxListeners below 1000 → Node emits warning + SSE caps at
 *     ~10 clients
 *
 * Unlike the 60 prior edges (44 families):
 *   - #198 SignalPublisher calls `sseBroadcaster.broadcast(signal)`.
 *   - #202 SignalTierFilter `canAccessSse` decides who subscribes.
 *   - **NEW family #45: SSESIGNALBROADCASTER PRIMITIVE DISCIPLINE.**
 *     Seventh signal-pipeline substrate edge.
 *
 * The invariant is declared across 1 file × 10 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **SseSignalBroadcaster extends EventEmitter** — base class.
 *   3. **Singleton pattern** — private constructor + static
 *      `instance` field + static `getInstance()` lazy-init.
 *   4. **setMaxListeners(1100)** — Node default is 10; SSE needs 1000+.
 *   5. **Connections Map `id → {res, heartbeat}`** — tracks timer
 *      for cleanup.
 *   6. **SSE_HEARTBEAT_MS = 20_000** — ping every 20s (below proxy
 *      idle 30s threshold).
 *   7. **subscribe() 4 required SSE headers** — Content-Type:
 *      text/event-stream, Cache-Control: no-cache, Connection:
 *      keep-alive, X-Accel-Buffering: no.
 *   8. **subscribe() writes initial `: connected\n\n`** + attaches
 *      heartbeat timer + binds `res.on('close', cleanup)`.
 *   9. **broadcast() dead-connection GC** — try/catch around
 *      `res.write(payload)` + `unsubscribe(dead)` loop.
 *  10. **Singleton export** — `export const sseBroadcaster =
 *      SseSignalBroadcaster.getInstance()`.
 *
 * Novel invariants locked (family #45):
 *   - **Singleton + getInstance pattern** — (distinct from constant-
 *     export singletons in #199/#200/#201 — this one uses class-level
 *     lazy init via `static getInstance()`).
 *   - **SSE header 4-tuple** — missing any one causes a specific
 *     proxy/browser breakage class.
 *   - **1100 maxListeners** — capacity planning vs Node default 10.
 *   - **Dead-connection try/catch + GC** — disconnect detection +
 *     memory reclaim.
 *
 * Drift scenarios covered:
 *   - `X-Accel-Buffering` removed → case 7 fails (nginx buffers).
 *   - Heartbeat interval shortened to 2s → bandwidth waste; edge
 *     accepts any positive value in const.
 *   - Singleton getInstance replaced with `new` calls → case 3 fails.
 *   - dead-connection loop removed → case 9 fails (memory leak).
 *
 * Symmetric to prior integrity edges:
 *   #198 SignalPublisher (calls `sseBroadcaster.broadcast`).
 *   #202 SignalTierFilter (canAccessSse decides subscribe access).
 *
 * Opens the **61st integrity edge — HENIHEXACONTAGON** (61-gon).
 * Seventh signal-pipeline substrate edge. Novel family #45. Integrity
 * hexacontagon → henihexacontagon (61-gon).
 *
 * Non-goals: runtime SSE client test (covered elsewhere); nginx
 * integration (external operational layer).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const SSE_FILE = resolve(REPO_ROOT, 'src/signal/sse-signal-broadcaster.ts');

const REQUIRED_SSE_HEADERS = [
  ['Content-Type', 'text/event-stream'],
  ['Cache-Control', 'no-cache'],
  ['Connection', 'keep-alive'],
  ['X-Accel-Buffering', 'no'],
];

function readSse(): string {
  return readFileSync(SSE_FILE, 'utf8');
}

describe('SseSignalBroadcaster primitive discipline — 61st edge (HENIHEXACONTAGON)', () => {
  const src = readSse();

  it('sse-signal-broadcaster.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(800);
  });

  it('SseSignalBroadcaster extends EventEmitter (base class)', () => {
    expect(
      /export\s+class\s+SseSignalBroadcaster\s+extends\s+EventEmitter\s*\{/.test(src),
      'SseSignalBroadcaster must `extends EventEmitter`',
    ).toBe(true);
    expect(
      /import\s*\{\s*EventEmitter\s*\}\s+from\s+['"]events['"]/.test(src),
      'EventEmitter import missing',
    ).toBe(true);
  });

  it('Singleton pattern: private constructor + static instance + getInstance lazy-init', () => {
    expect(
      /private\s+static\s+instance\s*:\s*SseSignalBroadcaster/.test(src),
      'private static `instance: SseSignalBroadcaster` field missing',
    ).toBe(true);
    expect(
      /private\s+constructor\s*\(\s*\)\s*\{/.test(src),
      'private constructor missing — singleton pattern broken',
    ).toBe(true);
    expect(
      /static\s+getInstance\(\)\s*:\s*SseSignalBroadcaster\s*\{[\s\S]*?if\s*\(\s*!SseSignalBroadcaster\.instance\s*\)[\s\S]*?new\s+SseSignalBroadcaster\(\)/.test(src),
      'getInstance() lazy-init `if (!instance) new SseSignalBroadcaster()` missing',
    ).toBe(true);
  });

  it('setMaxListeners(1100) — SSE needs > Node default 10', () => {
    expect(
      /this\.setMaxListeners\(\s*1100\s*\)/.test(src),
      'setMaxListeners(1100) missing — Node EventEmitter caps at 10 by default, SSE needs 1000+',
    ).toBe(true);
  });

  it('connections Map `{res, heartbeat}` tracks timer for cleanup', () => {
    expect(
      /private\s+connections\s*:\s*Map<string\s*,\s*\{\s*res\s*:\s*Response\s*;\s*heartbeat\s*:\s*ReturnType<typeof\s+setInterval>\s*\}>/.test(src),
      'connections Map typing drifted — must be `Map<string, { res: Response; heartbeat: ReturnType<typeof setInterval> }>`',
    ).toBe(true);
  });

  it('SSE_HEARTBEAT_MS = 20_000 (ping < proxy idle 30s)', () => {
    expect(
      /SSE_HEARTBEAT_MS\s*=\s*20_?000\b/.test(src),
      'SSE_HEARTBEAT_MS must equal 20_000 — proxy idle timeout typically 30s',
    ).toBe(true);
    expect(
      /setInterval\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?res\.write\(\s*['"]: ping\\n\\n['"]\s*\)[\s\S]*?\}\s*,\s*SSE_HEARTBEAT_MS/.test(src),
      'heartbeat must write `: ping\\n\\n` via setInterval(SSE_HEARTBEAT_MS)',
    ).toBe(true);
  });

  it('subscribe() sets all 4 required SSE headers', () => {
    for (const [header, value] of REQUIRED_SSE_HEADERS) {
      const re = new RegExp(
        `res\\.setHeader\\(\\s*['"]${header}['"]\\s*,\\s*['"]${value}['"]`,
      );
      expect(
        re.test(src),
        `subscribe() missing res.setHeader('${header}', '${value}') — SSE client/proxy behavior broken`,
      ).toBe(true);
    }
  });

  it('subscribe() writes initial `: connected\\n\\n` + res.flushHeaders() + close-cleanup', () => {
    expect(
      /res\.flushHeaders\(\)/.test(src),
      'subscribe missing res.flushHeaders() — initial response may buffer',
    ).toBe(true);
    expect(
      /res\.write\(\s*['"]: connected\\n\\n['"]\s*\)/.test(src),
      'subscribe missing initial `: connected\\n\\n` write — client waits forever',
    ).toBe(true);
    expect(
      /res\.on\(\s*['"]close['"]\s*,\s*cleanup\s*\)/.test(src),
      'subscribe missing res.on("close", cleanup) — disconnect detection broken',
    ).toBe(true);
  });

  it('broadcast() wraps res.write in try/catch + unsubscribe dead connections', () => {
    // Extract broadcast method body.
    const startIdx = src.indexOf('broadcast(signal: Signal)');
    const endIdx = src.indexOf('get connectionCount', startIdx);
    expect(startIdx, 'broadcast() method missing').toBeGreaterThan(-1);
    const body = src.slice(startIdx, endIdx);
    expect(
      /try\s*\{[\s\S]*?res\.write\(\s*payload\s*\)[\s\S]*?\}\s*catch/.test(body),
      'broadcast res.write must be wrapped in try/catch',
    ).toBe(true);
    expect(
      /for\s*\(\s*const\s+id\s+of\s+dead\s*\)\s*this\.unsubscribe\(\s*id\s*\)/.test(body),
      'broadcast must loop dead-connection ids and unsubscribe — memory leak otherwise',
    ).toBe(true);
    expect(
      /data:\s*\$\{JSON\.stringify\(signal\)\}\\n\\n/.test(body),
      'broadcast payload must be `data: ${JSON.stringify(signal)}\\n\\n` — SSE format contract',
    ).toBe(true);
  });

  it('unsubscribe clears heartbeat interval + deletes from Map', () => {
    expect(
      /unsubscribe\(id\s*:\s*string\)\s*:\s*void\s*\{[\s\S]*?clearInterval\(\s*conn\.heartbeat\s*\)[\s\S]*?this\.connections\.delete\(\s*id\s*\)/.test(src),
      'unsubscribe must clearInterval(heartbeat) AND connections.delete(id) — timer leak otherwise',
    ).toBe(true);
  });

  it("singleton export: `export const sseBroadcaster = SseSignalBroadcaster.getInstance()`", () => {
    expect(
      /export\s+const\s+sseBroadcaster\s*=\s*SseSignalBroadcaster\.getInstance\(\s*\)/.test(src),
      'singleton export missing — consumers (#198 SignalPublisher) import would fail',
    ).toBe(true);
  });

  it('composite: 10 axes hold simultaneously (SSE broadcaster coherence)', () => {
    expect(/extends\s+EventEmitter/.test(src)).toBe(true);
    expect(/private\s+constructor/.test(src) && /getInstance\(\)/.test(src)).toBe(true);
    expect(/setMaxListeners\(\s*1100\s*\)/.test(src)).toBe(true);
    expect(/SSE_HEARTBEAT_MS\s*=\s*20_?000\b/.test(src)).toBe(true);
    for (const [h, v] of REQUIRED_SSE_HEADERS) {
      expect(
        new RegExp(`res\\.setHeader\\(\\s*['"]${h}['"]\\s*,\\s*['"]${v}['"]`).test(src),
      ).toBe(true);
    }
    expect(/res\.on\(\s*['"]close['"]\s*,\s*cleanup\s*\)/.test(src)).toBe(true);
    expect(/export\s+const\s+sseBroadcaster\s*=\s*SseSignalBroadcaster\.getInstance/.test(src)).toBe(true);
  });
});
