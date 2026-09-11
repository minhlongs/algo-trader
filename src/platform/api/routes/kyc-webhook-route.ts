/**
 * KYC Webhook Route Handler (POST /webhook)
 * Phase 35 Compliance — Persona verification status callback receiver (no tier auth).
 */
import type { Request, Response, Router as RouterType } from 'express';
import { logger } from '../../../shared/utils/logger';
import { getDbClient } from '../../../shared/db/postgres-client';
import { verifyHmacSha256 } from '../../../shared/utils/hmac-verifier';
import { ALLOWED_STATUSES } from './kyc-types';

export function registerKycWebhookRoute(router: RouterType): void {
  /** POST /webhook — receive Persona verification status update */
  router.post('/webhook', async (req: Request, res: Response) => {
    try {
      const webhookSecret = process.env.PERSONA_WEBHOOK_SECRET ?? '';
      const signature = req.headers['x-signature-256'] as string | undefined;
      const tsHeader = req.headers['x-timestamp'] as string | undefined;

      if (!webhookSecret) {
        logger.error('[KYC] PERSONA_WEBHOOK_SECRET not configured');
        return res.status(500).json({ error: 'Webhook not configured' });
      }

      if (!signature) {
        return res.status(401).json({ error: 'Missing signature' });
      }

      if (!tsHeader) {
        return res.status(401).json({ error: 'Missing timestamp' });
      }

      const tsSeconds = Number(tsHeader);
      if (Number.isNaN(tsSeconds)) {
        return res.status(401).json({ error: 'Invalid timestamp' });
      }

      const rawBody = JSON.stringify(req.body);
      if (!verifyHmacSha256(rawBody, signature, webhookSecret, tsSeconds)) {
        logger.warn('[KYC] Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const { tenantId, status, id: verificationId, providerReference } = req.body as {
        tenantId?: string;
        status?: string;
        id?: string;
        providerReference?: string;
      };

      if (!tenantId || !status || !verificationId) {
        return res.status(400).json({ error: 'Missing required fields: tenantId, status, id' });
      }

      if (!(ALLOWED_STATUSES as readonly string[]).includes(status)) {
        return res.status(400).json({ error: `Invalid status: must be one of ${ALLOWED_STATUSES.join(', ')}` });
      }

      const db = getDbClient();
      const ref = providerReference ?? verificationId;

      // Find existing verification by provider_reference
      const existing = await db.query(
        'SELECT id FROM kyc_verifications WHERE provider_reference = $1 AND tenant_id = $2',
        [ref, tenantId],
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Verification not found' });
      }

      const verifiedAt = status === 'approved' ? 'NOW()' : 'NULL';

      await db.query(
        `UPDATE kyc_verifications
         SET status = $1,
             verified_at = ${verifiedAt},
             updated_at = NOW()
         WHERE provider_reference = $2 AND tenant_id = $3`,
        [status, ref, tenantId],
      );

      logger.info('[KYC] Webhook processed', { tenantId, status, verificationId });

      return res.status(200).json({ received: true, verificationId, status });
    } catch (error) {
      logger.error('[KYC] Error processing webhook', { error });
      return res.status(500).json({ error: 'Internal server error', message: 'Failed to process webhook' });
    }
  });
}
