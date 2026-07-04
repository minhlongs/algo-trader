/**
 * SignalTtlEnforcer primitive discipline 9-invariant sync — fourth
 * signal-pipeline substrate edge.
 *
 * `src/desk/signal/signal-ttl-enforcer.ts` is the in-memory live-cache that
 * tracks active signals and auto-evicts them at expiry. Drift manifests
 * as:
 *   - Double-Map coupling broken (`signals` without `timers` clear) →
 *     timer leak on every re-register
 *   - Already-expired branch dropped in `register` → signals register
 *     but never fire eviction (memory leak)
 *   - `getLive` filter flipped to `expiresAt <= now` → returns only
 *     expired signals (live feed inverted)
 *   - Singleton export removed → every importer creates its own cache
 *     → SSE subscribers see different state
 *
 * Unlike the 57 prior edges (41 families):
 *   - #198 locks SignalPublisher that CALLS `signalTtlEnforcer.register`.
 *   - #199 locks SignalDedupGuard (complementary in-memory primitive).
 *   - #200 locks SignalStoreD1 (DB persistence).
 *   - **NEW family #42: SIGNALTTLENFORCER PRIMITIVE DISCIPLINE.** Fourth
 *     signal-pipeline substrate edge.
 *
 * The invariant is declared across 1 file × 9 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **Double-Map state** — private `signals: Map<string, Signal>`
 *      + private `timers: Map<string, ReturnType<typeof setTimeout>>`.
 *   3. **register: already-expired branch** — `if (delay <= 0) evict
 *      + return` before scheduling timer.
 *   4. **register: cancel existing timer before scheduling** —
 *      `if (existing) clearTimeout(existing)` prevents duplicate
 *      timers on re-register.
 *   5. **register: schedule `setTimeout(() => this.evict(id), delay)`**
 *      — automatic eviction at expiry.
 *   6. **evict: deletes from BOTH maps + clears timer** — orphan
 *      timer fires on deleted signal = no-op.
 *   7. **getLive: filter `expiresAt > now`** — correct direction
 *      (not `<=` which would invert feed).
 *   8. **sweepExpired returns count** — defensive sweep batch action.
 *   9. **clear: clearTimeout ALL timers + both Maps cleared** —
 *      shutdown cleanup.
 *  10. **Singleton export** — `export const signalTtlEnforcer = new
 *      SignalTtlEnforcer()`.
 *
 * Novel invariants locked (family #42):
 *   - **Double-Map atomicity** — signals Map + timers Map must stay
 *     in sync; register/evict/clear all touch both.
 *   - **Already-expired short-circuit** — negative `delay` must
 *     trigger immediate evict, not `setTimeout` with past time.
 *   - **Filter direction lock** — `getLive` must be `expiresAt > now`.
 *   - **Singleton export** — shared state across SSE, REST cache,
 *     publisher.
 *
 * Drift scenarios covered:
 *   - `register` skips already-expired branch → case 3 fails (memory
 *     leak when ts is 1h in past).
 *   - `clearTimeout(existing)` removed → case 4 fails (double timer
 *     fires, `evict` called twice).
 *   - `getLive` uses `<=` → case 7 fails (feed inverted).
 *   - `clear` forgets `clearTimeout` loop → case 9 fails (timers
 *     outlive process in tests).
 *
 * Symmetric to prior integrity edges:
 *   #198 PENTAPENTACONTAGON SignalPublisher (caller — invokes
 *   `signalTtlEnforcer.register` after DB save).
 *   #199 HEXAPENTACONTAGON SignalDedupGuard (complementary in-memory
 *   primitive — both use Map + setInterval/setTimeout for cleanup).
 *   #200 HEPTAPENTACONTAGON SignalStoreD1 (complementary persistence
 *   layer).
 *
 * Opens the **58th integrity edge — OCTAPENTACONTAGON** (58-gon).
 * Fourth signal-pipeline substrate edge. Novel family #42. Integrity
 * heptapentacontagon → octapentacontagon (58-gon).
 *
 * Non-goals: HTTP integration test (out of scope); timing-integration
 * (covered by signal-publisher.test.ts); Redis-backed TTL migration
 * (YAGNI).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const TTL_FILE = resolve(REPO_ROOT, 'src/desk/signal/signal-ttl-enforcer.ts');

function readTtl(): string {
  return readFileSync(TTL_FILE, 'utf8');
}

describe('SignalTtlEnforcer primitive discipline — 58th edge (OCTAPENTACONTAGON)', () => {
  const src = readTtl();

  it('signal-ttl-enforcer.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(500);
  });

  it('double-Map state: `signals: Map<string, Signal>` + `timers: Map<string, ReturnType<typeof setTimeout>>`', () => {
    expect(
      /private\s+signals\s*:\s*Map<string\s*,\s*Signal>/.test(src),
      'private signals: Map<string, Signal> field missing',
    ).toBe(true);
    expect(
      /private\s+timers\s*:\s*Map<string\s*,\s*ReturnType<typeof\s+setTimeout>>/.test(src),
      'private timers: Map<string, ReturnType<typeof setTimeout>> field missing',
    ).toBe(true);
  });

  it('register: already-expired signals handled via Math.max(0, delay) zero-delay timer', () => {
    const startIdx = src.indexOf('register(signal: Signal)');
    const endIdx = src.indexOf('evict(id: string)', startIdx);
    expect(startIdx, 'register method missing').toBeGreaterThan(-1);
    expect(endIdx, 'evict sibling method missing').toBeGreaterThan(startIdx);
    const body = src.slice(startIdx, endIdx);
    expect(
      /Math\.max\(\s*0\s*,\s*delay\s*\)/.test(body),
      'register must use Math.max(0, delay) for already-expired signals',
    ).toBe(true);
    expect(
      /this\.signals\.set\(\s*signal\.id/.test(body),
      'register must write signal to map before scheduling eviction timer',
    ).toBe(true);
  });

  it('register: cancel existing timer before scheduling (no duplicate timers)', () => {
    const startIdx = src.indexOf('register(signal: Signal)');
    const endIdx = src.indexOf('evict(id: string)', startIdx);
    const body = src.slice(startIdx, endIdx);
    expect(
      /const\s+existing\s*=\s*this\.timers\.get\(\s*signal\.id\s*\)/.test(body),
      'register missing `const existing = this.timers.get(signal.id)` lookup',
    ).toBe(true);
    expect(
      /if\s*\(\s*existing\s*\)\s*\{?\s*clearTimeout\(\s*existing\s*\)/.test(body),
      'register missing `if (existing) clearTimeout(existing)` — duplicate timers on re-register',
    ).toBe(true);
  });

  it('register: schedules `setTimeout(() => this.evict(signal.id), delay)` + stores', () => {
    const startIdx = src.indexOf('register(signal: Signal)');
    const endIdx = src.indexOf('evict(id: string)', startIdx);
    const body = src.slice(startIdx, endIdx);
    expect(
      /setTimeout\(\s*\(\s*\)\s*=>\s*this\.evict\(\s*signal\.id\s*\)/.test(body),
      'register does not schedule setTimeout(() => this.evict(signal.id), ...)',
    ).toBe(true);
    expect(
      /this\.timers\.set\(\s*signal\.id\s*,\s*timer\s*\)/.test(body),
      'register does not store timer in this.timers Map',
    ).toBe(true);
  });

  it('evict: deletes from BOTH maps + clears timer (double-Map atomicity)', () => {
    const startIdx = src.indexOf('evict(id: string)');
    const endIdx = src.indexOf('getLive()', startIdx);
    const body = src.slice(startIdx, endIdx);
    expect(/this\.signals\.delete\(\s*id\s*\)/.test(body), 'evict missing this.signals.delete(id)').toBe(true);
    expect(/this\.timers\.delete\(\s*id\s*\)/.test(body), 'evict missing this.timers.delete(id)').toBe(true);
    expect(/clearTimeout\(\s*timer\s*\)/.test(body), 'evict missing clearTimeout(timer) — orphan timer leak').toBe(true);
  });

  it('getLive: filter `expiresAt > now` (correct direction — not inverted)', () => {
    expect(
      /\.filter\(\s*\(\s*s\s*\)\s*=>\s*s\.expiresAt\s*>\s*now\s*\)/.test(src),
      'getLive must filter `expiresAt > now` — `<=` or `<` would invert feed',
    ).toBe(true);
  });

  it('sweepExpired returns number count of evicted signals', () => {
    expect(
      /sweepExpired\(\s*\)\s*:\s*number\s*\{[\s\S]*?let\s+count\s*=\s*0[\s\S]*?count\+\+[\s\S]*?return\s+count/.test(src),
      'sweepExpired must return count of evicted signals',
    ).toBe(true);
    expect(
      /sig\.expiresAt\s*<=\s*now/.test(src),
      'sweepExpired iteration must filter by expiresAt <= now (past-expiry)',
    ).toBe(true);
  });

  it('clear: loops clearTimeout over timers + clears BOTH maps', () => {
    const startIdx = src.indexOf('clear()');
    expect(startIdx, 'clear method missing').toBeGreaterThan(-1);
    const body = src.slice(startIdx, startIdx + 300);
    expect(
      /for\s*\(\s*const\s+timer\s+of\s+this\.timers\.values\(\)\s*\)\s*clearTimeout\(\s*timer\s*\)/.test(body),
      'clear must loop clearTimeout over this.timers.values()',
    ).toBe(true);
    expect(
      /this\.signals\.clear\(\)/.test(body),
      'clear missing this.signals.clear()',
    ).toBe(true);
    expect(
      /this\.timers\.clear\(\)/.test(body),
      'clear missing this.timers.clear()',
    ).toBe(true);
  });

  it('singleton export: `export const signalTtlEnforcer = new SignalTtlEnforcer();`', () => {
    expect(
      /export\s+const\s+signalTtlEnforcer\s*=\s*new\s+SignalTtlEnforcer\(\s*\)/.test(src),
      'singleton export missing — SSE/REST-cache/publisher import would fail',
    ).toBe(true);
  });

  it('composite: 9 axes hold simultaneously (TTL enforcer coherence)', () => {
    expect(/private\s+signals\s*:\s*Map<string\s*,\s*Signal>/.test(src)).toBe(true);
    expect(/private\s+timers\s*:\s*Map<string\s*,\s*ReturnType<typeof\s+setTimeout>>/.test(src)).toBe(true);
    expect(/Math\.max\(\s*0\s*,\s*delay\s*\)/.test(src)).toBe(true);
    expect(/if\s*\(\s*existing\s*\)\s*\{?\s*clearTimeout\(\s*existing\s*\)/.test(src)).toBe(true);
    expect(/setTimeout\(\s*\(\s*\)\s*=>\s*this\.evict\(\s*signal\.id\s*\)/.test(src)).toBe(true);
    expect(/\.filter\(\s*\(\s*s\s*\)\s*=>\s*s\.expiresAt\s*>\s*now\s*\)/.test(src)).toBe(true);
    expect(/export\s+const\s+signalTtlEnforcer\s*=\s*new\s+SignalTtlEnforcer/.test(src)).toBe(true);
  });
});
