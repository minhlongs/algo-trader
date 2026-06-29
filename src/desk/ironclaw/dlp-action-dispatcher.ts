/**
 * DLP Action Dispatcher
 * Maps a DlpAction to the concrete handling strategy for a single egress call.
 * Returns a typed decision for the fetch proxy to act on.
 */

import type { DlpAction } from './dlp-pattern-registry';

export type DispatchDecision =
  | { decision: 'allow' }
  | { decision: 'redact' }
  | { decision: 'block';  reason: string }
  | { decision: 'alert' };

export class DlpBlockedError extends Error {
  constructor(
    public readonly patternId: string,
    public readonly url: string,
  ) {
    super(`IronClaw: outbound call BLOCKED by pattern "${patternId}" → ${url}`);
    this.name = 'DlpBlockedError';
  }
}

/**
 * Resolve the dispatch decision for a given action + context.
 * Throws DlpBlockedError for 'block' so the proxy can propagate it upward.
 */
export function dispatch(
  action: DlpAction,
  patternId: string,
  url: string,
): DispatchDecision {
  switch (action) {
    case 'allow':
      return { decision: 'allow' };

    case 'redact':
      return { decision: 'redact' };

    case 'alert':
      // Allow the call through but signal an alert should be emitted.
      return { decision: 'alert' };

    case 'block':
      throw new DlpBlockedError(patternId, url);

    default: {
      // Exhaustive check — TypeScript will warn if a new action is added.
      const _never: never = action;
      throw new Error(`Unknown DLP action: ${String(_never)}`);
    }
  }
}

/**
 * Convenience: decide whether the proxied body/headers should be mutated.
 */
export function requiresRedaction(decision: DispatchDecision): boolean {
  return decision.decision === 'redact' || decision.decision === 'alert';
}
