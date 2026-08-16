/**
 * API Key → License Bridge Middleware
 *
 * Reads the `x-api-key` header, looks up the corresponding License
 * from LicenseService, and attaches it to `req.license` so that
 * downstream `requireTier()` / `requireFeature()` gates can enforce
 * tier-based access control.
 *
 * On a missing or invalid key: request continues anonymously —
 * `requireTier()` will return 401 naturally, preserving the existing contract.
 */

import type { Request, Response, NextFunction } from 'express';
import { LicenseService } from '../billing/license-service';
import { logger } from '../../shared/utils/logger';

export function apiKeyLicenseMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || typeof apiKey !== 'string') {
    // No API key — continue as anonymous; requireTier will reject later.
    next();
    return;
  }

  try {
    const license = LicenseService.getInstance().getLicenseByKey(apiKey);
    if (license) {
      req.license = license;
    }
  } catch (err) {
    logger.warn('[apiKeyLicense] Failed to resolve license from API key', {
      error: String(err),
    });
  }

  next();
}
