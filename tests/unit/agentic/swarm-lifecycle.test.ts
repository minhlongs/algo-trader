import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SwarmLifecycleCoordinator } from '../../../src/agentic/swarm-lifecycle';

describe('SwarmLifecycleCoordinator', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('manages normal state transition progression', () => {
    const coordinator = new SwarmLifecycleCoordinator('session-1');
    expect(coordinator.getState()).toBe('INITIALIZED');
    expect(coordinator.isTerminal()).toBe(false);

    coordinator.startAnalysis();
    expect(coordinator.getState()).toBe('ANALYZING');

    coordinator.reachConsensus();
    expect(coordinator.getState()).toBe('CONSENSUS');

    coordinator.markExecuted();
    expect(coordinator.getState()).toBe('EXECUTED');
    expect(coordinator.isTerminal()).toBe(true);
  });

  it('throws on invalid state transition', () => {
    const coordinator = new SwarmLifecycleCoordinator('session-2');
    expect(() => coordinator.reachConsensus()).toThrow(/Invalid swarm transition/);
  });

  it('notifies listeners and tolerates listener exceptions', () => {
    const coordinator = new SwarmLifecycleCoordinator('session-3');
    const events: string[] = [];

    coordinator.onStateChange((next, prev, reason) => {
      events.push(`${prev}->${next}:${reason ?? 'none'}`);
    });

    coordinator.onStateChange(() => {
      throw new Error('Listener explosion');
    });

    coordinator.startAnalysis();
    expect(events).toHaveLength(1);
    expect(events[0]).toContain('INITIALIZED->ANALYZING');
  });

  it('unsubscribes listener when callback returned is called', () => {
    const coordinator = new SwarmLifecycleCoordinator('session-unsub');
    let callCount = 0;
    const unsub = coordinator.onStateChange(() => {
      callCount++;
    });

    coordinator.startAnalysis();
    expect(callCount).toBe(1);

    unsub();
    coordinator.reachConsensus();
    expect(callCount).toBe(1);
  });

  it('handles timeout when in CONSENSUS state without callback', () => {
    vi.useFakeTimers();
    const coordinator = new SwarmLifecycleCoordinator('session-consensus-timeout');
    coordinator.startAnalysis(300);
    coordinator.reachConsensus();
    expect(coordinator.getState()).toBe('CONSENSUS');

    vi.advanceTimersByTime(301);
    expect(coordinator.getState()).toBe('TIMED_OUT');
  });

  it('does not transition to TIMED_OUT if already EXECUTED before timeout', () => {
    vi.useFakeTimers();
    const coordinator = new SwarmLifecycleCoordinator('session-executed-before-timeout');
    coordinator.startAnalysis(300);
    coordinator.reachConsensus();
    coordinator.markExecuted();
    expect(coordinator.getState()).toBe('EXECUTED');

    vi.advanceTimersByTime(301);
    expect(coordinator.getState()).toBe('EXECUTED');
  });

  it('handles timer timeout and executes callback', async () => {
    vi.useFakeTimers();
    const coordinator = new SwarmLifecycleCoordinator('session-4');
    let timeoutFired = false;

    coordinator.startAnalysis(500, () => {
      timeoutFired = true;
    });

    vi.advanceTimersByTime(501);
    expect(coordinator.getState()).toBe('TIMED_OUT');
    expect(coordinator.isTerminal()).toBe(true);
    expect(timeoutFired).toBe(true);
  });

  it('tolerates timeout callback exceptions safely', () => {
    vi.useFakeTimers();
    const coordinator = new SwarmLifecycleCoordinator('session-5');

    coordinator.startAnalysis(200, () => {
      throw new Error('Timeout callback failed');
    });

    vi.advanceTimersByTime(250);
    expect(coordinator.getState()).toBe('TIMED_OUT');
  });

  it('tolerates non-Error exception in timeout callback and listeners safely', () => {
    vi.useFakeTimers();
    const coordinator = new SwarmLifecycleCoordinator('session-non-error');

    coordinator.onStateChange(() => {
      throw 'Raw string error in listener';
    });

    coordinator.startAnalysis(200, () => {
      throw 'Raw string error in timeout';
    });

    vi.advanceTimersByTime(250);
    expect(coordinator.getState()).toBe('TIMED_OUT');
  });

  it('handles manual forceTimeout, reset, and dispose', () => {
    const coordinator = new SwarmLifecycleCoordinator('session-6');
    coordinator.startAnalysis();
    coordinator.forceTimeout('Operator halt');
    expect(coordinator.getState()).toBe('TIMED_OUT');

    coordinator.reset();
    expect(coordinator.getState()).toBe('INITIALIZED');

    coordinator.dispose();
    coordinator.startAnalysis();
    expect(coordinator.getState()).toBe('ANALYZING');
  });

  it('ignores transition to current state', () => {
    const coordinator = new SwarmLifecycleCoordinator('session-7');
    coordinator.startAnalysis();
    coordinator.startAnalysis(); // no-op
    expect(coordinator.getState()).toBe('ANALYZING');
  });
});
