/**
 * Gate State
 *
 * Persists gate evaluation state and tracks history of gate transitions.
 * Uses in-memory store by default; can be swapped for KV/D1 in production.
 */

import type { GateId, GateStatus, GateTransition, PromotionReadiness } from './gate-types';

// ── Storage Interface ──────────────────────────────────────────────────────────

export interface GateStateStore {
  /** Load the most recent evaluation */
  loadLatest(): PromotionReadiness | null;
  /** Save a new evaluation */
  save(reading: PromotionReadiness): void;
  /** Load transition history for a specific gate */
  loadTransitions(gateId: GateId): GateTransition[];
  /** Append a transition event */
  appendTransition(transition: GateTransition): void;
}

// ── In-Memory Store ────────────────────────────────────────────────────────────

export class InMemoryGateStateStore implements GateStateStore {
  private latest: PromotionReadiness | null = null;
  private transitions: GateTransition[] = [];

  loadLatest(): PromotionReadiness | null {
    return this.latest;
  }

  save(reading: PromotionReadiness): void {
    this.latest = reading;
  }

  loadTransitions(gateId: GateId): GateTransition[] {
    return this.transitions.filter((t) => t.gateId === gateId);
  }

  appendTransition(transition: GateTransition): void {
    this.transitions.push(transition);
  }
}

// ── Transition Detection ───────────────────────────────────────────────────────

/**
 * Compare two evaluations and return gate transitions (fail->pass or pass->fail).
 */
export function detectTransitions(
  previous: PromotionReadiness,
  current: PromotionReadiness,
): GateTransition[] {
  const transitions: GateTransition[] = [];
  const now = new Date().toISOString();

  for (const currGate of current.gates) {
    const prevGate = previous.gates.find((g) => g.id === currGate.id);
    if (!prevGate) continue;
    if (prevGate.passed === currGate.passed) continue;

    transitions.push({
      gateId: currGate.id,
      wasPassed: prevGate.passed,
      nowPassed: currGate.passed,
      value: currGate.currentValue,
      timestamp: now,
    });
  }

  return transitions;
}

/**
 * Store evaluation and persist any detected transitions.
 */
export function recordEvaluation(
  store: GateStateStore,
  reading: PromotionReadiness,
): GateTransition[] {
  const previous = store.loadLatest();
  store.save(reading);

  if (!previous) return [];

  const transitions = detectTransitions(previous, reading);
  for (const t of transitions) {
    store.appendTransition(t);
  }
  return transitions;
}
