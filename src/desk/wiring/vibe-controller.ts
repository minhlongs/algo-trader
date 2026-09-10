/**
 * Vibe Controller — NATS-based runtime mode switcher.
 * Subscribes to `vibe.command`, persists to Redis `vibe:state`, publishes `vibe.state.updated`.
 * Multi-instance safety: WATCH/MULTI/EXEC CAS prevents lost updates across PM2 instances.
 */

import { createMessageBus } from '../../shared/messaging/create-message-bus';
import { getRedisClient } from '../../redis/index';
import { logger } from '../../shared/utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TradingMode = 'conservative' | 'balanced' | 'aggressive' | 'defensive';

export interface VibeState {
  mode: TradingMode;
  minEdge: number;
  maxExposure: number;
  marketFilter: string | null;
  liquidityFloor: number;
  pausedMarkets: string[];
  updatedAt: number;
  updatedBy: string;
  /** Monotonic counter incremented on every successful write; enables CAS conflict detection */
  version: number;
}

export interface VibeCommand {
  action: 'set-mode' | 'filter-markets' | 'pause-market' | 'resume-market' | 'set-param';
  payload: Record<string, unknown>;
  source: string;
}

// ─── Topics ───────────────────────────────────────────────────────────────────

export const VIBE_TOPICS = {
  COMMAND: 'vibe.command',
  STATE_UPDATED: 'vibe.state.updated',
} as const;

const REDIS_KEY = 'vibe:state';
const CAS_MAX_RETRIES = 3;

// ─── Mode presets ─────────────────────────────────────────────────────────────

const MODE_PRESETS: Record<TradingMode, Pick<VibeState, 'minEdge' | 'maxExposure' | 'liquidityFloor'>> = {
  conservative: { minEdge: 3.0, maxExposure: 10, liquidityFloor: 50_000 },
  balanced:     { minEdge: 2.5, maxExposure: 15, liquidityFloor: 10_000 },
  aggressive:   { minEdge: 1.5, maxExposure: 25, liquidityFloor: 5_000  },
  defensive:    { minEdge: 5.0, maxExposure: 5,  liquidityFloor: 100_000 },
};

const BALANCED_DEFAULTS: VibeState = {
  mode: 'balanced',
  ...MODE_PRESETS.balanced,
  marketFilter: null,
  pausedMarkets: [],
  updatedAt: Date.now(),
  updatedBy: 'system:init',
  version: 0,
};

// ─── Module-level state ───────────────────────────────────────────────────────

let currentState: VibeState = { ...BALANCED_DEFAULTS };

// ─── Redis persistence ────────────────────────────────────────────────────────

async function loadStateFromRedis(): Promise<void> {
  try {
    const raw = await getRedisClient().get(REDIS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as VibeState;
      // Default version to 0 for states persisted before this field was added
      currentState = { ...parsed, version: parsed.version ?? 0 };
      logger.info('[VibeController] Loaded state from Redis', { mode: currentState.mode, version: currentState.version });
    } else {
      logger.info('[VibeController] No saved state; using balanced defaults');
    }
  } catch (err) {
    logger.warn('[VibeController] Redis unavailable; using balanced defaults', { err });
  }
}

/**
 * Persist state with WATCH/MULTI/EXEC CAS to prevent lost updates across PM2 instances.
 * On EXEC conflict (null result), reloads Redis state, re-applies the command, and retries.
 * Returns the final committed state. Falls back to best-effort after CAS_MAX_RETRIES.
 */
async function persistStateWithCAS(next: VibeState, cmd: VibeCommand): Promise<VibeState> {
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
        // Concurrent write detected before EXEC — rebase and retry
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
        // EXEC aborted — reload and retry
        const reloadRaw = await redis.get(REDIS_KEY);
        const reloadParsed = reloadRaw ? JSON.parse(reloadRaw) as VibeState : null;
        const reloaded: VibeState = reloadParsed ? { ...reloadParsed, version: reloadParsed.version ?? 0 } : { ...BALANCED_DEFAULTS };
        base = reloaded.version;
        const reapplied = applyCommandToState(reloaded, cmd);
        next = { ...reapplied, version: base + 1 };
        continue;
      }

      const committed: VibeState = { ...next, version: base + 1 };
      currentState = committed;
      return committed;
    } catch (err) {
      logger.warn('[VibeController] CAS attempt failed', { attempt, err });
      try { await redis.unwatch(); } catch { /* ignore */ }
      break;
    }
  }

  logger.warn('[VibeController] CAS max retries exceeded; state may be stale', { retries: attempt });
  return next;
}

// ─── Command processing ───────────────────────────────────────────────────────

/** Pure — apply a command to a state; returns the same reference if the command is invalid. */
function applyCommandToState(state: VibeState, cmd: VibeCommand): VibeState {
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

// ─── Public API ───────────────────────────────────────────────────────────────

/** Synchronous read — zero latency for hot paths (ILP solver, signal validator) */
export function getVibeState(): VibeState {
  return currentState;
}

/**
 * Initialize the vibe controller.
 * - Loads last known state from Redis (fail-safe: balanced defaults)
 * - Subscribes to `vibe.command` via message bus
 * - Publishes state updates to `vibe.state.updated`
 */
export async function initVibeController(): Promise<void> {
  await loadStateFromRedis();

  const bus = await createMessageBus();

  await bus.subscribe<VibeCommand>(VIBE_TOPICS.COMMAND, async (envelope) => {
    const cmd = envelope.data;
    const proposed = applyCommandToState(currentState, cmd);

    if (proposed === currentState) return; // no-op — invalid command was logged

    const committed = await persistStateWithCAS({ ...proposed, version: currentState.version + 1 }, cmd);
    currentState = committed;

    logger.info('[VibeController] State updated', {
      mode: committed.mode,
      version: committed.version,
      updatedBy: committed.updatedBy,
      marketFilter: committed.marketFilter,
      pausedMarkets: committed.pausedMarkets,
    });

    await bus.publish(VIBE_TOPICS.STATE_UPDATED, committed, 'vibe-controller');
  });

  logger.info('[VibeController] Ready', { mode: currentState.mode });
}
