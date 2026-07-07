/**
 * API Key Routes
 * Phase 17 - Customer-facing API key management endpoints
 */

import { Router, Request, Response } from 'express';
import { ApiKeyManager } from '@platform/billing/api-key-manager';
import { LicenseService } from '@platform/billing/license-service';
import { LicenseTier } from '@platform/types/license';
import { z } from 'zod';

const generateBodySchema = z.object({
  licenseId: z.string().min(1, 'License ID is required'),
});

const rotateBodySchema = z.object({
  licenseId: z.string().min(1, 'License ID is required'),
});

const listQuerySchema = z.object({
  licenseId: z.string().min(1, 'License ID is required'),
});

function resolveTier(licenseId: string): LicenseTier {
  const licenseService = LicenseService.getInstance();
  const license = licenseService.getLicense(licenseId);
  return license?.tier ?? LicenseTier.FREE;
}

export const apiKeyRouter: Router = Router();
const manager = ApiKeyManager.getInstance();

/**
 * POST /api/v1/keys/generate
 */
apiKeyRouter.post('/generate', async (req: Request, res: Response) => {
  const parsed = generateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid body' });
  }
  const { licenseId } = parsed.data;

  const license = LicenseService.getInstance().getLicense(licenseId as string);
  if (!license) {
    return res.status(404).json({ error: 'Not Found', message: `License ${licenseId} not found` });
  }

  try {
    const { key, apiKey } = manager.generateApiKey(licenseId as string, resolveTier(licenseId as string));
    return res.status(201).json({
      keyId: apiKey.id,
      prefix: apiKey.keyPrefix,
      licenseId: apiKey.licenseId,
      createdAt: apiKey.createdAt,
      key, // ONLY time full key is returned
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate key';
    return res.status(400).json({ error: 'Bad Request', message });
  }
});

/**
 * POST /api/v1/keys/rotate
 */
apiKeyRouter.post('/rotate', async (req: Request, res: Response) => {
  const parsed = rotateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid body' });
  }
  const { licenseId } = parsed.data;

  const license = LicenseService.getInstance().getLicense(licenseId as string);
  if (!license) {
    return res.status(404).json({ error: 'Not Found', message: `License ${licenseId} not found` });
  }

  try {
    const { key, apiKey } = manager.rotateApiKey(licenseId as string, resolveTier(licenseId as string));
    return res.status(201).json({
      keyId: apiKey.id,
      prefix: apiKey.keyPrefix,
      licenseId: apiKey.licenseId,
      createdAt: apiKey.createdAt,
      key,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to rotate key';
    return res.status(500).json({ error: 'Internal Server Error', message });
  }
});

/**
 * DELETE /api/v1/keys/:keyId
 */
apiKeyRouter.delete('/:keyId', async (req: Request, res: Response) => {
  const { keyId } = req.params;
  const revoked = manager.revokeApiKey(keyId as string);

  if (!revoked) {
    return res.status(404).json({ error: 'Not Found', message: `Key ${keyId} not found` });
  }

  return res.status(200).json({
    keyId: revoked.id,
    licenseId: revoked.licenseId,
    revokedAt: revoked.revokedAt,
    isActive: false,
  });
});

/**
 * GET /api/v1/keys
 */
apiKeyRouter.get('/', async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid query' });
  }
  const { licenseId } = parsed.data;

  const license = LicenseService.getInstance().getLicense(licenseId as string);
  if (!license) {
    return res.status(404).json({ error: 'Not Found', message: `License ${licenseId} not found` });
  }

  const keys = manager.listApiKeys(licenseId as string);
  return res.json({ keys, total: keys.length });
});
