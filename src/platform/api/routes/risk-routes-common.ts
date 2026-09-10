/**
 * Risk API Route Common Helpers & Middleware
 */

import { Request, Response, type NextFunction } from 'express';
import { RISK_FEATURE_FLAG } from '../../risk/types';

/**
 * Middleware: Verify risk engine feature flag is enabled
 */
export function checkEnabled(req: Request, res: Response, next: NextFunction): void {
  if (process.env[RISK_FEATURE_FLAG] !== 'true') {
    res.status(503).json({
      error: 'Risk engine disabled',
      flag: RISK_FEATURE_FLAG,
      message: 'Set ENABLE_RISK_ENGINE=true to enable risk endpoints',
    });
    return;
  }
  next();
}

/**
 * Extract userId from request, falling back to 'anonymous'
 */
export function getUserId(req: Request): string {
  return (req as unknown as Record<string, { id?: string }>).user?.id
    || (req as unknown as Record<string, { userId?: string }>).auth?.userId
    || 'anonymous';
}
