/**
 * Vibe Controller CAS — Redis optimistic locking & command reducer.
 */

import { getRedisClient } from '../../redis/index';
import { logger } from '../../shared/utils/logger';
import {
  type TradingMode,
  type VibeState,
  type VibeCommand,
  REDIS_KEY,
  CAS_MAX_RETRIES,
  MODE_PRESETS,
  BALANCED_DEFAULTS,
} from './vibe-controller-types';

/** Pure — apply a command to a state; returns the same reference if the command is invalid. */
export function applyCommandToState(state: VibeState, cmd: VibeCommand): VibeState {
  const next: VibeState = { ...state, updatedAt: Date.now(), updatedBy: cmd.source };
  switch (cmd.action) {
    case 'set-mode': {
      const mode = cmd.payload.mode as TradingMode;
      if (!MODE_PRESETS[mode]) { logger.warn('[VibeController] Unknown mode', { mode }); return state; }
      next.mode = mode; Object.assign(next, MODE_PRESETS[mode]); break;
    }
    case 'filter-markets':
      next.marketFilter = (cmd.payload.filter as string) ?? null; break;
    case 'pause-market': {
      const id = cmd.payload.marketId as string;
      if (id && !next.pausedMarkets.includes(id)) next.pausedMarkets = [...next.pausedMarkets, id]; break;
    }
    case 'resume-market':
      next.pausedMarkets = next.pausedMarkets.filter((m) => m !== (cmd.payload.marketId as string)); break;
    case 'set-param': {
      const param = cmd.payload.param as keyof VibeState;
      if (!(param in next)) { logger.warn('[VibeController] Unknown param', { param }); return state; }
      (next as unknown as Record<string, unknown>)[param] = cmd.payload.value; break;
    }
    default:
      logger.warn('[VibeController] Unknown action', { action: cmd.action }); return state;
  }
  return next;
}

export async function loadStateFromRedis(): Promise<VibeState | null> {
  try {
    const raw = await getRedisClient().get(REDIS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as VibeState;
      const loaded = { ...parsed, version: parsed.version ?? 0 };
      logger.info('[VibeController] Loaded state from Redis', { mode: loaded.mode, version: loaded.version });
      return loaded;
    }
    logger.info('[VibeController] No saved state; using balanced defaults');
    return null;
  } catch (err) {
    logger.warn('[VibeController] Redis unavailable; using balanced defaults', { err });
    return null;
  }
}

/**
 * Persist state with WATCH/MULTI/EXEC CAS to prevent lost updates across PM2 instances.
 * On EXEC conflict (null result), reloads Redis state, re-applies the command, and retries.
 * Returns the final committed state. Falls back to best-effort after CAS_MAX_RETRIES.
 */
export async function persistStateWithCAS(next: VibeState, cmd: VibeCommand): Promise<VibeState> {
  const redis = getRedisClient();
  let attempt = 0;
  let base = next.version - 1;

  while (attempt < CAS_MAX_RETRIES) {
    attempt++;
    try {
      await redis.watch(REDIS_KEY);
      const raw = await redis.get(REDIS_KEY);
      const parsed = raw ? JSON.parse(raw) as VibeState : null;
      const stored: VibeState | null = parsed ? { ...parsed, version: parsed.version ?? 0 } : null;
      const storedVersion = stored?.version ?? 0;

      if (storedVersion !== base) {
        await redis.unwatch();
        const rebased = stored ?? { ...BALANCED_DEFAULTS };
        const reapplied = applyCommandToState(rebased, cmd);
        base = storedVersion;
        next = { ...reapplied, version: storedVersion + 1 };
        continue;
      }

      const pipeline = redis.multi();
      pipeline.set(REDIS_KEY, JSON.stringify({ ...next, version: base + 1 }));
      const results = await pipeline.exec();

      if (results === null) {
        const reloadRaw = await redis.get(REDIS_KEY);
        const reloadParsed = reloadRaw ? JSON.parse(reloadRaw) as VibeState : null;
        const reloaded: VibeState = reloadParsed ? { ...reloadParsed, version: reloadParsed.version ?? 0 } : { ...BALANCED_DEFAULTS };
        base = reloaded.version;
        const reapplied = applyCommandToState(reloaded, cmd);
        next = { ...reapplied, version: base + 1 };
        continue;
      }

      return { ...next, version: base + 1 };
    } catch (err) {
      logger.warn('[VibeController] CAS attempt failed', { attempt, err });
      try { await redis.unwatch(); } catch { /* ignore */ }
      break;
    }
  }

  logger.warn('[VibeController] CAS max retries exceeded; state may be stale', { retries: attempt });
  return next;
}
