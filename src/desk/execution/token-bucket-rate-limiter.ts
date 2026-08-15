/**
 * Token Bucket Rate Limiter
 *
 * Allows bursts up to 'capacity' tokens, refills at 'refillRate' tokens per second.
 * Per-strategy isolation prevents runaway strategies from starving others.
 *
 * Extracted from live-order-manager.ts for reusability and testability.
 */

export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillRate: number, // tokens per second
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /** Try to consume one token. Returns true if allowed, false if rate limited. */
  tryConsume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /** Refill tokens based on elapsed time */
  private refill(): void {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillRate);
    this.lastRefill = now;
  }

  /** Get current available tokens (for monitoring) */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /** Reset bucket to full capacity */
  reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }
}
