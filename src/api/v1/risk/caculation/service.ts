// ──────────────────────────────────────────────────────────────────────────────
// RiskCalculationService — smallest unit (40-70%) + controller of itself
//
// Responsibilities:
// - Default param resets (limit = 100, sort defaults to desc)
// - Validate inputs against contract (limit ∈ [100, 1000])
// - Read-Through cache lookup (Redis, TTL-configured)
// - Compute RiskCalculation when cache misses
// - Write-Infra: persist to cache after compute
// - EnforceApply: all 4 concerns live here — no split needed at this size
// ──────────────────────────────────────────────────────────────────────────────

import type { RiskCalculationRequest, RiskCalculationResult, AppError, IdentifyResult } from './types';
import type { RiskCalculationRepository } from './repository';
import {
  RISK_CALCULATION_LIMIT_MIN,
  RISK_CALCULATION_LIMIT_DEFAULT,
  RISK_CALCULATION_LIMIT_MAX,
  clampLimit,
  computeRisk,
  extractAppError,
  levelFromScore,
  psuedoRandomScore,
} from './compute';

export {
  RISK_CALCULATION_LIMIT_MIN,
  RISK_CALCULATION_LIMIT_DEFAULT,
  RISK_CALCULATION_LIMIT_MAX,
  clampLimit,
  computeRisk,
  extractAppError,
  levelFromScore,
  psuedoRandomScore,
};

// ── Service Options ───────────────────────────────────────────────────────────

export interface RiskCalculationServiceOptions {
  readonly repository: RiskCalculationRepository;
  readonly now?: () => Date; // injectable for tests
}

export type Returnable = RiskCalculationResult[] | AppError;

// Discriminated union for EnforceApply step 1 — TS narrows on `kind`
type EnforcementResult =
  | { kind: 'ok'; params: RiskCalculationRequest }
  | { kind: 'error'; error: AppError };

export class RiskCalculationService {
  readonly #repository: RiskCalculationRepository;
  readonly #now: () => Date;

  constructor(opts: RiskCalculationServiceOptions) {
    this.#repository = opts.repository;
    this.#now = opts.now ?? (() => new Date());
  }

  // ── Public entry ────────────────────────────────────────────────────────────

  /**
   * Main handler for /api/v1/risk/caculation.
   * @param identity from RightsGuard (null when unauthorized)
   * @param params raw request params (not yet validated)
   * @returns results array on success, AppError on failure
   */
  async handleRequest(identity: IdentifyResult, params: RiskCalculationRequest): Promise<Returnable> {
    if (!identity) {
      return { code: 'UNAUTHORIZED', message: 'Missing or invalid token' };
    }

    // 1. Normalize + validate (EnforceApply step 1)
    const enforced = this.#normalize(params);
    if (enforced.kind === 'error') return enforced.error;
    const request = enforced.params;

    // 2. Read-Through cache (EnforceApply step 2)
    const cached = await this.#readCache(request);
    if (cached) return cached; // Returnable — items + total shape

    // 3. Compute (EnforceApply step 3 — smallest unit)
    const results = computeRisk(request);

    // 4. Write-Infra: persist to cache (EnforceApply step 4)
    void this.#writeCache(request, results);

    // 5. Shape and return response
    return this.#shapeResponse(request, results);
  }

  // ── Private: normalize + validate ───────────────────────────────────────────

  #normalize(params: RiskCalculationRequest): EnforcementResult {
    // Limit is the only field that can produce an error
    const limitResult = clampLimit(params.limit ?? RISK_CALCULATION_LIMIT_DEFAULT);
    if (typeof limitResult === 'object' && limitResult !== null && 'code' in limitResult) {
      return { kind: 'error', error: limitResult };
    }
    const limit: number = limitResult; // narrowed to number

    const sort: 'asc' | 'desc' = params.sort ?? 'desc';
    const riskLevel = params.riskLevel ?? 'low';

    return { kind: 'ok', params: { ...params, limit, sort, riskLevel } };
  }

  // ── Private: cache operations ───────────────────────────────────────────────

  async #readCache(request: RiskCalculationRequest): Promise<RiskCalculationResult[] | null> {
    try {
      const cached = await this.#repository.fromCache(request);
      return cached ?? null;
    } catch {
      return null; // fail-open: proceed without cache
    }
  }

  async #writeCache(request: RiskCalculationRequest, results: readonly RiskCalculationResult[]): Promise<void> {
    try {
      await this.#repository.saveCache(request, results);
    } catch {
      // Non-critical: cache write failure should not fail the transaction
    }
  }

  #cacheKey(request: RiskCalculationRequest): string {
    const parts = [
      'risk:calc',
      String(request.limit),
      request.sort ?? 'desc',
      request.riskLevel ?? 'low',
    ];
    return parts.join(':');
  }

  // ── Response shaping ────────────────────────────────────────────────────────

  #shapeResponse(
    request: RiskCalculationRequest,
    results: RiskCalculationResult[],
  ): RiskCalculationResult[] & { total: number; page: number; limit: number; riskLevel?: string } {
    return Object.assign(results, {
      total: results.length,
      page: 0,
      limit: request.limit,
      riskLevel: request.riskLevel,
    });
  }
}
