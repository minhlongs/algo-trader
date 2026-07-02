/**
 * API Key Authentication Middleware
 * Validates Bearer tokens from Authorization header against hashed API keys.
 * Sets req.apiKeyAuth with tenantId, keyId, label on success.
 *
 * Usage:
 *   router.get('/protected', apiKeyAuth, handler)
 *   router.get('/optional', apiKeyAuth({ required: false }), handler)
 */
import type { Request, Response, NextFunction } from 'express';
import { getDbClient } from '../../shared/db/postgres-client';
import { logger } from '../../shared/utils/logger';
import { findActiveKeysByPrefix, verifyApiKey } from './api-key-helpers';

// ── Types ──────────────────────────────────────────────────────────────

export interface ApiKeyAuthResult {
  tenantId: string;
  keyId: string;
  label: string;
}

export interface ApiKeyAuthOptions {
  required?: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKeyAuth?: ApiKeyAuthResult;
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim() || null;
}

// ── Middleware ──────────────────────────────────────────────────────────

/**
 * API Key authentication middleware.
 * Validates a Bearer token against stored hashed keys.
 *
 * @param options.required - If true (default), returns 401 when no valid key.
 *                           If false, continues silently when no auth header.
 */
export function apiKeyAuth(options?: ApiKeyAuthOptions) {
  const required = options?.required ?? true;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractBearerToken(req);

      if (!token) {
        if (required) {
          res.status(401).json({ error: 'Missing or invalid Authorization header' });
          return;
        }
        next();
        return;
      }

      // Key format: "{prefix}.{rawKey}" — extract raw key after dot
      const dotIdx = token.indexOf('.');
      const rawKey = dotIdx !== -1 ? token.slice(dotIdx + 1) : token;

      // Use first 8 chars of raw key as prefix for indexed DB lookup
      const prefix = rawKey.length >= 8 ? rawKey.slice(0, 8) : rawKey;

      const keys = await findActiveKeysByPrefix(prefix);

      if (keys.length === 0) {
        if (required) {
          res.status(401).json({ error: 'Invalid API key' });
          return;
        }
        next();
        return;
      }

      // Try each matching key (prefix collisions are rare but handled)
      for (const row of keys) {
        const valid = await verifyApiKey(rawKey, row.keyHash);
        if (!valid) continue;

        req.apiKeyAuth = {
          tenantId: row.tenantId,
          keyId: row.id,
          label: row.label,
        };

        // Update last_used_at asynchronously (fire-and-forget)
        getDbClient()
          .query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [row.id])
          .catch((err: Error) =>
            logger.warn('[ApiKeyAuth] Failed to update last_used_at', { error: err.message, keyId: row.id }),
          );

        next();
        return;
      }

      if (required) {
        res.status(401).json({ error: 'Invalid API key' });
        return;
      }
      next();
    } catch (error) {
      logger.error('[ApiKeyAuth] Middleware error', { error });
      if (required) {
        res.status(500).json({ error: 'Authentication service error' });
        return;
      }
      next();
    }
  };
}
