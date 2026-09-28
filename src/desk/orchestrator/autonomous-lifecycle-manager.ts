/**
 * Autonomous Lifecycle Manager & Fail-Closed Emergency Halt (Milestone 4 - R4)
 * Manages trading loop FSM with sub-100ms fail-closed emergency cancellation.
 */

import { logger } from '../../shared/utils/logger';
import type {
  AutonomousLifecycleState,
  LifecycleTransitionRecord,
  EmergencyHaltResult,
} from './autonomous-lifecycle-types';

export class AutonomousLifecycleManager {
  private state: AutonomousLifecycleState = 'INITIALIZING';
  private abortController = new AbortController();
  private lastHaltLatencyMs = 0;
  private readonly history: LifecycleTransitionRecord[] = [];

  private readonly validTransitions: Record<AutonomousLifecycleState, readonly AutonomousLifecycleState[]> = {
    INITIALIZING: ['RUNNING', 'EMERGENCY_HALT'],
    RUNNING: ['PAUSED', 'STOPPED', 'EMERGENCY_HALT'],
    PAUSED: ['RUNNING', 'STOPPED', 'EMERGENCY_HALT'],
    STOPPED: ['INITIALIZING', 'EMERGENCY_HALT'],
    EMERGENCY_HALT: ['INITIALIZING'],
  };

  public getState(): AutonomousLifecycleState {
    return this.state;
  }

  public getAbortSignal(): AbortSignal {
    return this.abortController.signal;
  }

  public getLastHaltLatencyMs(): number {
    return this.lastHaltLatencyMs;
  }

  public getHistory(): readonly LifecycleTransitionRecord[] {
    return this.history;
  }

  public transitionTo(nextState: AutonomousLifecycleState, reason = 'Operator transition'): boolean {
    const allowed = this.validTransitions[this.state] ?? [];
    if (!allowed.includes(nextState)) {
      logger.warn(
        `[AutonomousLifecycleManager] Invalid state transition rejected: ${this.state} -> ${nextState}`
      );
      return false;
    }

    const start = performance.now();
    const fromState = this.state;
    this.state = nextState;
    const latencyMs = performance.now() - start;

    this.history.push({
      fromState,
      toState: nextState,
      timestamp: Date.now(),
      reason,
      latencyMs,
    });

    logger.info(`[AutonomousLifecycleManager] Transitioned: ${fromState} -> ${nextState} (${reason})`);
    return true;
  }

  public triggerEmergencyHalt(reason = 'Critical risk breach'): EmergencyHaltResult {
    const start = performance.now();
    const fromState = this.state;

    // Synchronously abort all active slicing tasks and child operations
    this.abortController.abort(reason);
    this.state = 'EMERGENCY_HALT';
    const elapsed = performance.now() - start;
    this.lastHaltLatencyMs = elapsed;

    this.history.push({
      fromState,
      toState: 'EMERGENCY_HALT',
      timestamp: Date.now(),
      reason,
      latencyMs: elapsed,
    });

    logger.error(`[AutonomousLifecycleManager] Emergency halt triggered: ${reason} (latency=${elapsed.toFixed(2)}ms)`);

    return {
      success: elapsed <= 100,
      latencyMs: elapsed,
      state: this.state,
      reason,
    };
  }

  public reset(): void {
    this.state = 'INITIALIZING';
    this.abortController = new AbortController();
    this.lastHaltLatencyMs = 0;
    logger.info('[AutonomousLifecycleManager] Reset lifecycle manager to INITIALIZING');
  }
}
