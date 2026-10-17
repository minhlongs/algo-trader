import {
  type DnaLifecycleEvent,
  type DnaLifecycleListener,
  type TfId,
  type TfSignal,
  type RegimeSnapshot,
  type ConsensusSignal,
  TF_RESOLUTIONS,
} from './multi-tf-types';
import type { DnaEngineState } from './dna-state-store';
import { logger } from '../../utils/logger';

const _listeners: Set<DnaLifecycleListener> = new Set();

/**
 * Emit a lifecycle event safely across all registered listeners.
 */
export function emitDnaLifecycleEvent(ev: DnaLifecycleEvent): void {
  for (const fn of _listeners) {
    try {
      fn(ev);
    } catch (err) {
      logger.error('[DNA] listener error', { err });
    }
  }
}

/**
 * Subscribe to lifecycle events (returns unsubscribe function).
 */
export function onDnaEvent(fn: DnaLifecycleListener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/**
 * Emit a lifecycle event to all registered listeners (used by paper-executor).
 */
export function emitDnaEvent(ev: DnaLifecycleEvent): void {
  _listeners.forEach((fn) => fn(ev));
}

/**
 * Hydrate persisted engine state into in-memory structures.
 */
export function hydrateEngineState(
  state: DnaEngineState,
  lastTfSignals: Map<TfId, TfSignal>,
): { traceCounter: number; lastRegime: RegimeSnapshot | null; lastConsensus: ConsensusSignal | null } {
  const traceCounter = state.schemaVersion ? state.traceCounter : 0;
  if (state.lastTfSignals) {
    for (const [tf, sig] of state.lastTfSignals as [TfId, TfSignal][]) {
      lastTfSignals.set(tf, sig);
    }
  }
  return {
    traceCounter,
    lastRegime: state.lastRegime ?? null,
    lastConsensus: state.lastConsensus ?? null,
  };
}

/**
 * Build a serializable state snapshot for persistence on engine stop.
 */
export function buildEngineStateSnapshot(
  traceCounter: number,
  lastTfSignals: Map<TfId, TfSignal>,
  lastRegime: RegimeSnapshot | null,
  lastConsensus: ConsensusSignal | null,
): DnaEngineState {
  const tfArr: [TfId, TfSignal][] = [];
  for (const [k, v] of lastTfSignals) tfArr.push([k, v]);
  return {
    schemaVersion: '2026-06-01-v1',
    savedAt: Date.now(),
    traceCounter,
    lastTfSignals: tfArr,
    lastRegime,
    lastConsensus,
  };
}

/**
 * Schedule timeframe boundary timers for all configured TFs.
 */
export function scheduleTfTimers(
  tfOrder: TfId[],
  timers: Map<TfId, NodeJS.Timeout>,
  onTick: (tf: TfId) => void,
): void {
  for (const tf of tfOrder) {
    const intervalMs = TF_RESOLUTIONS[tf];
    const now = Date.now();
    const boundaryMs = intervalMs - (now % intervalMs);
    const initialDelay = tf === '1m' ? Math.min(boundaryMs, 5_000) : boundaryMs;
    const timer = setTimeout(() => {
      const recurring = setInterval(() => onTick(tf), intervalMs);
      timers.set(tf, recurring);
      onTick(tf);
    }, initialDelay);
    timers.set(tf, timer);
  }
}

/**
 * Clear all scheduled timeframe timers.
 */
export function clearTfTimers(timers: Map<TfId, NodeJS.Timeout>): void {
  for (const [, timer] of timers) {
    clearTimeout(timer);
    clearInterval(timer);
  }
  timers.clear();
}
