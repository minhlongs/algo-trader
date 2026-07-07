/**
 * Signal Provider Onboarding Routes
 * Mounts at /api/providers
 *
 * Public flow — no RaaS auth gate; signed-up users apply to become providers.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { SignalProviderOnboarding, type ProviderApplication } from '../../agentic/signal-provider-onboarding';
import { logger } from '../../shared/utils/logger';

export const providerOnboardingRouter: Router = Router();
const onboarding = new SignalProviderOnboarding();

const applySchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  apiKey: z.string().min(10, 'API key must be at least 10 characters'),
  strategyId: z.string().min(1, 'strategyId is required'),
});

const approveSchema = z.object({
  applicationId: z.string().min(1, 'applicationId is required'),
});

const idParamSchema = z.object({
  id: z.string().min(1),
});

/**
 * POST /api/providers/apply
 * Submit a new provider application
 */
providerOnboardingRouter.post('/apply', async (req: Request, res: Response) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid body', issues: parsed.error.issues });
  }

  const { userId, apiKey, strategyId } = parsed.data;

  try {
    const application = await onboarding.submitApplication(userId, apiKey, strategyId);
    return res.status(201).json(serialize(application));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to submit application';
    logger.error('[ProviderOnboardingRoutes] submit failed', { err, message });
    return res.status(400).json({ error: message });
  }
});

/**
 * POST /api/providers/:id/verify
 * Trigger API key verification for an application
 */
providerOnboardingRouter.post('/:id/verify', async (req: Request, res: Response) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const { id } = params.data;

  try {
    const passed = await onboarding.verifyApiKeys(id);
    const application = await onboarding.getApplication(id);
    if (!application) {
      return res.status(404).json({ error: 'Not Found', message: `Application ${id} not found` });
    }
    return res.json({ verified: passed, application: serialize(application) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    logger.error('[ProviderOnboardingRoutes] verify failed', { id, err, message });
    return res.status(400).json({ error: message });
  }
});

/**
 * POST /api/providers/:id/backtest
 * Run backtest validation
 */
providerOnboardingRouter.post('/:id/backtest', async (req: Request, res: Response) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const { id } = params.data;

  try {
    const application = await onboarding.getApplication(id);
    if (!application) {
      return res.status(404).json({ error: 'Not Found', message: `Application ${id} not found` });
    }

    const result = await onboarding.runBacktest(id, application.strategyId);
    const updated = await onboarding.getApplication(id);
    return res.json({ backtestResult: result, application: serialize(updated!) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Backtest failed';
    logger.error('[ProviderOnboardingRoutes] backtest failed', { id, err, message });
    return res.status(400).json({ error: message });
  }
});

/**
 * POST /api/providers/:id/paper-trade
 * Start 7-day paper trading simulation
 */
providerOnboardingRouter.post('/:id/paper-trade', async (req: Request, res: Response) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const { id } = params.data;

  try {
    await onboarding.startPaperTrading(id);
    const application = await onboarding.getApplication(id);
    if (!application) {
      return res.status(404).json({ error: 'Not Found', message: `Application ${id} not found` });
    }
    return res.json({ application: serialize(application) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Paper trading failed';
    logger.error('[ProviderOnboardingRoutes] paper-trade failed', { id, err, message });
    return res.status(400).json({ error: message });
  }
});

/**
 * POST /api/providers/:id/approve
 * Approve an application that has passed all stages
 */
providerOnboardingRouter.post('/:id/approve', async (req: Request, res: Response) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const { id } = params.data;

  try {
    await onboarding.approveApplication(id);
    const application = await onboarding.getApplication(id);
    if (!application) {
      return res.status(404).json({ error: 'Not Found', message: `Application ${id} not found` });
    }
    return res.json({ application: serialize(application) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Approval failed';
    logger.error('[ProviderOnboardingRoutes] approve failed', { id, err, message });
    return res.status(400).json({ error: message });
  }
});

/**
 * GET /api/providers/:id
 * Get current application status
 */
providerOnboardingRouter.get('/:id', async (req: Request, res: Response) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const { id } = params.data;
  const application = await onboarding.getApplication(id);

  if (!application) {
    return res.status(404).json({ error: 'Not Found', message: `Application ${id} not found` });
  }

  return res.json({ application: serialize(application) });
});

// --- Serialization helper (strip sensitive data + ensure ISO dates) ---

function serialize(application: ProviderApplication): Record<string, unknown> {
  return {
    id: application.id,
    userId: application.userId,
    strategyId: application.strategyId,
    status: application.status,
    backtestResult: application.backtestResult,
    paperTradingResult: application.paperTradingResult,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
    rejectionReason: application.rejectionReason,
  };
}
