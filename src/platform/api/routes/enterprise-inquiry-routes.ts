/**
 * Enterprise Inquiry REST Routes
 * POST   /api/v1/enterprise/inquiries         — submit contact form (public)
 * GET    /api/v1/enterprise/inquiries         — list all inquiries (admin only)
 * GET    /api/v1/enterprise/inquiries/:id     — get single inquiry (admin only)
 * PATCH  /api/v1/enterprise/inquiries/:id/status — update status / TAM notes (admin)
 *
 * Auth: POST is public (no JWT required). GET/PATCH require admin JWT claim.
 */

import { Router, Request, Response } from 'express';
import { EnterpriseOnboardingService } from '../../billing/enterprise-onboarding-service';
import { enterpriseInquiryStore, type EnterpriseInquiryStatus } from '../../billing/enterprise-inquiry-store';
import { requireTier } from '../../middleware/feature-gate';

export const enterpriseInquiryRouter: Router = Router();

const onboardingService = EnterpriseOnboardingService.getInstance();

/** Resolve admin flag from JWT claims set by upstream auth middleware. */
function isAdmin(req: Request): boolean {
  const claims = (req as Request & { claims?: { role?: string } }).claims;
  return claims?.role === 'admin';
}

const VALID_STATUSES: EnterpriseInquiryStatus[] = [
  'new', 'tam_notified', 'contacted', 'demo_active',
  'negotiating', 'closed_won', 'closed_lost',
];

/** POST /inquiries — public endpoint: submit enterprise contact form */
enterpriseInquiryRouter.post('/inquiries', requireTier('FREE'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, companyName, contactName, tier, useCase, teamSize } = req.body as Record<string, string>;

    if (!email || !companyName || !contactName || !tier || !useCase) {
      res.status(400).json({ error: 'Missing required fields: email, companyName, contactName, tier, useCase' });
      return;
    }

    const result = await onboardingService.submitInquiry({
      email,
      companyName,
      contactName,
      tier: tier as 'growth' | 'scale' | 'unlimited',
      useCase,
      teamSize,
    });

    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Submission failed';
    const status = message.includes('already exists') ? 409
      : message.includes('Invalid') || message.includes('required') ? 400
      : 500;
    res.status(status).json({ error: message });
  }
});

/** GET /inquiries — admin: list all inquiries sorted by createdAt desc */
enterpriseInquiryRouter.get('/inquiries', requireTier('ENTERPRISE'), (req: Request, res: Response): void => {
  if (!isAdmin(req)) {
    res.status(403).json({ error: 'Forbidden: admin access required' });
    return;
  }

  const inquiries = onboardingService.listInquiries();
  res.json(inquiries);
});

/** GET /inquiries/:id — admin: fetch single inquiry */
enterpriseInquiryRouter.get('/inquiries/:id', requireTier('ENTERPRISE'), (req: Request, res: Response): void => {
  if (!isAdmin(req)) {
    res.status(403).json({ error: 'Forbidden: admin access required' });
    return;
  }

  const inquiry = onboardingService.getInquiry(String(req.params.id ?? ''));
  if (!inquiry) {
    res.status(404).json({ error: 'Inquiry not found' });
    return;
  }

  res.json(inquiry);
});

/** PATCH /inquiries/:id/status — admin: update status, tamAssigned, notes */
enterpriseInquiryRouter.patch('/inquiries/:id/status', requireTier('ENTERPRISE'), (req: Request, res: Response): void => {
  if (!isAdmin(req)) {
    res.status(403).json({ error: 'Forbidden: admin access required' });
    return;
  }

  const id = String(req.params.id ?? '');
  const { status, tamAssigned, notes } = req.body as {
    status?: string;
    tamAssigned?: string;
    notes?: string;
  };

  if (status !== undefined && !VALID_STATUSES.includes(status as EnterpriseInquiryStatus)) {
    res.status(400).json({
      error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
    });
    return;
  }

  const patch: Parameters<typeof enterpriseInquiryStore.update>[1] = {};
  if (status !== undefined) patch.status = status as EnterpriseInquiryStatus;
  if (tamAssigned !== undefined) patch.tamAssigned = tamAssigned;
  if (notes !== undefined) patch.notes = notes;

  const updated = onboardingService.updateInquiry(id, patch);
  if (!updated) {
    res.status(404).json({ error: 'Inquiry not found' });
    return;
  }

  res.json(updated);
});
