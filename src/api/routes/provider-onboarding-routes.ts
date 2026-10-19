/**
 * Signal Provider Onboarding Routes
 * Mounts at /api/providers
 *
 * Public flow — no RaaS auth gate; signed-up users apply to become providers.
 */

import { Router, Request, Response } from 'express';
import { SignalProviderOnboarding } from '../../agentic/signal-provider-onboarding';
import {
  applySchema,
  idParamSchema,
  serializeProviderApplication,
  parseIdParam,
  sendNotFound,
  handleOnboardingError,
} from './provider-onboarding-helpers';

export {
  applySchema,
  idParamSchema,
  serializeProviderApplication,
  parseIdParam,
  sendNotFound,
  handleOnboardingError,
};

export const providerOnboardingRouter: Router = Router();
const onboarding = new SignalProviderOnboarding();

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
    return res.status(201).json(serializeProviderApplication(application));
  } catch (err: unknown) {
    return handleOnboardingError(res, 'submit', 'Failed to submit application', err);
  }
});

/**
 * POST /api/providers/:id/verify
 * Trigger API key verification for an application
 */
providerOnboardingRouter.post('/:id/verify', async (req: Request, res: Response) => {
  const id = parseIdParam(req, res);
  if (!id) return;

  try {
    const passed = await onboarding.verifyApiKeys(id);
    const application = await onboarding.getApplication(id);
    if (!application) return sendNotFound(res, id);
    return res.json({ verified: passed, application: serializeProviderApplication(application) });
  } catch (err: unknown) {
    return handleOnboardingError(res, 'verify', 'Verification failed', err, id);
  }
});

/**
 * POST /api/providers/:id/backtest
 * Run backtest validation
 */
providerOnboardingRouter.post('/:id/backtest', async (req: Request, res: Response) => {
  const id = parseIdParam(req, res);
  if (!id) return;

  try {
    const application = await onboarding.getApplication(id);
    if (!application) return sendNotFound(res, id);

    const result = await onboarding.runBacktest(id, application.strategyId);
    const updated = await onboarding.getApplication(id);
    return res.json({ backtestResult: result, application: serializeProviderApplication(updated!) });
  } catch (err: unknown) {
    return handleOnboardingError(res, 'backtest', 'Backtest failed', err, id);
  }
});

/**
 * POST /api/providers/:id/paper-trade
 * Start 7-day paper trading simulation
 */
providerOnboardingRouter.post('/:id/paper-trade', async (req: Request, res: Response) => {
  const id = parseIdParam(req, res);
  if (!id) return;

  try {
    await onboarding.startPaperTrading(id);
    const application = await onboarding.getApplication(id);
    if (!application) return sendNotFound(res, id);
    return res.json({ application: serializeProviderApplication(application) });
  } catch (err: unknown) {
    return handleOnboardingError(res, 'paper-trade', 'Paper trading failed', err, id);
  }
});

/**
 * POST /api/providers/:id/approve
 * Approve an application that has passed all stages
 */
providerOnboardingRouter.post('/:id/approve', async (req: Request, res: Response) => {
  const id = parseIdParam(req, res);
  if (!id) return;

  try {
    await onboarding.approveApplication(id);
    const application = await onboarding.getApplication(id);
    if (!application) return sendNotFound(res, id);
    return res.json({ application: serializeProviderApplication(application) });
  } catch (err: unknown) {
    return handleOnboardingError(res, 'approve', 'Approval failed', err, id);
  }
});

/**
 * GET /api/providers/:id
 * Get current application status
 */
providerOnboardingRouter.get('/:id', async (req: Request, res: Response) => {
  const id = parseIdParam(req, res);
  if (!id) return;

  const application = await onboarding.getApplication(id);
  if (!application) return sendNotFound(res, id);

  return res.json({ application: serializeProviderApplication(application) });
});
