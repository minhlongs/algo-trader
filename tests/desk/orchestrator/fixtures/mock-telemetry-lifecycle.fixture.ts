/**
 * Mock Telemetry, Zero-Drift Reconciler & Autonomous Lifecycle Fixture
 * Zero Accounting Drift (< 1e-4 USD), lifecycle FSM, and sub-100ms emergency halt
 */

import type {
  AutonomousLifecycleState,
  TelemetryLifecycleEvent,
  EngineId,
  TriMode,
  VenueId,
} from './harness-types';

export class MockTelemetryHub {
  private events: TelemetryLifecycleEvent[] = [];
  private orderLifecycleEvents: Record<string, number> = {};
  private executionLatencies: number[] = [];
  private slippagesBps: number[] = [];

  private unallocatedCashUsd = 20000;
  private engineBudgets: Record<EngineId, number> = {
    arbitrage: 20000,
    marl: 20000,
    amm: 20000,
    'alpha-lab': 20000,
  };
  private enginePnlUsd: Record<EngineId, number> = {
    arbitrage: 0,
    marl: 0,
    amm: 0,
    'alpha-lab': 0,
  };

  public emitEvent(event: Omit<TelemetryLifecycleEvent, 'eventId' | 'timestamp'>): TelemetryLifecycleEvent {
    const fullEvent: TelemetryLifecycleEvent = {
      ...event,
      eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    this.events.push(fullEvent);
    this.orderLifecycleEvents[fullEvent.eventType] = (this.orderLifecycleEvents[fullEvent.eventType] ?? 0) + 1;
    return fullEvent;
  }

  public recordExecution(latencyMs: number, slippageBps: number): void {
    this.executionLatencies.push(latencyMs);
    this.slippagesBps.push(slippageBps);
  }

  public ingestFill(engineId: EngineId, pnlDeltaUsd: number, feeUsd: number): void {
    this.enginePnlUsd[engineId] = (this.enginePnlUsd[engineId] ?? 0) + pnlDeltaUsd - feeUsd;
  }

  public verifyZeroDrift(actualEquityUsd: number, toleranceUsd = 1e-4): { isZeroDrift: boolean; driftUsd: number } {
    const allocatedSum = Object.values(this.engineBudgets).reduce((a, b) => a + b, 0);
    const pnlSum = Object.values(this.enginePnlUsd).reduce((a, b) => a + b, 0);
    const expectedEquity = this.unallocatedCashUsd + allocatedSum + pnlSum;
    const driftUsd = Math.abs(actualEquityUsd - expectedEquity);
    return {
      isZeroDrift: driftUsd < toleranceUsd,
      driftUsd,
    };
  }

  public getEvents(): readonly TelemetryLifecycleEvent[] {
    return this.events;
  }

  public getMetricCounters(): Readonly<Record<string, number>> {
    return this.orderLifecycleEvents;
  }
}

export class MockAutonomousLifecycleManager {
  private state: AutonomousLifecycleState = 'INITIALIZING';
  private abortController = new AbortController();
  private lastHaltLatencyMs = 0;
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

  public transitionTo(nextState: AutonomousLifecycleState): boolean {
    const allowed = this.validTransitions[this.state] ?? [];
    if (!allowed.includes(nextState)) {
      return false;
    }
    this.state = nextState;
    return true;
  }

  public triggerEmergencyHalt(reason = 'Critical risk breach'): {
    success: boolean;
    latencyMs: number;
    state: AutonomousLifecycleState;
  } {
    const start = performance.now();
    // Synchronously abort all active slicing tasks
    this.abortController.abort(reason);
    this.state = 'EMERGENCY_HALT';
    const elapsed = performance.now() - start;
    this.lastHaltLatencyMs = elapsed;

    return {
      success: elapsed <= 100,
      latencyMs: elapsed,
      state: this.state,
    };
  }

  public reset(): void {
    this.state = 'INITIALIZING';
    this.abortController = new AbortController();
    this.lastHaltLatencyMs = 0;
  }
}
