/**
 * Cross-Event Drift V2 — Barrel facade for backward compatibility.
 *
 * When one market in an event group moves significantly, other correlated
 * markets should follow. Catches the "drift" — trades the lagging market
 * expecting it to catch up to the leader. Uses gamma.getEvents().
 *
 * Custom exit: convergence (laggard caught up to >=50% of leader's move).
 */

import { CrossEventDriftStrategy } from './cross-event-drift-strategy';
import type { CrossEventDriftDeps } from './cross-event-drift-types';

export * from './cross-event-drift-types';
export * from './cross-event-drift-math';
export * from './cross-event-drift-strategy';

export function createCrossEventDriftTick(deps: CrossEventDriftDeps): () => Promise<void> {
  const { kellySizer, config, ...baseDeps } = deps;
  const strategy = new CrossEventDriftStrategy(baseDeps, config, kellySizer);
  return strategy.toTickFn();
}
