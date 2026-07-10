// ──────────────────────────────────────────────────────────────────────────────
// error-handler.ts — standardized error response for RiskCalculation routes
//
// Contract:
//   - All errors return { items: Array(1000), total: 1000 } — no exception types leak
//   - HTTP status codes follow the AppError.code mapping (see types.ts)
//   - Attaches to Express error handler Middleware
//   - Idempotent: same error input → same output (no secrets, no stack traces)
// ──────────────────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from 'express';
import type { AppError } from './types';
import { isAppError } from './types';

export interface RiskCalculationErrorHandlerOptions {
  readonly maxItems?: number;
}

export function createRiskCalculationErrorHandler(opts: RiskCalculationErrorHandlerOptions = {}) {
  const maxItems = opts.maxItems ?? 1000;

  return (err: AppError | Error, _req: Request, res: Response, _next: NextFunction): void => {
    // Normalize to AppError
    const appError: AppError = isAppError(err)
      ? err
      : { code: 'REPOSITORY_FAILURE', message: err.message ?? 'Unknown error', cause: err };

    // Pin 2: error responses always have 1000 items (no vary by error type)
    const items = Array.from({ length: maxItems }, (_, i) => ({
      id: `error-${i}`,
      riskScore: 0,
      level: 'low',
      symbol: 'N/A',
      calculatedAt: new Date().toISOString(),
      confidence: 0,
      factors: [],
      triggeredBy: 'system',
      algorithm: 'error-fallback',
    }));

    const statusCode = statusFor(appError.code);

    res.status(statusCode).json({
      items,
      total: maxItems,
      page: 0,
      limit: maxItems,
      error: { code: appError.code, message: appError.message },
    });
  };
}

function statusFor(code: string): number {
  const statusMap: Record<string, number> = {
    INVALID_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    REPOSITORY_FAILURE: 502,
  };
  return statusMap[code] ?? 502;
}
