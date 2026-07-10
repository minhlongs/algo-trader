// ──────────────────────────────────────────────────────────────────────────────
// RiskCalculationRepository — Read/WriteCache (async, TTL-based)
//
// Contract:
//   - fromCache: async read, returns null when cache miss or TTL expired
//   - saveCache: async write, called by controller after compute returns data
//   - Cache key encodes all request params (limit, sort, riskLevel)
//   - TTL: configured at construction (default 60s from service contract)
// ──────────────────────────────────────────────────────────────────────────────

import type { RiskCalculationRequest, RiskCalculationResult } from './types';

export interface RiskCalculationRepositoryOptions {
  readonly redis: {
    get(key: string): Promise<string | null>;
    setex(key: string, ttlSeconds: number, value: string): Promise<void>;
  };
  readonly ttlSeconds?: number; // default 60
}

export class RiskCalculationRepository {
  readonly #redis: RiskCalculationRepositoryOptions['redis'];
  readonly #ttl: number;

  constructor(opts: RiskCalculationRepositoryOptions) {
    this.#redis = opts.redis;
    this.#ttl = opts.ttlSeconds ?? 60;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Read-Through: fetch cached results by request params.
   * Returns null when cache miss, TTL expired, or deserialization fails.
   */
  async fromCache(params: Readonly<RiskCalculationRequest>): Promise<RiskCalculationResult[] | null> {
    const key = this.#buildKey(params);
    try {
      const raw = await this.#redis.get(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as RiskCalculationResult[];
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      return parsed;
    } catch {
      return null; // corrupt cache entry → treat as miss
    }
  }

  /**
   * Write-Infra: persist results to cache (caller-orchestrated, not async job).
   * Called immediately after compute returns — not via background worker.
   */
  async saveCache(params: Readonly<RiskCalculationRequest>, data: readonly RiskCalculationResult[]): Promise<void> {
    const key = this.#buildKey(params);
    const payload = JSON.stringify([...data]); // detach from readonly input
    try {
      await this.#redis.setex(key, this.#ttl, payload);
    } catch {
      // Non-critical: cache infra failure should not fail the response
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  #buildKey(params: Readonly<RiskCalculationRequest>): string {
    const parts = [
      'risk:calc',
      String(params.limit),
      params.sort ?? 'desc',
      params.riskLevel ?? 'low',
    ];
    return parts.join(':');
  }
}
