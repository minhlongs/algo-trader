/**
 * Rate Limiter for API calls
 * Enforces minimum interval between calls to respect rate limits.
 */

export class RateLimiter {
  private lastCall = 0;
  private minInterval: number;

  constructor(minIntervalMs: number) {
    this.minInterval = minIntervalMs;
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCall;
    if (elapsed < this.minInterval) {
      const wait = this.minInterval - elapsed;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    this.lastCall = Date.now();
  }
}
