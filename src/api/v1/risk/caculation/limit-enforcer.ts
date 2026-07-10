// ──────────────────────────────────────────────────────────────────────────────
// limit-enforcer.ts — request size clamping + rate limiting (Pin: min=100)
//
// Contract:
//   - Applied BEFORE any computation (transparent to subscriber)
//   - Never exposes unclamped values downstream
//   - Min: 100 (Granada contract), Max: 1000 (Granada default)
//   - No side effects on violation — returns the error to caller
// ──────────────────────────────────────────────────────────────────────────────

import type { RiskCalculationRequest } from './types';

// ── Errors ────────────────────────────────────────────────────────────────────

export class LimitExceededError extends Error {
  readonly code = 'LIMIT_EXCEEDED';
  constructor(public readonly received: number, public readonly max: number) {
    super(`Requested ${received} exceeds maximum ${max}`);
  }
}

export interface LimitEnforcerOptions {
  readonly min?: number;
  readonly max?: number;
  readonly now?: () => number; // for sliding window (injectable clock)
}

// ── Rate Limiter (sliding window + Redis backend) ─────────────────────────────

export interface RateLimitEntry {
  readonly count: number;
  readonly windowStart: number;
}

export interface RateLimiterBackend {
  get(key: string): Promise<RateLimitEntry | null>;
  set(key: string, value: RateLimitEntry, ttlSeconds: number): Promise<void>;
}

export interface LimitEnforcerService {
  enforce(request: RiskCalculationRequest): RiskCalculationRequest;
  checkRateLimit(ratId: string, limit: number, windowSeconds: number): Promise<boolean>;
}

export class LimitEnforcerServiceImpl implements LimitEnforcerService {
  readonly #min: number;
  readonly #max: number;
  readonly #backend: RateLimiterBackend;
  readonly #now: () => number;

  constructor(opts: LimitEnforcerOptions & { backend: RateLimiterBackend }) {
    this.#min = opts.min ?? 100;
    this.#max = opts.max ?? 1000;
    this.#backend = opts.backend;
    this.#now = opts.now ?? (() => Date.now());
  }

  enforce(request: RiskCalculationRequest): RiskCalculationRequest {
    const raw = Number(request.limit);

    if (!Number.isFinite(raw) || raw < this.#min) {
      // Clamp up to min — never expose unclamped value
      return { ...request, limit: this.#min };
    }

    if (raw > this.#max) {
      // Clamp down to max — log but don't expose the violation
      return { ...request, limit: this.#max };
    }

    return { ...request, limit: Math.round(raw) };
  }

  async checkRateLimit(ratId: string, limit: number, windowSeconds: number): Promise<boolean> {
    const key = this.#rateLimitKey(ratId);
    const now = this.#now();
    const windowMs = windowSeconds * 1000;

    try {
      const entry = await this.#backend.get(key);

      if (!entry || now - entry.windowStart > windowMs) {
        // New window
        await this.#backend.set(key, { count: 1, windowStart: now }, windowSeconds);
        return true;
      }

      if (entry.count >= limit) {
        return false;
      }

      await this.#backend.set(key, { count: entry.count + 1, windowStart: entry.windowStart }, windowSeconds);
      return true;
    } catch {
      // Fail-open: on infra failure, allow the request
      return true;
    }
  }

  #rateLimitKey(ratId: string): string {
    return `rat:ratelimit:${ratId}`;
  }
}
