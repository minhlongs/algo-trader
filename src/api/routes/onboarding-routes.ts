import { Router, Request, Response } from 'express';
import { OnboardingService } from '@platform/billing/onboarding-service';
import { z } from 'zod';

export const onboardingRouter: Router = Router();
const onboardingService = OnboardingService.getInstance();

const signupBodySchema = z.object({
  email: z.string().email('Invalid email address'),
  tier: z.enum(['FREE', 'PRO', 'ENTERPRISE']),
  walletAddress: z.string().optional(),
});

const verifyBodySchema = z.object({
  email: z.string().min(1, 'Email is required'),
  code: z.string().length(6, 'Verification code must be exactly 6 characters'),
});

const activateBodySchema = z.object({
  email: z.string().min(1, 'Email is required'),
});

/**
 * POST /api/v1/signup
 */
onboardingRouter.post('/signup', async (req: Request, res: Response) => {
  const parsed = signupBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid body' });
  }

  try {
    const result = await onboardingService.signup(parsed.data);
    return res.status(201).json({
      pendingId: result.pendingId,
      message: 'Verification code sent. Check server logs for the code (email integration pending).',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Signup failed';
    const status = message.includes('already') ? 409 : 400;
    return res.status(status).json({ error: message });
  }
});

/**
 * POST /api/v1/verify
 */
onboardingRouter.post('/verify', async (req: Request, res: Response) => {
  const parsed = verifyBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid body' });
  }

  try {
    await onboardingService.verify(parsed.data.email, parsed.data.code);
    return res.json({ verified: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    const status = message.includes('expired') ? 410 : 400;
    return res.status(status).json({ error: message });
  }
});

/**
 * POST /api/v1/activate
 */
onboardingRouter.post('/activate', async (req: Request, res: Response) => {
  const parsed = activateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid body' });
  }

  try {
    const result = await onboardingService.activate(parsed.data.email);
    return res.status(201).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Activation failed';
    const status = message.includes('expired') ? 410
      : message.includes('not verified') ? 403
      : 400;
    return res.status(status).json({ error: message });
  }
});
