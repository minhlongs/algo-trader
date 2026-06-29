/**
 * SignalPublisher fan-out discipline 10-invariant sync — first
 * signal-pipeline orchestration substrate edge.
 *
 * `src/desk/signal/signal-publisher.ts` is the orchestrator that takes a
 * raw strategy output, dedups, persists to D1, registers with the TTL
 * enforcer, invalidates REST cache, broadcasts via SSE, and enqueues
 * Telegram pushes. Drift manifests as:
 *   - Dedup check relocated AFTER saveSignal → duplicate rows hit
 *     DB (breaks PR #168 trigger_reasons_array invariant downstream)
 *   - `expiresAt = ts + ttlSec * 1000` drifts to seconds → violates
 *     PR #165 DB-level invariant (expires_at in Unix-ms)
 *   - SSE broadcast / Telegram push happens BEFORE saveSignal →
 *     subscribers see signals that don't exist in DB (inconsistency)
 *   - SignalDedupGuard.buildId arg order drifts → every signal becomes
 *     "unique" (dedup broken silently)
 *
 * Unlike the 54 prior edges (38 families):
 *   - #165 locks signals.expires_at derivation at DB level.
 *   - #168 locks trigger_reasons_array subset enum at DB level.
 *   - **NEW family #39: SIGNALPUBLISHER FAN-OUT DISCIPLINE.** First
 *     signal-pipeline orchestration substrate edge. Locks the runtime
 *     invariants that produce the DB state #165/#168 lock.
 *
 * The invariant is declared across 1 file × 10 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **SignalPublisher class exported** + constructor takes
 *      `SignalStore` injection.
 *   3. **SignalStore interface** — `saveSignal(signal): Promise<void>`
 *      + `getSubscriptions(): Promise<SignalSubscription[]>`.
 *   4. **RawSignalInput interface** — market/side/size/confidence/
 *      strategy/ttlSec + optional `ts`.
 *   5. **publish() returns Signal | null** — null on dedup-reject or
 *      DB-save failure.
 *   6. **Dedup check BEFORE saveSignal (ordering)** —
 *      `signalDedupGuard.isDuplicate(signal)` call precedes
 *      `this.store.saveSignal(signal)`.
 *   7. **`expiresAt = ts + input.ttlSec * 1000`** (CROSS-EDGE with
 *      PR #165 signals.expires_at derivation) — Unix-ms math.
 *   8. **SignalDedupGuard.buildId(strategy, market, side, ts, ttlSec)
 *      exact arg order** — positional args drift = dedup false-miss.
 *   9. **Fan-out ordering: saveSignal → TTL enforcer → invalidate
 *      cache → SSE broadcast → Telegram** — persistence before
 *      broadcast (no ghost signals).
 *  10. **Telegram enqueue wrapped in try/catch** — non-blocking on
 *      subscription fetch failure.
 *
 * Novel invariants locked (family #39):
 *   - **Dedup-before-save ordering** — prevents duplicate DB rows.
 *   - **Unix-ms expiresAt math** — cross-edge with #165 temporal
 *     derivation CHECK.
 *   - **buildId arg-order lock** — any positional reordering breaks
 *     dedup silently.
 *   - **Fan-out ordering lock** — DB persistence before broadcast
 *     prevents subscribers seeing non-existent signals.
 *
 * Drift scenarios covered:
 *   - Developer moves dedup below save for "simpler flow" → case 6
 *     fails.
 *   - ttlSec*1000 changed to ttlSec (seconds) → case 7 fails
 *     (violates #165 DB contract).
 *   - buildId params reordered → case 8 fails.
 *   - SSE broadcast moved above saveSignal → case 9 fails.
 *
 * Symmetric to prior integrity edges:
 *   #165 DOICOSAGON signals.expires_at temporal derivation (DB-level
 *   consumer of this runtime computation).
 *   #168 PENTACOSAGON qwen_signals_loop_runs trigger_reasons_array
 *   (downstream consumer of deduped signals).
 *   #193 PENTACONTAGON signal-ingest HMAC (upstream caller —
 *   `new SignalPublisher(store)` factory).
 *
 * Opens the **55th integrity edge — PENTAPENTACONTAGON** (55-gon).
 * First signal-pipeline orchestration substrate edge. Novel family
 * #39. Integrity tetrapentacontagon → pentapentacontagon (55-gon).
 *
 * Non-goals: SignalDedupGuard implementation (separate module — locked
 * by its own test); DB-level CHECK (locked by #165); HTTP integration
 * (covered by signal-publisher.test.ts).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const PUBLISHER_FILE = resolve(REPO_ROOT, 'src/desk/signal/signal-publisher.ts');

const REQUIRED_RAW_INPUT_FIELDS = ['market', 'side', 'size', 'confidence', 'strategy', 'ttlSec'];

function readPublisher(): string {
  return readFileSync(PUBLISHER_FILE, 'utf8');
}

describe('SignalPublisher fan-out discipline — 55th edge (PENTAPENTACONTAGON)', () => {
  const src = readPublisher();

  it('signal-publisher.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(800);
  });

  it('SignalPublisher class exported + constructor takes SignalStore', () => {
    expect(
      /export\s+class\s+SignalPublisher\s*\{/.test(src),
      'SignalPublisher class not exported',
    ).toBe(true);
    expect(
      /constructor\s*\(\s*store\s*:\s*SignalStore\s*\)/.test(src),
      'SignalPublisher constructor does not take SignalStore — test-injection broken',
    ).toBe(true);
  });

  it('SignalStore interface: saveSignal + getSubscriptions both declared', () => {
    expect(
      /export\s+interface\s+SignalStore\s*\{[\s\S]*?saveSignal\(\s*signal\s*:\s*Signal\s*\)\s*:\s*Promise<void>/.test(
        src,
      ),
      'SignalStore.saveSignal(signal: Signal): Promise<void> missing',
    ).toBe(true);
    expect(
      /getSubscriptions\(\s*\)\s*:\s*Promise<SignalSubscription\[\]>/.test(src),
      'SignalStore.getSubscriptions(): Promise<SignalSubscription[]> missing',
    ).toBe(true);
  });

  it('RawSignalInput interface: all required fields declared + optional ts', () => {
    const m = /export\s+interface\s+RawSignalInput\s*\{([\s\S]*?)\n\}/.exec(src);
    expect(m, 'RawSignalInput interface body not found').not.toBeNull();
    const body = m ? m[1] : '';
    for (const f of REQUIRED_RAW_INPUT_FIELDS) {
      const re = new RegExp(`\\b${f}\\s*:`);
      expect(re.test(body), `RawSignalInput.${f} field missing`).toBe(true);
    }
    expect(
      /ts\s*\?\s*:\s*number/.test(body),
      'RawSignalInput.ts must be optional (ts?: number) — strategy-engine convention',
    ).toBe(true);
  });

  it('publish() returns Promise<Signal | null>', () => {
    expect(
      /async\s+publish\(\s*input\s*:\s*RawSignalInput\s*\)\s*:\s*Promise<Signal\s*\|\s*null>/.test(src),
      'publish() signature must be Promise<Signal | null> — null indicates dedup-reject or DB-save failure',
    ).toBe(true);
  });

  it('dedup check happens BEFORE saveSignal (ordering lock)', () => {
    const dedupIdx = src.indexOf('signalDedupGuard.isDuplicate');
    const saveIdx = src.indexOf('this.store.saveSignal');
    expect(dedupIdx, 'signalDedupGuard.isDuplicate call missing').toBeGreaterThan(-1);
    expect(saveIdx, 'this.store.saveSignal call missing').toBeGreaterThan(-1);
    expect(
      dedupIdx < saveIdx,
      'dedup check must precede saveSignal — reverse ordering causes duplicate DB rows',
    ).toBe(true);
  });

  it("expiresAt = ts + input.ttlSec * 1000 (cross-edge with PR #165 signals.expires_at CHECK)", () => {
    expect(
      /expiresAt\s*:\s*ts\s*\+\s*input\.ttlSec\s*\*\s*1000/.test(src),
      'expiresAt must equal `ts + input.ttlSec * 1000` (Unix-ms) — drift to seconds or missing *1000 violates PR #165 DB-level CHECK',
    ).toBe(true);
  });

  it('SignalDedupGuard.buildId exact arg order: (strategy, market, side, ts, ttlSec)', () => {
    // Scoped call within publish(). Arg order must be load-bearing.
    expect(
      /SignalDedupGuard\.buildId\(\s*input\.strategy\s*,\s*input\.market\s*,\s*input\.side\s*,\s*ts\s*,\s*input\.ttlSec\s*\)/.test(
        src,
      ),
      'SignalDedupGuard.buildId positional args drifted — correct order: (strategy, market, side, ts, ttlSec). Any reorder breaks dedup silently.',
    ).toBe(true);
  });

  it('fan-out ordering: saveSignal → TTL enforcer → cache invalidate → SSE → Telegram', () => {
    // Use call-site patterns (with parens) to avoid matching import lines.
    const saveIdx = src.indexOf('this.store.saveSignal');
    const ttlIdx = src.search(/signalTtlEnforcer\.register\(/);
    const cacheIdx = src.search(/invalidateSignalCache\(\)/);
    const sseIdx = src.search(/sseBroadcaster\.broadcast\(/);
    const tgIdx = src.search(/telegramSignalPusher\.enqueue\(/);
    expect(saveIdx, 'saveSignal call missing').toBeGreaterThan(-1);
    expect(ttlIdx, 'signalTtlEnforcer.register missing').toBeGreaterThan(-1);
    expect(cacheIdx, 'invalidateSignalCache missing').toBeGreaterThan(-1);
    expect(sseIdx, 'sseBroadcaster.broadcast missing').toBeGreaterThan(-1);
    expect(tgIdx, 'telegramSignalPusher.enqueue missing').toBeGreaterThan(-1);
    expect(
      saveIdx < ttlIdx && ttlIdx < cacheIdx && cacheIdx < sseIdx && sseIdx < tgIdx,
      `fan-out ordering drift: save=${saveIdx} ttl=${ttlIdx} cache=${cacheIdx} sse=${sseIdx} tg=${tgIdx} — DB persistence must precede all broadcast paths`,
    ).toBe(true);
  });

  it('Telegram enqueue wrapped in try/catch (subscription-fetch non-blocking)', () => {
    // Extract the block containing telegramSignalPusher.enqueue.
    const re = /try\s*\{[\s\S]*?telegramSignalPusher\.enqueue[\s\S]*?\}\s*catch/;
    expect(
      re.test(src),
      'telegramSignalPusher.enqueue not wrapped in try/catch — subscription-fetch failure would crash publish() flow',
    ).toBe(true);
    expect(
      /logger\.warn\([\s\S]*?Telegram/.test(src),
      'Telegram-push failure does not use logger.warn — ops audit missing',
    ).toBe(true);
  });

  it('composite: 10 axes hold simultaneously (signal fan-out coherence)', () => {
    expect(/export\s+class\s+SignalPublisher/.test(src)).toBe(true);
    expect(/constructor\s*\(\s*store\s*:\s*SignalStore\s*\)/.test(src)).toBe(true);
    expect(/saveSignal\(\s*signal\s*:\s*Signal\s*\)\s*:\s*Promise<void>/.test(src)).toBe(true);
    expect(/getSubscriptions\(\s*\)\s*:\s*Promise<SignalSubscription\[\]>/.test(src)).toBe(true);
    expect(/expiresAt\s*:\s*ts\s*\+\s*input\.ttlSec\s*\*\s*1000/.test(src)).toBe(true);
    expect(/SignalDedupGuard\.buildId\(\s*input\.strategy\s*,\s*input\.market\s*,\s*input\.side\s*,\s*ts\s*,\s*input\.ttlSec/.test(src)).toBe(true);
    expect(src.indexOf('signalDedupGuard.isDuplicate') < src.indexOf('this.store.saveSignal')).toBe(true);
    expect(src.indexOf('this.store.saveSignal') < src.indexOf('sseBroadcaster.broadcast')).toBe(true);
  });
});
