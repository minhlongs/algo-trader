import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { TenantCredentialsRepository } from '../../db/tenant-credentials-repository';
import { assertTenantAccess } from '../../raas/subscriber-tenant-isolator';
import {
  emitCredentialUpsertAuditEvent,
  emitCredentialDeletionAuditEvent,
} from '../../audit/audit-hooks';
import { validateTenantId } from '../../../shared/tenant';

export const credentialsRouter: Router = Router();
const repository = new TenantCredentialsRepository();

const bodySchema = z.object({
  apiKey: z.string({ message: 'API key is required' }).min(1, 'API key is required'),
  apiSecret: z.string({ message: 'API secret is required' }).min(1, 'API secret is required'),
  passphrase: z.string({ message: 'Passphrase is required' }).min(1, 'Passphrase is required'),
  privateKey: z.string({ message: 'Private key is required' }).min(1, 'Private key is required'),
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

credentialsRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid body' });
    return;
  }

  const { tokenSubscriberId, isAdmin } = extractTokenClaims(req);
  if (!tokenSubscriberId) {
    res.status(403).json({ error: 'TenantIsolator: no subscriber identity in token' });
    return;
  }

  const subscriberId = tokenSubscriberId;

  try {
    // Runtime-validate for TenantId type safety — invalid IDs are treated as access errors
    if (!validateTenantId(subscriberId)) {
      throw new Error(`TenantIsolator: invalid tenantId: ${subscriberId}`);
    }
    assertTenantAccess(subscriberId, tokenSubscriberId, isAdmin);

    await repository.save(subscriberId, parsed.data);
      await emitCredentialUpsertAuditEvent({
        tenantId: subscriberId,
        actionBy: tokenSubscriberId,
        endpoint: 'POST /api/v1/subscriber/credentials',
      });
    res.status(201).json({ status: 'success', message: 'Credentials ingested successfully' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('cross-tenant') || message.includes('no subscriber identity')) {
      res.status(403).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});
