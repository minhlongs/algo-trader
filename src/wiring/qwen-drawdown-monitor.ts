/**
 * Qwen Drawdown Monitor — L3 rollback layer.
 * Scheduled check (default 6h) of Qwen paper P&L in rolling 24h window.
 * If drawdown > QWEN_DRAWDOWN_MAX_PCT (default 5%) → auto-disable swarm persona
 * + set in-memory SWARM_QWEN_ENABLED=0 + send Telegram admin alert.
 *
 * Singleton: start()/stop()/reset() for test isolation.
 */

import { query } from '../db/postgres-client';
import { telegramSignalPusher } from '../signal/telegram-signal-pusher';
import { logger } from '../utils/logger';
import {
  qwenPaperPnlPct,
  setQwenKillSwitch,
  setQwenDrawdownAutoDisabled,
  qwenDrawdownMonitorLastRunTs,
} from '../middleware/prometheus-metrics';
import { getTracer } from '../utils/tracing';

/** Default check interval: 6 hours */
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Rolling window for P&L calculation */
const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;

/** In-memory kill flag — set by drawdown breach or L1 kill switch */
let _qwenEnabled = true;
/** Timestamp of last breach — for 6h cooldown before re-enable */
let _lastBreachAt: number | null = null;
let _timer: ReturnType<typeof setInterval> | null = null;

/** Read QWEN_DRAWDOWN_MAX_PCT from env, default 5% */
function getDrawdownThreshold(): number {
  const raw = process.env.QWEN_DRAWDOWN_MAX_PCT;
  const parsed = raw ? parseFloat(raw) : 5;
  return isNaN(parsed) ? 5 : parsed;
}

/** Check QWEN_KILL KV/env flag (L1 kill switch) */
export function isKillSwitchActive(): boolean {
  return process.env.QWEN_KILL === '1';
}

/** L2: check in-memory swarm enabled flag */
export function isQwenEnabled(): boolean {
  if (isKillSwitchActive()) return false;
  return _qwenEnabled;
}

/** L2: programmatic disable (used by drawdown breach + admin kill route) */
export function disableQwen(reason: string): void {
  _qwenEnabled = false;
  _lastBreachAt = Date.now();
  setQwenDrawdownAutoDisabled(true);
  logger.warn('[QwenDrawdown] Qwen swarm DISABLED', { reason });
}

/** Re-enable (manual only — requires human action via admin API) */
export function enableQwen(): void {
  _qwenEnabled = true;
  _lastBreachAt = null;
  setQwenDrawdownAutoDisabled(false);
  logger.info('[QwenDrawdown] Qwen swarm RE-ENABLED by admin');
}

/** Get breach timestamp for status reporting */
export function getLastBreachAt(): number | null {
  return _lastBreachAt;
}

/**
 * Compute rolling 24h P&L for a given source from paper_trades_v3.
 * Returns pnl_pct as a decimal (e.g. -0.06 = -6%).
 * Returns null if no closed trades in window (no breach possible).
 */
export async function computeRollingPnl(
  source: string,
  windowMs = ROLLING_WINDOW_MS
): Promise<{ pnlPct: number | null; totalSize: number; totalPnl: number }> {
  const windowStart = Date.now() - windowMs;

  try {
    const result = await query<{ total_size: number | null; total_pnl: number | null }>(
      `SELECT
         COALESCE(SUM(size_usd), 0)  AS total_size,
         COALESCE(SUM(pnl), 0)       AS total_pnl
       FROM paper_trades_v3
       WHERE source = $1
         AND status = 'closed'
         AND closed_at >= $2`,
      [source, windowStart]
    );

    const totalSize = Number(result.rows[0]?.total_size ?? 0);
    const totalPnl = Number(result.rows[0]?.total_pnl ?? 0);

    if (totalSize === 0) {
      return { pnlPct: null, totalSize: 0, totalPnl: 0 };
    }

    return { pnlPct: totalPnl / totalSize, totalSize, totalPnl };
  } catch (err) {
    logger.error('[QwenDrawdown] computeRollingPnl DB error', { err });
    return { pnlPct: null, totalSize: 0, totalPnl: 0 };
  }
}

