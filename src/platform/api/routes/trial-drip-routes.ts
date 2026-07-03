/**
 * Trial Drip Campaign API Routes
 * Manage trial-to-paid email drip campaigns.
 *
 * Endpoints:
 * - POST   /api/v1/trial-drip/subscribe      — Register for drip campaign
 * - POST   /api/v1/trial-drip/unsubscribe    — Unsubscribe from campaign
 * - POST   /api/v1/trial-drip/process        — Trigger due email processing
 * - GET    /api/v1/trial-drip/status         — Get campaign state
 * - GET    /api/v1/trial-drip/subscriber/:id — Get subscriber details
 */

import { Router, Request, Response } from 'express';
import { TrialDripService } from '../../billing/trial-drip-service';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';

export const trialDripRouter: Router = Router();
const trialDripService = TrialDripService.getInstance();

/**
 * POST /subscribe
 * Register a tenant for the trial-to-paid email drip campaign.
 */
trialDripRouter.post('/subscribe', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const { email, tenantId, tier, trialDays } = req.body as {
      email?: string;
      tenantId?: string;
      tier?: string;
      trialDays?: number;
    };

    if (!email || !tenantId || !tier) {
      res.status(400).json({ error: 'Missing required fields: email, tenantId, tier' });
      return;
    }

    const subscriber = await trialDripService.subscribe(email, tenantId, tier, trialDays);
    res.status(201).json({ data: subscriber });
  } catch (error) {
    logger.error('[TrialDrip] Subscribe error:', { error: String(error) });
    res.status(500).json({ error: 'Failed to subscribe to drip campaign' });
  }
});

/**
 * POST /unsubscribe
 * Remove a tenant from the drip campaign.
 */
trialDripRouter.post('/unsubscribe', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.body as { tenantId?: string };

    if (!tenantId) {
      res.status(400).json({ error: 'Missing required field: tenantId' });
      return;
    }

    const unsubscribed = await trialDripService.unsubscribe(tenantId);
    if (!unsubscribed) {
      res.status(404).json({ error: 'Subscriber not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('[TrialDrip] Unsubscribe error:', { error: String(error) });
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

/**
 * POST /process
 * Manually trigger processing of due drip emails.
 * Typically called by a cron job.
 */
trialDripRouter.post('/process', requireTier('PRO'), async (_req: Request, res: Response) => {
  try {
    const result = await trialDripService.processDueEmails();
    res.json(result);
  } catch (error) {
    logger.error('[TrialDrip] Process error:', { error: String(error) });
    res.status(500).json({ error: 'Failed to process drip emails' });
  }
});

/**
 * GET /status
 * Get current campaign state summary.
 */
trialDripRouter.get('/status', requireTier('PRO'), async (_req: Request, res: Response) => {
  try {
    const state = await trialDripService.getState();
    res.json(state);
  } catch (error) {
    logger.error('[TrialDrip] Status error:', { error: String(error) });
    res.status(500).json({ error: 'Failed to get campaign state' });
  }
});

/**
 * GET /subscriber/:id
 * Get details for a specific subscriber.
 */
trialDripRouter.get('/subscriber/:id', requireTier('PRO'), async (req: Request, res: Response) => {
  try {
    const subscriber = await trialDripService.getSubscriber(String(req.params.id));
    if (!subscriber) {
      res.status(404).json({ error: 'Subscriber not found' });
      return;
    }
    res.json({ data: subscriber });
  } catch (error) {
    logger.error('[TrialDrip] Get subscriber error:', { error: String(error) });
    res.status(500).json({ error: 'Failed to get subscriber' });
  }
});
