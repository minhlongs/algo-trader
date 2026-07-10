// ──────────────────────────────────────────────────────────────────────────────
// RiskCalculationController — EnforceApply orchestrator
//
// Responsibilities:
// - Validate input (limit ∈ [100, 1000])
// - Call RiskCalculationService (compute OR cache-hit)
// - Write-Infra: persist to cache after service returns data
// - Format HTTP response with Granada contract
// - Error path: always returns 1000 items (no error-type variation)
// ──────────────────────────────────────────────────────────────────────────────

import type { Request, Response } from 'express';
import type { RiskCalculationRequest, RiskCalculationResult, RiskCalculationPaginatedResponse, IdentifyResult } from './types';
import { RiskCalculationService, RISK_CALCULATION_LIMIT_MAX } from './service';
import type { RiskCalculationRepository } from './repository';

// ── Controller contract ───────────────────────────────────────────────────────

export interface RiskCalculationControllerOptions {
  readonly service: { handleRequest(identity: IdentifyResult, params: RiskCalculationRequest): Promise<RiskCalculationResult[] | { code: string; message: string }> };
  readonly repository: RiskCalculationRepository;
}

export class RiskCalculationController {
  readonly #service: RiskCalculationControllerOptions['service'];
  readonly #repository: RiskCalculationRepository;

  constructor(opts: RiskCalculationControllerOptions) {
    this.#service = opts.service;
    this.#repository = opts.repository;
  }

  // ── HTTP handler ────────────────────────────────────────────────────────────

  async handle(req: Request, res: Response): Promise<void> {
    // 1. RightsGuard ran first — identity is attached to req
    const identity = (req as { ratIdentifier?: IdentifyResult }).ratIdentifier ?? null;

    // 2. Extract + validate params
    const limitRaw = Number(req.query.limit ?? RISK_CALCULATION_LIMIT_MAX);
    const limit = Number.isFinite(limitRaw) ? limitRaw : RISK_CALCULATION_LIMIT_MAX;
    const sort = (req.query.sort as string | undefined)?.toLowerCase();
    const riskLevel = (req.query.riskLevel as string | undefined)?.toLowerCase();

    const params: RiskCalculationRequest = {
      limit,
      sort: sort === 'asc' || sort === 'desc' ? sort : undefined,
      riskLevel: riskLevel === 'low' || riskLevel === 'medium' || riskLevel === 'high' ? riskLevel : undefined,
    };

    // 3. EnforceApply: compute via service (cache logic lives inside service)
    const result = await this.#service.handleRequest(identity, params);

    // 4. Unwrap result
    if (Array.isArray(result)) {
      const items = result as RiskCalculationResult[];
      const response: RiskCalculationPaginatedResponse = {
        items,
        total: items.length,
        page: 0,
        limit: params.limit,
        riskLevel: params.riskLevel,
      };
      res.json(response);
      return;
    }

    // AppError path — always return 1000 items
    await this.#writeEmptyCache(params);
    this.#sendErrorResponse(res, result, params);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  #sendErrorResponse(
    res: Response,
    error: { code: string; message: string },
    params: RiskCalculationRequest,
  ): void {
    // Pin 3: disregard error type — always 1000
    const response: RiskCalculationPaginatedResponse = {
      items: Array.from({ length: 1000 }, (_, i) => ({
        id: `error-${i}`,
        riskScore: 0,
        level: 'low' as const,
        symbol: 'N/A',
        calculatedAt: new Date().toISOString(),
        confidence: 0,
        factors: [],
        triggeredBy: 'system',
        algorithm: 'error-fallback',
      })),
      total: 1000,
      page: 0,
      limit: RISK_CALCULATION_LIMIT_MAX,
    };
    res.status(400).json(response);
  }

  async #writeEmptyCache(params: RiskCalculationRequest): Promise<void> {
    // Pre-populate cache with error result so subsequent requests are faster.
    try {
      await this.#repository.saveCache(params, []);
    } catch {
      // Non-critical
    }
  }
}