/**
 * Run a single drawdown check cycle.
 * Called by the scheduler and exposed for tests.
 */
export async function runDrawdownCheck(): Promise<void> {
  return getTracer().startActiveSpan('qwen.drawdown.check', async (span) => {
    // Freshness gauge — set at the top, before any guard, so even the
    // kill-switch/no-trades early-return paths still prove the timer is alive.
    // Complements the state gauges (qwenPaperPnlPct, qwenDrawdownAutoDisabled)
    // which reflect logic outcome rather than timer liveness.
    qwenDrawdownMonitorLastRunTs.set(Math.floor(Date.now() / 1000));

    // Reflect L1 kill-switch env state in Prom gauge every cycle
    setQwenKillSwitch('env', isKillSwitchActive());

    if (!isQwenEnabled()) {
      span.setAttribute('qwen.enabled', false);
      logger.debug('[QwenDrawdown] Already disabled — skip check');
      return;
    }

    const threshold = getDrawdownThreshold() / 100; // convert pct to decimal
    const { pnlPct, totalSize, totalPnl } = await computeRollingPnl('qwen');

    if (pnlPct === null) {
      span.setAttribute('qwen.drawdown.skip_reason', 'no_trades_in_window');
      logger.debug('[QwenDrawdown] No closed Qwen trades in window — skip');
      return;
    }

    // Emit Prometheus gauge — visible to Grafana alerting
    qwenPaperPnlPct.set(pnlPct);
    span.setAttribute('qwen.pnl_pct', pnlPct);

    logger.info('[QwenDrawdown] 24h P&L check', {
      pnlPct: (pnlPct * 100).toFixed(2) + '%',
      totalSize,
      totalPnl,
      threshold: (threshold * 100).toFixed(0) + '%',
    });

    if (pnlPct <= -threshold) {
      const msg =
        `[ALERT] Qwen paper drawdown breached: ` +
        `${(pnlPct * 100).toFixed(2)}% (threshold -${(threshold * 100).toFixed(0)}%). ` +
        `Auto-disabling Qwen swarm. Manual re-enable required.`;

      disableQwen(`drawdown ${(pnlPct * 100).toFixed(2)}%`);
      span.setAttribute('qwen.drawdown.breach', true);

      // Send Telegram admin alert (non-blocking)
      try {
        await telegramSignalPusher.sendAdminAlert(msg);
      } catch (alertErr) {
        logger.warn('[QwenDrawdown] Telegram alert failed', { alertErr });
      }
    }
  });
}

/**
 * Start the scheduled drawdown monitor.
 * Safe to call multiple times — only one timer runs at a time.
 */
export function startDrawdownMonitor(intervalMs = DEFAULT_INTERVAL_MS): void {
  if (_timer) return; // already running

  // Pre-arm the freshness gauge at startup so QwenDrawdownMonitorStale does not
  // page for the full 6h cron interval after every deploy. The gauge will be
  // refreshed on the first real cycle; deadman-switch already covers the
  // pre-init process-death case, so no liveness coverage is lost.
  qwenDrawdownMonitorLastRunTs.set(Math.floor(Date.now() / 1000));

  logger.info('[QwenDrawdown] Monitor started', { intervalMs });
  _timer = setInterval(() => {
    runDrawdownCheck().catch((err) =>
      logger.error('[QwenDrawdown] Unhandled error in check cycle', { err })
    );
  }, intervalMs);

  // Allow process to exit even if timer is active
  if (_timer.unref) _timer.unref();
}

/** Stop the monitor (for graceful shutdown and tests) */
export function stopDrawdownMonitor(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    logger.debug('[QwenDrawdown] Monitor stopped');
  }
}

/**
 * Reset internal state — for test isolation only.
 * Restores enabled=true and clears breach timestamp.
 */
export function resetDrawdownMonitorState(): void {
  _qwenEnabled = true;
  _lastBreachAt = null;
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
