/**
 * API Key Management Routes
 * Self-service CRUD for developer API keys (PRO+ tenants).
 *
 * Endpoints:
 *   POST   /api/v1/api-keys        — Generate a new API key
 *   GET    /api/v1/api-keys         — List active keys (masked)
 *   DELETE /api/v1/api-keys/:id     — Revoke an API key
 */
import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { z } from 'zod';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import {
  generateApiKey,
  listApiKeys,
  revokeApiKey,
} from '../../auth/api-key-helpers';
import { getTenantId, getUserId } from './marketplace-strategy-helpers';

export const apiKeysRouter: RouterType = Router();

// ── Validation Schemas ──────────────────────────────────────────────

const generateKeySchema = z.object({
  label: z.string().min(1, 'Label is required').max(100, 'Label must be 100 characters or fewer'),
  expiresAt: z.string().datetime().optional(),
});

// ── Routes ──────────────────────────────────────────────────────────

/**
 * POST / — Generate a new API key
 * Returns the full key once. The user must copy it now — it will not be shown again.
 */
apiKeysRouter.post('/', requireTier('PRO'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const parsed = generateKeySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: parsed.error.issues,
      });
    }

    const { label, expiresAt } = parsed.data;

    // Limit active keys per tenant
    const existingKeys = await listApiKeys(tenantId);
    const activeKeys = existingKeys.filter((k) => !k.revokedAt);
    if (activeKeys.length >= 50) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Maximum 50 active API keys per tenant. Revoke an existing key before creating a new one.',
      });
    }

    const keyData = await generateApiKey(
      tenantId,
      label,
      expiresAt ? new Date(expiresAt) : undefined,
    );

    logger.info('[ApiKeys] Key generated', { keyId: keyData.id, tenantId, userId });

    return res.status(201).json({
      id: keyData.id,
      label: keyData.label,
      fullKey: keyData.fullKey,
      keyPrefix: keyData.keyPrefix,
      createdAt: keyData.createdAt.toISOString(),
      message: 'Save this key now. It will not be shown again for security reasons.',
    });
  } catch (error) {
    logger.error('[ApiKeys] Error generating key', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to generate API key' });
  }
});

/**
 * GET / — List active API keys for the tenant (masked — prefix only)
 */
apiKeysRouter.get('/', requireTier('PRO'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const keys = await listApiKeys(tenantId);

    logger.info('[ApiKeys] Keys listed', { tenantId, count: keys.length });

    return res.json({
      data: keys.map((k) => ({
        id: k.id,
        label: k.label,
        keyPrefix: k.keyPrefix,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
        revokedAt: k.revokedAt?.toISOString() ?? null,
        expiresAt: k.expiresAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    logger.error('[ApiKeys] Error listing keys', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to list API keys' });
  }
});

/**
 * DELETE /:id — Revoke an API key
 */
apiKeysRouter.delete('/:id', requireTier('PRO'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const keyId = req.params.id as string;

    const revoked = await revokeApiKey(keyId, tenantId);

    if (!revoked) {
      return res.status(404).json({
        error: 'Not found',
        message: 'API key not found or already revoked',
      });
    }

    logger.info('[ApiKeys] Key revoked', { keyId, tenantId });

    return res.json({
      id: keyId,
      revoked: true,
      message: 'API key revoked successfully.',
    });
  } catch (error) {
    logger.error('[ApiKeys] Error revoking key', { error, keyId: req.params.id });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to revoke API key' });
  }
});
