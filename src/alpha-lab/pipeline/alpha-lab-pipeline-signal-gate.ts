/**
 * Signal Lifecycle Gate
 *
 * Pre-routing rejection of signals whose strategy is retired or quarantined.
 * Extracted from signal routing so the lifecycle-ineligibility rules (and their
 * human-readable reasons) are testable without a router or state map wiring.
 */

import type { AlphaLifecycleStateMachine } from '../attribution/alpha-lifecycle-state-machine';
import type { AISignal } from '../../desk/strategies/ai-signal-adapter';
import type { SignalRoutingOutcome } from '../../desk/strategies/ai-signal-paper-router';

/** Reason text shown when a signal was rejected on lifecycle grounds. */
const QUARANTINE_REASON = 'Strategy is quarantined by drawdown circuit breaker';
const RETIRED_REASON = 'Strategy is in RETIRED state: Strategy is quarantined by drawdown circuit breaker';

/**
 * Build the rejection outcome for a signal whose strategy must not trade, or
 * null when the strategy is eligible.
 *
 * Retired and quarantined strategies are surfaced with distinct reasons because
 * they are remediated differently — quarantine needs a new observation window,
 * retirement needs a promotion decision.
 */
export function rejectIneligibleSignal(
  signal: AISignal,
  sm: AlphaLifecycleStateMachine,
  symbol: string,
  marketPrice: number,
): SignalRoutingOutcome | null {
  if (!sm.isRetired() && !sm.isQuarantined()) return null;

  const isQuarantined = sm.isQuarantined();
  const reason = isQuarantined ? QUARANTINE_REASON : RETIRED_REASON;

  return {
    status: 'REJECTED',
    signal,
    symbol,
    marketPrice,
    validation: { valid: false, signal, rejectionReasons: [reason] },
    reason,
    timestamp: Date.now(),
  };
}
