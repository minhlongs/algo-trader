/**
 * Vibe Controller — NATS-based runtime mode switcher.
 * Subscribes to `vibe.command`, persists to Redis `vibe:state`, publishes `vibe.state.updated`.
 * Multi-instance safety: WATCH/MULTI/EXEC CAS prevents lost updates across PM2 instances.
 */

import { createMessageBus } from '../../shared/messaging/create-message-bus';
import { logger } from '../../shared/utils/logger';
import {
  type VibeState,
  type VibeCommand,
  VIBE_TOPICS,
  BALANCED_DEFAULTS,
} from './vibe-controller-types';
import {
  applyCommandToState,
  loadStateFromRedis,
  persistStateWithCAS,
} from './vibe-controller-cas';

export * from './vibe-controller-types';
export { applyCommandToState, loadStateFromRedis, persistStateWithCAS } from './vibe-controller-cas';

let currentState: VibeState = { ...BALANCED_DEFAULTS };

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
  const loaded = await loadStateFromRedis();
  if (loaded) {
    currentState = loaded;
  }

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
