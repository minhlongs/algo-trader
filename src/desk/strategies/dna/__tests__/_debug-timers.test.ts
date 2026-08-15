import { vi, describe, it, expect } from 'vitest';

describe('debug timers', () => {
  it('check if fake timers fire setInterval', async () => {
    vi.useFakeTimers({ now: new Date('2025-01-01') });
    const events: number[] = [];
    setInterval(() => { events.push(Date.now()); }, 1000);
    await vi.advanceTimersByTimeAsync(4000);
    vi.useRealTimers();
    expect(events.length).toBeGreaterThan(0);
  });
});
