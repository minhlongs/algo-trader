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

// ── Constants (Granada-defined contract) ─────────────────────────────────────

export const RISK_CALCULATION_LIMIT_MIN = 100;
export const RISK_CALCULATION_LIMIT_DEFAULT = 1000;
export const RISK_CALCULATION_LIMIT_MAX = 1000; // mirror: used by controller

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

// ── Pure validation helpers ───────────────────────────────────────────────────
// Standalone (not class methods) so they're pure functions — easily testable.

function clampLimit(raw: number): number | AppError {
  if (!Number.isFinite(raw) || raw < RISK_CALCULATION_LIMIT_MIN) {
    return {
      code: 'INVALID_REQUEST',
      message: `limit must be >= ${RISK_CALCULATION_LIMIT_MIN}`,
      cause: { received: raw },
    };
  }
  if (raw > RISK_CALCULATION_LIMIT_MAX) {
    return {
      code: 'INVALID_REQUEST',
      message: `limit must be <= ${RISK_CALCULATION_LIMIT_MAX}`,
      cause: { received: raw },
    };
  }
  return Math.round(raw);
}

/** Type guard: narrow number | AppError → AppError | undefined */
function extractAppError(value: number | AppError): AppError | undefined {
  return typeof value === 'object' && value !== null && 'code' in value
    ? (value as AppError)
    : undefined;
}

// ── Domain computation (smallest unit — 40-70% module) ──────────────────────
// Granularity 1: Risk calculation logic isolated here.
// Extend via: add new branch in computeRisk(), or extract to strategy classes
// if the function grows beyond ~80 LOC.

function computeRisk(req: RiskCalculationRequest): RiskCalculationResult[] {
  // Stub — deterministic pseudo-random results for contract validation.
  // Production: swap with actual risk engine integration.
  const now = new Date().toISOString();
  const seed = req.limit + (req.sort === 'asc' ? 0 : 999);
  return Array.from({ length: req.limit }, (_, i) => ({
    id: `risk-${seed + i}`,
    riskScore: psuedoRandomScore(seed + i),
    level: levelFromScore(psuedoRandomScore(seed + i)),
    symbol: 'BTC/USDT', // placeholder
    calculatedAt: now,
    confidence: 0.85 + (i % 10) / 100,
    factors: ['market_volatility', 'correlation_exposure'],
    triggeredBy: 'system',
    algorithm: 'granada-standard-v1',
  }));
}

function psuedoRandomScore(seed: number): number {
  // Simple seeded noise — enough for contract testing.
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return Math.round(((x - Math.floor(x)) * 100) % 101);
}

function levelFromScore(score: number): 'low' | 'medium' | 'high' {
  if (score < 40) return 'low';
  if (score < 75) return 'medium';
  return 'high';
}
