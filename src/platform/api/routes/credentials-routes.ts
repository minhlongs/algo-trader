import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { TenantCredentialsRepository } from '../../db/tenant-credentials-repository';
import { assertTenantAccess } from '../../raas/subscriber-tenant-isolator';
import {
  emitCredentialUpsertAuditEvent,
  emitCredentialDeletionAuditEvent,
} from '../../audit/audit-hooks';
import { validateTenantId, type TenantId } from '../../../shared/tenant';

export const credentialsRouter: Router = Router();
const repository = new TenantCredentialsRepository();

const bodySchema = z.object({
  apiKey: z.string({ message: 'API key is required' }).min(1, 'API key is required'),
  apiSecret: z.string({ message: 'API secret is required' }).min(1, 'API secret is required'),
  passphrase: z.string().optional(),
  privateKey: z.string().optional(),
});

function extractTokenClaims(req: Request): {
  tokenSubscriberId: string | null;
  isAdmin: boolean;
} {
  const claims = (req as Request & { claims?: { sub?: string; role?: string } }).claims;
  return {
    tokenSubscriberId: claims?.sub ?? null,
    isAdmin: claims?.role === 'admin',
  };
}

/** Resolve + validate the caller's subscriber identity, or respond 403. */
function resolveSubscriber(
  req: Request,
  res: Response,
): TenantId | null {
  const { tokenSubscriberId, isAdmin } = extractTokenClaims(req);
  if (!tokenSubscriberId) {
    res.status(403).json({ error: 'TenantIsolator: no subscriber identity in token' });
    return null;
  }
  try {
    if (!validateTenantId(tokenSubscriberId)) {
      throw new Error(`TenantIsolator: invalid tenantId: ${tokenSubscriberId}`);
    }
    assertTenantAccess(tokenSubscriberId, tokenSubscriberId, isAdmin);
    return tokenSubscriberId as TenantId;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(403).json({ error: message });
    return null;
  }
}

/** POST / — ingest encrypted credentials for the caller's tenant. */
credentialsRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid body' });
    return;
  }

  const subscriberId = resolveSubscriber(req, res);
  if (!subscriberId) return;

  try {
    await repository.save(subscriberId, {
      apiKey: parsed.data.apiKey,
      apiSecret: parsed.data.apiSecret,
      passphrase: parsed.data.passphrase ?? null,
      privateKey: parsed.data.privateKey ?? null,
      publicKey: null,
    });
    await emitCredentialUpsertAuditEvent({
      tenantId: subscriberId,
      actionBy: subscriberId,
      endpoint: 'POST /api/v1/subscriber/credentials',
    });
    res.status(201).json({ status: 'success', message: 'Credentials ingested successfully' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/** GET / — report which credential fields are configured (secrets never returned). */
credentialsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const subscriberId = resolveSubscriber(req, res);
  if (!subscriberId) return;

  try {
    const credentials = await repository.get(subscriberId);
    if (!credentials) {
      res.status(200).json({ configured: false, fields: {} });
      return;
    }
    res.status(200).json({
      configured: true,
      fields: {
        apiKey: credentials.apiKey !== null,
        apiSecret: credentials.apiSecret !== null,
        passphrase: credentials.passphrase !== null,
        privateKey: credentials.privateKey !== null,
        publicKey: credentials.publicKey !== null,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/** DELETE / — remove all credentials for the caller's tenant (audited). */
credentialsRouter.delete('/', async (req: Request, res: Response): Promise<void> => {
  const subscriberId = resolveSubscriber(req, res);
  if (!subscriberId) return;

  try {
    const existed = await repository.exists(subscriberId);
    await repository.delete(subscriberId);
    if (existed) {
      await emitCredentialDeletionAuditEvent({
        tenantId: subscriberId,
        actionBy: subscriberId,
        endpoint: 'DELETE /api/v1/subscriber/credentials',
      });
    }
    res.status(200).json({ status: 'success', message: 'Credentials deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});
