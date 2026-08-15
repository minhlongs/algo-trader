/**
 * Tiered Drawdown Breaker — disk persistence
 * Extracted from tiered-drawdown-breaker.ts for modularity
 */

import { writeJsonState, cashclawPath } from '../persistence/file-store';
import * as fs from 'node:fs';
import { logger } from '../utils/logger';
import type { DrawdownPersistedState, DrawdownEvent } from './tiered-drawdown-types';

interface DeferredWrite { data: DrawdownPersistedState; timer: ReturnType<typeof setTimeout> | null; }

/** Build a persisted state snapshot from class fields */
export function buildPersistedState(
  highWaterMark: number, currentValue: number, tier: string,
  haltedUntil: number | null, dailyPausedUntil: number | null,
  dailyStartValue: number, dailyPnl: number, events: DrawdownEvent[],
): DrawdownPersistedState {
  return { highWaterMark, currentValue, tier: tier as DrawdownPersistedState['tier'], haltedUntil, dailyPausedUntil, dailyStartValue, dailyPnl, events };
}

/** Schedule a deferred write (500ms debounce) */
export function scheduleDeferredWrite(dw: DeferredWrite, state: DrawdownPersistedState): void {
  if (dw.timer) clearTimeout(dw.timer);
  dw.timer = setTimeout(() => {
    dw.timer = null;
    try { writeJsonState(cashclawPath('drawdown-state.json'), state); }
    catch (err) { logger.error('[TieredDrawdown] Failed to save state to disk:', err); }
  }, 500);
}

/** Load persisted state from disk (best-effort) */
export function loadPersistedState(): DrawdownPersistedState | null {
  try {
    const filePath = cashclawPath('drawdown-state.json');
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as DrawdownPersistedState;
  } catch (err) {
    logger.warn('[TieredDrawdown] No existing state file found or failed to parse:', err);
    return null;
  }
}
