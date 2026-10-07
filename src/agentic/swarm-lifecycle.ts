/**
 * Swarm Lifecycle Coordinator
 *
 * Coordinates swarm state transitions (INITIALIZED -> ANALYZING -> CONSENSUS -> EXECUTED/TIMED_OUT).
 * Uses unref background timers to prevent hanging Node event loops.
 */

import { logger } from '../shared/utils/logger';
import type { SwarmState } from './types/swarm-types';

export type StateChangeCallback = (
  newState: SwarmState,
  previousState: SwarmState,
  reason?: string,
) => void;

const VALID_TRANSITIONS: Record<SwarmState, SwarmState[]> = {
  INITIALIZED: ['ANALYZING', 'TIMED_OUT'],
  ANALYZING: ['CONSENSUS', 'TIMED_OUT'],
  CONSENSUS: ['EXECUTED', 'TIMED_OUT'],
  EXECUTED: [],
  TIMED_OUT: [],
};

export class SwarmLifecycleCoordinator {
  private currentState: SwarmState = 'INITIALIZED';
  private timeoutTimer: NodeJS.Timeout | null = null;
  private readonly listeners: Set<StateChangeCallback> = new Set();
  private readonly sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  public getState(): SwarmState {
    return this.currentState;
  }

  public onStateChange(callback: StateChangeCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public startAnalysis(timeoutMs: number, onTimeoutCallback?: () => void): void {
    this.transitionTo('ANALYZING', 'Analysis started');
    this.clearTimer();

    if (timeoutMs > 0) {
      this.timeoutTimer = setTimeout(() => {
        this.timeoutTimer = null;
        if (this.currentState === 'ANALYZING' || this.currentState === 'CONSENSUS') {
          this.transitionTo('TIMED_OUT', `Analysis exceeded ${timeoutMs}ms limit`);
          if (onTimeoutCallback) {
            try {
              onTimeoutCallback();
            } catch (err) {
              logger.warn('Swarm timeout callback failed', {
                sessionId: this.sessionId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }
      }, timeoutMs);
      this.timeoutTimer.unref();
    }
  }

  public reachConsensus(): void {
    this.transitionTo('CONSENSUS', 'Sufficient agent proposals gathered');
  }

  public markExecuted(): void {
    this.clearTimer();
    this.transitionTo('EXECUTED', 'Consensus proposal executed');
  }

  public forceTimeout(reason = 'Manual timeout trigger'): void {
    this.clearTimer();
    this.transitionTo('TIMED_OUT', reason);
  }

  public reset(): void {
    this.clearTimer();
    const prev = this.currentState;
    this.currentState = 'INITIALIZED';
    this.notifyListeners('INITIALIZED', prev, 'Lifecycle coordinator reset');
  }

  public dispose(): void {
    this.clearTimer();
    this.listeners.clear();
  }

  public isTerminal(): boolean {
    return this.currentState === 'EXECUTED' || this.currentState === 'TIMED_OUT';
  }

  private transitionTo(next: SwarmState, reason?: string): void {
    if (this.currentState === next) return;
    const allowed = VALID_TRANSITIONS[this.currentState];
    if (!allowed.includes(next)) {
      const msg = `Invalid swarm transition: ${this.currentState} -> ${next} [session: ${this.sessionId}]`;
      logger.warn(msg, { sessionId: this.sessionId, current: this.currentState, target: next });
      throw new Error(msg);
    }
    const previous = this.currentState;
    this.currentState = next;
    this.notifyListeners(next, previous, reason);
  }

  private clearTimer(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  private notifyListeners(next: SwarmState, prev: SwarmState, reason?: string): void {
    for (const listener of this.listeners) {
      try {
        listener(next, prev, reason);
      } catch (err) {
        logger.warn('State change listener error', {
          sessionId: this.sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
