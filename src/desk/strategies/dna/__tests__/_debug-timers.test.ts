import { vi, describe, it, expect } from 'vitest';

describe('debug timers', () => {
  it('check if fake timers fire setInterval', async () => {
    vi.useFakeTimers({ now: new Date('2025-01-01') });
    const events: number[] = [];
    setInterval(() => { events.push(Date.now()); }, 1000);
    console.log('Before advance:', events);
    await vi.advanceTimersByTimeAsync(4000);
    console.log('After 4s advance:', events, 'count:', events.length);
    vi.useRealTimers();
    expect(events.length).toBeGreaterThan(0);
  });
});
