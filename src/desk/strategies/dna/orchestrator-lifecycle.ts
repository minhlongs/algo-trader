import type { DnaLifecycleEvent, DnaLifecycleListener } from './multi-tf-types';
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
