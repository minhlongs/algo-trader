/**
 * Qwen drawdown-monitor wiring discipline 10-invariant sync —
 * first L3 rollback-wiring substrate edge.
 *
 * `src/wiring/qwen-drawdown-monitor.ts` is the L3 auto-rollback layer
 * referenced by:
 *   - Admin kill-switch routes (#195 DIPENTACONTAGON — calls
 *     disableQwen / enableQwen / isKillSwitchActive / isQwenEnabled)
 *   - Health endpoint (#187 — calls isQwenEnabled + isKillSwitchActive)
 *
 * Drift manifests as:
 *   - DEFAULT_INTERVAL_MS changed from 6h → 1h → monitor runs 6x more
 *     often (compute cost); or lengthened → breach-detection lag grows
 *   - ROLLING_WINDOW_MS changed from 24h → 7d → thinner breach signal
 *   - Drawdown threshold default shifted from 5% → 50% → rollback
 *     fails to fire at realistic drawdowns
 *   - isKillSwitchActive flips its env check (QWEN_KILL==='0' instead
 *     of '1') → kill-switch inverted, every deploy kills Qwen
 *   - disableQwen / enableQwen miss logger.warn / logger.info → admin
 *     action untraced
 *
 * Unlike the 52 prior edges (36 families):
 *   - #195 locks the admin-route CONTRACT that uses these functions.
 *   - This edge locks the WIRING IMPLEMENTATION itself.
 *   - **NEW family #37: QWEN DRAWDOWN-MONITOR WIRING DISCIPLINE.**
 *     First L3 rollback-wiring substrate edge.
 *
 * The invariant is declared across 1 file × 10 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **DEFAULT_INTERVAL_MS = 6 hours** — 6 * 60 * 60 * 1000 =
 *      21_600_000.
 *   3. **ROLLING_WINDOW_MS = 24 hours** — 24 * 60 * 60 * 1000 =
 *      86_400_000.
 *   4. **getDrawdownThreshold env + 5% default** — reads
 *      QWEN_DRAWDOWN_MAX_PCT with `parsed === NaN ? 5 : parsed`.
 *   5. **isKillSwitchActive exact env check** —
 *      `process.env.QWEN_KILL === '1'` (NOT `==='0'` — inversion would
 *      kill on every deploy).
 *   6. **isQwenEnabled composed check** — returns `false` if kill
 *      switch active, else `_qwenEnabled` flag.
 *   7. **disableQwen wiring** — sets `_qwenEnabled = false` + sets
 *      `_lastBreachAt = Date.now()` + calls
 *      `setQwenDrawdownAutoDisabled(true)` + logger.warn.
 *   8. **enableQwen wiring** — clears `_qwenEnabled = true` + clears
 *      `_lastBreachAt = null` + calls `setQwenDrawdownAutoDisabled(false)`
 *      + logger.info.
 *   9. **Required exports** — `isKillSwitchActive`, `isQwenEnabled`,
 *      `disableQwen`, `enableQwen`, `getLastBreachAt`,
 *      `computeRollingPnl`.
 *  10. **computeRollingPnl typed return** — `{ pnlPct: number | null;
 *      totalSize: number; totalPnl: number }`.
 *
 * Novel invariants locked (family #37):
 *   - **Interval + window constants** — drift silently changes
 *     rollback cadence.
 *   - **Kill-switch inversion protection** — exact `'1'` compare; any
 *     flip = deploy-time kill.
 *   - **Composed enable gate** — `isQwenEnabled` must check kill
 *     FIRST, NOT or-compose.
 *   - **Wiring-side-effect parity** — disableQwen + enableQwen must
 *     each update metric AND logger.
 *
 * Drift scenarios covered:
 *   - Interval halved to 3h for "faster detection" → case 2 fails.
 *   - Threshold default bumped to 10% "to reduce alerts" → case 4
 *     fails.
 *   - `isKillSwitchActive` returns `QWEN_KILL !== '0'` → case 5 fails
 *     (any non-'0' would kill).
 *   - `disableQwen` drops metric call → case 7 fails.
 *   - `_lastBreachAt` not cleared in `enableQwen` → case 8 fails
 *     (stale breach timestamp).
 *
 * Symmetric to prior integrity edges:
 *   #187 Health endpoint Qwen state readout (consumer).
 *   #195 Admin Qwen kill-switch contract (consumer — invokes these).
 *
 * Opens the **53rd integrity edge — TRIPENTACONTAGON** (53-gon). First
 * L3 rollback-wiring substrate edge. Novel family #37. Integrity
 * dipentacontagon → tripentacontagon (53-gon).
 *
 * Non-goals: asserting Telegram pusher wiring (separate module);
 * timing-integration test (out of scope); start/stop interval
 * lifecycle (tested elsewhere).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const MONITOR_FILE = resolve(REPO_ROOT, 'src/wiring/qwen-drawdown-monitor.ts');

const EXPECTED_INTERVAL_MS = 6 * 60 * 60 * 1000;
const EXPECTED_WINDOW_MS = 24 * 60 * 60 * 1000;
const EXPECTED_THRESHOLD_DEFAULT = 5;
const REQUIRED_EXPORTS = [
  'isKillSwitchActive',
  'isQwenEnabled',
  'disableQwen',
  'enableQwen',
  'getLastBreachAt',
  'computeRollingPnl',
];

function readMonitor(): string {
  return readFileSync(MONITOR_FILE, 'utf8');
}

describe('Qwen drawdown-monitor wiring discipline — 53rd edge (TRIPENTACONTAGON)', () => {
  const src = readMonitor();

  it('qwen-drawdown-monitor.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(1000);
  });

  it(`DEFAULT_INTERVAL_MS = 6 hours (${EXPECTED_INTERVAL_MS}ms)`, () => {
    // Accept `6 * 60 * 60 * 1000` expression OR 21_600_000 literal.
    const math = /DEFAULT_INTERVAL_MS\s*=\s*6\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(src);
    const lit = new RegExp(`DEFAULT_INTERVAL_MS\\s*=\\s*${EXPECTED_INTERVAL_MS}\\b`).test(src);
    const under = /DEFAULT_INTERVAL_MS\s*=\s*21_?600_?000\b/.test(src);
    expect(
      math || lit || under,
      `DEFAULT_INTERVAL_MS must equal ${EXPECTED_INTERVAL_MS}ms (6 hours) — drift changes rollback cadence`,
    ).toBe(true);
  });

  it(`ROLLING_WINDOW_MS = 24 hours (${EXPECTED_WINDOW_MS}ms)`, () => {
    const math = /ROLLING_WINDOW_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(src);
    const lit = new RegExp(`ROLLING_WINDOW_MS\\s*=\\s*${EXPECTED_WINDOW_MS}\\b`).test(src);
    expect(
      math || lit,
      `ROLLING_WINDOW_MS must equal ${EXPECTED_WINDOW_MS}ms (24 hours) — drift thins breach signal`,
    ).toBe(true);
  });

  it(`QWEN_DRAWDOWN_MAX_PCT env with ${EXPECTED_THRESHOLD_DEFAULT}% default`, () => {
    expect(
      /process\.env\.QWEN_DRAWDOWN_MAX_PCT/.test(src),
      'QWEN_DRAWDOWN_MAX_PCT env not read',
    ).toBe(true);
    const defRe = new RegExp(`parseFloat\\(raw\\)\\s*:\\s*${EXPECTED_THRESHOLD_DEFAULT}\\b`);
    const nanRe = new RegExp(`isNaN\\(parsed\\)\\s*\\?\\s*${EXPECTED_THRESHOLD_DEFAULT}\\b`);
    expect(
      defRe.test(src) || nanRe.test(src),
      `drawdown threshold default must be ${EXPECTED_THRESHOLD_DEFAULT}% — drift raises rollback threshold silently`,
    ).toBe(true);
  });

  it("isKillSwitchActive: exact `process.env.QWEN_KILL === '1'` compare (inversion-lock)", () => {
    expect(
      /process\.env\.QWEN_KILL\s*===\s*['"]1['"]/.test(src),
      "isKillSwitchActive must compare QWEN_KILL === '1' (not '!== 0' or similar) — inversion would kill on every deploy",
    ).toBe(true);
  });

  it('isQwenEnabled: checks kill FIRST then _qwenEnabled flag (composed order)', () => {
    // Find function body.
    const m = /export\s+function\s+isQwenEnabled\s*\(\s*\)\s*:\s*boolean\s*\{([\s\S]*?)\n\}/.exec(src);
    expect(m, 'isQwenEnabled function body not found').not.toBeNull();
    const body = m ? m[1] : '';
    expect(
      /isKillSwitchActive\(\)/.test(body),
      'isQwenEnabled body missing isKillSwitchActive() check',
    ).toBe(true);
    expect(
      /return\s+_qwenEnabled/.test(body),
      'isQwenEnabled body does not return _qwenEnabled after kill check',
    ).toBe(true);
    const killIdx = body.indexOf('isKillSwitchActive');
    const flagIdx = body.indexOf('_qwenEnabled');
    expect(
      killIdx < flagIdx,
      'isKillSwitchActive() check must precede _qwenEnabled return — compose-order lock',
    ).toBe(true);
  });

  it('disableQwen wiring: flag=false + lastBreachAt=Date.now() + metric + logger.warn', () => {
    const m = /export\s+function\s+disableQwen\s*\([^)]*\)\s*:\s*void\s*\{([\s\S]*?)\n\}/.exec(src);
    expect(m, 'disableQwen function body not found').not.toBeNull();
    const body = m ? m[1] : '';
    expect(/_qwenEnabled\s*=\s*false/.test(body), 'disableQwen does not set _qwenEnabled=false').toBe(true);
    expect(/_lastBreachAt\s*=\s*Date\.now\(\)/.test(body), 'disableQwen does not set _lastBreachAt=Date.now()').toBe(true);
    expect(/setQwenDrawdownAutoDisabled\(\s*true\s*\)/.test(body), 'disableQwen does not call setQwenDrawdownAutoDisabled(true)').toBe(true);
    expect(/logger\.warn\(/.test(body), 'disableQwen missing logger.warn audit').toBe(true);
  });

  it('enableQwen wiring: flag=true + lastBreachAt=null + metric false + logger.info', () => {
    const m = /export\s+function\s+enableQwen\s*\(\s*\)\s*:\s*void\s*\{([\s\S]*?)\n\}/.exec(src);
    expect(m, 'enableQwen function body not found').not.toBeNull();
    const body = m ? m[1] : '';
    expect(/_qwenEnabled\s*=\s*true/.test(body), 'enableQwen does not set _qwenEnabled=true').toBe(true);
    expect(/_lastBreachAt\s*=\s*null/.test(body), 'enableQwen does not clear _lastBreachAt=null — stale breach timestamp').toBe(true);
    expect(/setQwenDrawdownAutoDisabled\(\s*false\s*\)/.test(body), 'enableQwen does not call setQwenDrawdownAutoDisabled(false)').toBe(true);
    expect(/logger\.info\(/.test(body), 'enableQwen missing logger.info audit').toBe(true);
  });

  it('required exports present (6 functions: isKillSwitchActive + isQwenEnabled + disableQwen + enableQwen + getLastBreachAt + computeRollingPnl)', () => {
    const missing = REQUIRED_EXPORTS.filter((name) => {
      const re = new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`);
      return !re.test(src);
    });
    expect(
      missing,
      `qwen-drawdown-monitor.ts missing exports: ${missing.join(', ')} — downstream callers (#195 admin + #187 health) break`,
    ).toEqual([]);
  });

  it('computeRollingPnl returns typed `{ pnlPct: number | null; totalSize: number; totalPnl: number }`', () => {
    expect(
      /computeRollingPnl[\s\S]*?Promise<\{[\s\S]*?pnlPct\s*:\s*number\s*\|\s*null\s*;[\s\S]*?totalSize\s*:\s*number\s*;[\s\S]*?totalPnl\s*:\s*number\s*[;}]/.test(src),
      'computeRollingPnl return type must be { pnlPct: number|null; totalSize: number; totalPnl: number } — consumer contract drift',
    ).toBe(true);
  });

  it('composite: 10 axes hold simultaneously (drawdown-monitor wiring coherence)', () => {
    expect(/DEFAULT_INTERVAL_MS\s*=\s*6\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(src)).toBe(true);
    expect(/ROLLING_WINDOW_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(src)).toBe(true);
    expect(/process\.env\.QWEN_KILL\s*===\s*['"]1['"]/.test(src)).toBe(true);
    expect(/process\.env\.QWEN_DRAWDOWN_MAX_PCT/.test(src)).toBe(true);
    for (const name of REQUIRED_EXPORTS) {
      expect(
        new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`).test(src),
        `missing export ${name}`,
      ).toBe(true);
    }
    expect(/setQwenDrawdownAutoDisabled\(\s*true\s*\)/.test(src)).toBe(true);
    expect(/setQwenDrawdownAutoDisabled\(\s*false\s*\)/.test(src)).toBe(true);
  });
});
