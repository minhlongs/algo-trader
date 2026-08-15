/**
 * Kronos Sidecar Health Monitor
 * Periodically checks AlphaEar sidecar health and exposes status
 * for pipeline integration. Logs state transitions for observability.
 *
 * Env:
 *   ALPHAEAR_SIDECAR_URL → sidecar base URL (default: http://localhost:8100)
 *   KRONOS_HEALTH_CHECK_INTERVAL_MS → check interval (default: 60000)
 */

import { alphaear } from './alphaear-client';
import type { SidecarHealth } from './alphaear-client';
import { logger } from '../../shared/utils/logger';

const CHECK_INTERVAL_MS = Number(process.env.KRONOS_HEALTH_CHECK_INTERVAL_MS ?? 60_000);

let _healthy = false;
let _lastHealth: SidecarHealth | null = null;
let _checkTimer: ReturnType<typeof setInterval> | null = null;
let _started = false;

/** Current health status (read-only getter) */
export function isSidecarHealthy(): boolean {
  return _healthy;
}

/** Last successful health response (or null) */
export function getLastHealth(): SidecarHealth | null {
  return _lastHealth;
}

/** One-shot health check — returns true if sidecar is reachable */
export async function checkSidecarHealth(): Promise<boolean> {
  try {
    const health = await alphaear.checkHealth();
    const wasHealthy = _healthy;
    _healthy = health !== null;
    _lastHealth = health;

    if (_healthy && !wasHealthy) {
      logger.info('[KronosMonitor] Sidecar recovered', {
        kronosLoaded: health?.kronos_loaded,
        finbertLoaded: health?.finbert_loaded,
        newsSources: health?.news_sources,
      });
    } else if (!_healthy && wasHealthy) {
      logger.warn('[KronosMonitor] Sidecar went unhealthy');
    }

    return _healthy;
  } catch {
    const wasHealthy = _healthy;
    _healthy = false;
    if (wasHealthy) {
      logger.warn('[KronosMonitor] Sidecar health check failed');
    }
    return false;
  }
}

/** Start periodic health checks */
export function startSidecarMonitor(): void {
  if (_started) return;
  _started = true;

  logger.info('[KronosMonitor] Starting periodic health checks', {
    intervalMs: CHECK_INTERVAL_MS,
  });

  // Run immediately, then on interval
  checkSidecarHealth().catch(() => { /* logged internally */ });
  _checkTimer = setInterval(() => {
    checkSidecarHealth().catch(() => { /* logged internally */ });
  }, CHECK_INTERVAL_MS);
}

/** Stop periodic health checks */
export function stopSidecarMonitor(): void {
  if (_checkTimer) {
    clearInterval(_checkTimer);
    _checkTimer = null;
  }
  _started = false;
  logger.info('[KronosMonitor] Stopped');
}
