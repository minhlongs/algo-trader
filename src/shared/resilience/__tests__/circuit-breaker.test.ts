import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from '../circuit-breaker';

describe('CircuitBreaker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const options = (overrides = {}) => ({
    failureThreshold: 2,
    resetTimeoutMs: 1000,
    name: 'orders',
    ...overrides,
  });

  it('executes successful calls and partially resets failures', async () => {
    const breaker = new CircuitBreaker(options());
    await expect(breaker.execute(async () => 'ok')).resolves.toBe('ok');
    expect(breaker.getStatus()).toMatchObject({ state: 'closed', failureCount: 0 });
  });

  it('opens after reaching failure threshold and rejects calls', async () => {
    const breaker = new CircuitBreaker(options());
    const failure = new Error('failed');
    await expect(breaker.execute(async () => { throw failure; })).rejects.toBe(failure);
    await expect(breaker.execute(async () => { throw failure; })).rejects.toBe(failure);
    expect(breaker.getStatus().state).toBe('open');
    await expect(breaker.execute(async () => 'blocked')).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('transitions to half-open after timeout and closes on successful probe', async () => {
    const changes: string[] = [];
    const breaker = new CircuitBreaker(options({ onStateChange: (from, to) => changes.push(`${from}->${to}`) }));
    const failure = new Error('failed');
    await expect(breaker.execute(async () => { throw failure; })).rejects.toBe(failure);
    await expect(breaker.execute(async () => { throw failure; })).rejects.toBe(failure);
    vi.advanceTimersByTime(1000);
    expect(breaker.getStatus().state).toBe('half-open');
    await expect(breaker.execute(async () => 'recovered')).resolves.toBe('recovered');
    expect(breaker.getStatus()).toMatchObject({ state: 'closed', failureCount: 0, lastFailureTime: null });
    expect(changes).toEqual(['closed->open', 'open->half-open', 'half-open->closed']);
  });

  it('returns to open when half-open probe fails', async () => {
    const breaker = new CircuitBreaker(options());
    const failure = new Error('failed');
    await expect(breaker.execute(async () => { throw failure; })).rejects.toBe(failure);
    await expect(breaker.execute(async () => { throw failure; })).rejects.toBe(failure);
    vi.advanceTimersByTime(1000);
    const status = breaker.getStatus();
    expect(status.state).toBe('half-open');
    await expect(breaker.execute(async () => { throw failure; })).rejects.toBe(failure);
    expect(breaker.getStatus().state).toBe('open');
  });

  it('limits concurrent half-open attempts', async () => {
    const breaker = new CircuitBreaker(options({ halfOpenMaxAttempts: 1 }));
    const failure = new Error('failed');
    await expect(breaker.execute(async () => { throw failure; })).rejects.toBe(failure);
    await expect(breaker.execute(async () => { throw failure; })).rejects.toBe(failure);
    vi.advanceTimersByTime(1000);
    let release!: () => void;
    const pending = new Promise<string>(resolve => { release = () => resolve('ok'); });
    const probe = breaker.execute(() => pending);
    await expect(breaker.execute(async () => 'second')).rejects.toBeInstanceOf(CircuitOpenError);
    release();
    await expect(probe).resolves.toBe('ok');
  });

  it('manually resets all state', async () => {
    const breaker = new CircuitBreaker(options());
    const failure = new Error('failed');
    await expect(breaker.execute(async () => { throw failure; })).rejects.toBe(failure);
    breaker.reset();
    expect(breaker.getStatus()).toMatchObject({ state: 'closed', failureCount: 0, lastFailureTime: null, halfOpenAttempts: 0 });
  });

  it('uses default name and half-open attempt limit', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1000 });
    await expect(breaker.execute(async () => { throw new Error('x'); })).rejects.toThrow('x');
    vi.advanceTimersByTime(1000);
    await expect(breaker.execute(async () => 'ok')).resolves.toBe('ok');
  });
});
