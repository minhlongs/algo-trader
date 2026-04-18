/**
 * TelegramSignalPusher primitive discipline 10-invariant sync — eighth
 * signal-pipeline substrate edge.
 *
 * `src/signal/telegram-signal-pusher.ts` fans out signals to Telegram
 * chat IDs with per-tier throttling + global 30 msg/sec Telegram API
 * limit guard. Drift manifests as:
 *   - Per-tier throttle drift (FREE → hourly instead of daily) →
 *     revenue-tier violation + Telegram rate-limit blow-out
 *   - Queue pacing `50ms` delay removed → hits 30 msg/sec cap → global
 *     bot rate-limit ban
 *   - `parse_mode: 'Markdown'` swapped → `*Signal Alert*` renders raw
 *   - Confidence gate removed → low-confidence signals spam subscribers
 *   - sendAdminAlert TELEGRAM_CHAT_ID fallback chain broken → drawdown
 *     breach alert silently dropped
 *
 * Unlike the 61 prior edges (45 families):
 *   - #198 calls `telegramSignalPusher.enqueue` after DB save.
 *   - #202 tier-filter supplies minConfidence via TIER_SIGNAL_CONFIG.
 *   - #196 drawdown-monitor calls `sendAdminAlert` on breach.
 *   - **NEW family #46: TELEGRAMSIGNALPUSHER PRIMITIVE DISCIPLINE.**
 *     Eighth signal-pipeline substrate edge.
 *
 * The invariant is declared across 1 file × 10 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **THROTTLE_MS per-tier map** — FREE=24h, PRO=1h, ENTERPRISE=5s.
 *   3. **botToken fallback**: constructor arg → env
 *      `TELEGRAM_BOT_TOKEN` → empty string.
 *   4. **formatSignal** — includes `*Signal Alert*`, confidence as %,
 *      TTL in minutes, 8-char ID slice.
 *   5. **enqueue eligibility gate** — `sub.active && sub.chatId` AND
 *      `signal.confidence >= TIER_SIGNAL_CONFIG[tier].minConfidence`
 *      AND `Date.now() - last >= throttle`.
 *   6. **Queue + flushing flag** — `flushQueue` early-return if
 *      `this.flushing || this.queue.length === 0`.
 *   7. **50ms pacing between sends** — `setTimeout(r, 50)` in the
 *      flush loop (Telegram global 30 msg/sec cap).
 *   8. **sendMessage uses Telegram Bot API** — `https://api.telegram.org/bot${token}/sendMessage`
 *      + POST JSON with `chat_id + text + parse_mode: 'Markdown'`.
 *   9. **sendAdminAlert: env TELEGRAM_CHAT_ID + parseInt validation** —
 *      returns false if missing or NaN.
 *  10. **Singleton export** — `export const telegramSignalPusher = new
 *      TelegramSignalPusher()`.
 *
 * Novel invariants locked (family #46):
 *   - **Per-tier throttle map** — revenue-tier semantic encoded as
 *     (24h, 1h, 5s). Flip breaks Telegram rate-limit or revenue tier.
 *   - **Pacing constant** — 50ms ≈ 20 msg/sec, well under 30 msg/sec.
 *   - **Confidence gate re-application** — matches tier-filter
 *     (#202) — double-gate defense.
 *   - **Markdown parse mode** — locks rendering contract.
 *
 * Drift scenarios covered:
 *   - ENTERPRISE throttle bumped to 1ms "faster push" → case 2 fails
 *     (Telegram bans bot).
 *   - 50ms delay removed → case 7 fails (rate-limit blow-out).
 *   - `parse_mode: 'Markdown'` dropped → case 8 fails (raw `*` text).
 *   - `sub.chatId` guard removed → case 5 fails (undefined chat_id to
 *     Telegram API).
 *
 * Symmetric to prior integrity edges:
 *   #196 TRIPENTACONTAGON drawdown-monitor (consumer of
 *   sendAdminAlert).
 *   #198 PENTAPENTACONTAGON SignalPublisher (calls enqueue).
 *   #202 ENNEAPENTACONTAGON SignalTierFilter (supplies minConfidence).
 *
 * Opens the **62nd integrity edge — DIHEXACONTAGON** (62-gon). Eighth
 * signal-pipeline substrate edge. Novel family #46. Integrity
 * henihexacontagon → dihexacontagon (62-gon).
 *
 * Non-goals: HTTP mock integration (out of scope); Telegram API
 * retry/backoff (operational layer); chat_id authorization (admin
 * surface).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const TG_FILE = resolve(REPO_ROOT, 'src/signal/telegram-signal-pusher.ts');

function readTg(): string {
  return readFileSync(TG_FILE, 'utf8');
}

describe('TelegramSignalPusher primitive discipline — 62nd edge (DIHEXACONTAGON)', () => {
  const src = readTg();

  it('telegram-signal-pusher.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(1000);
  });

  it('THROTTLE_MS per-tier map: FREE=24h, PRO=1h, ENTERPRISE=5s', () => {
    expect(
      /THROTTLE_MS\s*:\s*Record<TierKey\s*,\s*number>/.test(src),
      'THROTTLE_MS must be typed `Record<TierKey, number>`',
    ).toBe(true);
    expect(
      /FREE\s*:\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(src) ||
        /FREE\s*:\s*86_?400_?000/.test(src),
      'FREE throttle must be 24h (86_400_000 ms) — daily-digest revenue contract',
    ).toBe(true);
    expect(
      /PRO\s*:\s*60\s*\*\s*60\s*\*\s*1000/.test(src) ||
        /PRO\s*:\s*3_?600_?000/.test(src),
      'PRO throttle must be 1h (3_600_000 ms)',
    ).toBe(true);
    expect(
      /ENTERPRISE\s*:\s*5_?000\b/.test(src),
      'ENTERPRISE throttle must be 5s (5_000 ms) — Telegram API-limit guard',
    ).toBe(true);
  });

  it('botToken fallback chain: ctor arg → process.env.TELEGRAM_BOT_TOKEN → empty string', () => {
    expect(
      /this\.botToken\s*=\s*botToken\s*\?\?\s*process\.env\.TELEGRAM_BOT_TOKEN\s*\?\?\s*['"]{2}/.test(
        src,
      ),
      'botToken fallback must be `botToken ?? process.env.TELEGRAM_BOT_TOKEN ?? ""`',
    ).toBe(true);
  });

  it('formatSignal renders *Signal Alert* + confidence % + TTL minutes + 8-char ID slice', () => {
    expect(
      /\*Signal Alert\*/.test(src),
      'formatSignal must include `*Signal Alert*` Markdown header',
    ).toBe(true);
    expect(
      /\(signal\.confidence\s*\*\s*100\)\.toFixed\(\s*1\s*\)/.test(src),
      'formatSignal must render confidence as `(signal.confidence * 100).toFixed(1)` % — drift breaks subscriber readout',
    ).toBe(true);
    expect(
      /Math\.round\(\s*signal\.ttl\s*\/\s*60\s*\)/.test(src),
      'formatSignal must render TTL as `Math.round(signal.ttl / 60)` minutes',
    ).toBe(true);
    expect(
      /signal\.id\.slice\(\s*0\s*,\s*8\s*\)/.test(src),
      'formatSignal must slice ID to first 8 chars',
    ).toBe(true);
  });

  it('enqueue eligibility gate: active + chatId + confidence >= minConfidence + throttle', () => {
    const startIdx = src.indexOf('enqueue(signal: Signal, sub: SignalSubscription)');
    const endIdx = src.indexOf('private async flushQueue', startIdx);
    expect(startIdx, 'enqueue method missing').toBeGreaterThan(-1);
    const body = src.slice(startIdx, endIdx);
    expect(
      /if\s*\(\s*!sub\.active\s*\|\|\s*!sub\.chatId\s*\)\s*return/.test(body),
      'enqueue must early-return on `!sub.active || !sub.chatId`',
    ).toBe(true);
    expect(
      /signal\.confidence\s*<\s*config\.minConfidence/.test(body),
      'enqueue must guard `signal.confidence < config.minConfidence`',
    ).toBe(true);
    expect(
      /Date\.now\(\)\s*-\s*last\s*<\s*throttle/.test(body),
      'enqueue must guard `Date.now() - last < throttle`',
    ).toBe(true);
    expect(
      /this\.lastPush\.set\(\s*sub\.chatId\s*,\s*Date\.now\(\)\s*\)/.test(body),
      'enqueue must record lastPush timestamp for throttle tracking',
    ).toBe(true);
  });

  it('flushQueue: early-return guard + sequential drain', () => {
    const startIdx = src.indexOf('private async flushQueue');
    const endIdx = src.indexOf('async sendMessage', startIdx);
    const body = src.slice(startIdx, endIdx);
    expect(
      /if\s*\(\s*this\.flushing\s*\|\|\s*this\.queue\.length\s*===\s*0\s*\)\s*return/.test(body),
      'flushQueue must early-return if already flushing or queue empty',
    ).toBe(true);
    expect(
      /this\.flushing\s*=\s*true/.test(body) && /this\.flushing\s*=\s*false/.test(body),
      'flushQueue must toggle this.flushing true/false around loop',
    ).toBe(true);
  });

  it('50ms pacing between sends (Telegram 30 msg/sec global cap)', () => {
    expect(
      /setTimeout\(\s*r\s*,\s*50\s*\)/.test(src),
      '50ms pacing `setTimeout(r, 50)` missing in flush loop — Telegram 30 msg/sec cap blow-out',
    ).toBe(true);
  });

  it('sendMessage: Bot API URL + POST JSON body + parse_mode Markdown', () => {
    expect(
      /https:\/\/api\.telegram\.org\/bot\$\{this\.botToken\}\/sendMessage/.test(src),
      'sendMessage URL must be https://api.telegram.org/bot${token}/sendMessage',
    ).toBe(true);
    expect(
      /method\s*:\s*['"]POST['"]/.test(src),
      'sendMessage must use POST method',
    ).toBe(true);
    expect(
      /chat_id\s*:\s*chatId\s*,\s*text\s*,\s*parse_mode\s*:\s*['"]Markdown['"]/.test(src),
      'sendMessage body must include `{chat_id, text, parse_mode: "Markdown"}`',
    ).toBe(true);
  });

  it('sendAdminAlert: TELEGRAM_CHAT_ID env + parseInt validation + fallback', () => {
    const startIdx = src.indexOf('async sendAdminAlert');
    const endIdx = src.indexOf('get queueLength', startIdx);
    const body = src.slice(startIdx, endIdx);
    expect(
      /process\.env\.TELEGRAM_CHAT_ID/.test(body),
      'sendAdminAlert must read TELEGRAM_CHAT_ID env',
    ).toBe(true);
    expect(
      /return\s+false/.test(body),
      'sendAdminAlert must return false when not configured',
    ).toBe(true);
    expect(
      /parseInt\(\s*chatIdRaw\s*,\s*10\s*\)/.test(body),
      'sendAdminAlert must parseInt(chatIdRaw, 10)',
    ).toBe(true);
    expect(
      /isNaN\(\s*chatId\s*\)/.test(body),
      'sendAdminAlert must guard isNaN(chatId) — invalid env value protection',
    ).toBe(true);
  });

  it('singleton export: `export const telegramSignalPusher = new TelegramSignalPusher()`', () => {
    expect(
      /export\s+const\s+telegramSignalPusher\s*=\s*new\s+TelegramSignalPusher\(\s*\)/.test(src),
      'singleton export missing — #198 SignalPublisher import would fail',
    ).toBe(true);
  });

  it('composite: 10 axes hold simultaneously (telegram pusher coherence)', () => {
    expect(/THROTTLE_MS\s*:\s*Record<TierKey\s*,\s*number>/.test(src)).toBe(true);
    expect(/ENTERPRISE\s*:\s*5_?000\b/.test(src)).toBe(true);
    expect(/this\.botToken\s*=\s*botToken\s*\?\?\s*process\.env\.TELEGRAM_BOT_TOKEN\s*\?\?\s*['"]{2}/.test(src)).toBe(true);
    expect(/\*Signal Alert\*/.test(src)).toBe(true);
    expect(/setTimeout\(\s*r\s*,\s*50\s*\)/.test(src)).toBe(true);
    expect(/parse_mode\s*:\s*['"]Markdown['"]/.test(src)).toBe(true);
    expect(/process\.env\.TELEGRAM_CHAT_ID/.test(src)).toBe(true);
    expect(/isNaN\(\s*chatId\s*\)/.test(src)).toBe(true);
    expect(/export\s+const\s+telegramSignalPusher\s*=\s*new\s+TelegramSignalPusher/.test(src)).toBe(true);
  });
});
