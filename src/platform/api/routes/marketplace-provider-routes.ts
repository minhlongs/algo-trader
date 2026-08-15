/**
 * Marketplace Provider Routes
 * Provider onboarding, profile, dashboard metrics
 *
 * POST   /api/v1/marketplace/providers/register
 * GET    /api/v1/marketplace/providers/:tenantId
 * PATCH  /api/v1/marketplace/providers/:tenantId/profile
 * GET    /api/v1/marketplace/providers/:tenantId/dashboard
 */

import { Router, Request, Response, response } from 'express';
import type { Router as RouterType } from 'express';
import { z } from 'zod';
import { providerRepository } from '../../marketplace/repositories/provider-repository';
import { strategyVersionRepository } from '../../marketplace/repositories/strategy-version-repository';
import { revenueShareRepository } from '../../marketplace/repositories/revenue-share-repository';
import { requireTier } from '../../middleware/feature-gate';
import type { IMarketplaceRevenueShare } from '../../marketplace/models/types';
import { logger } from '../../../shared/utils/logger';

export const marketplaceProviderRouter: RouterType = Router();

const registerProviderSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  displayName: z.string().min(2).max(255),
  bio: z.string().max(2000).optional(),
  payoutAddress: z.string().max(128).optional(),
});

const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(255).optional(),
  bio: z.string().max(2000).optional().nullable(),
  payoutAddress: z.string().max(128).optional().nullable(),
});

/**
 * Authenticate tenant — parent route should have already resolved req.tenant / req.user.
 * For this initial implementation we rely on getTenantId helper logic.
 */
function getTenantIdFromReq(req: Request): string {
  const tenantId =
    (req.body as Record<string, string> | undefined)?.tenantId ??
    (req.query as Record<string, string>).tenantId ??
    (req.params as Record<string, string>).tenantId;
  if (!tenantId) throw new Error('tenantId required');
  return tenantId;
}

/**
 * POST /api/v1/marketplace/providers/register
 * Register a tenant as a signal provider.
 */
marketplaceProviderRouter.post(
  '/register',
  requireTier('PRO'),
  async (req: Request, res: Response) => {
    try {
      const parsed = registerProviderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: 'Invalid request', details: parsed.error.issues });
      }
      const { tenantId, userId, displayName, bio, payoutAddress } = parsed.data;
      const providerId = `prov_${Date.now()}_${userId.slice(0, 8)}`;
      const profile = await providerRepository.create({
        id: providerId,
        tenantId,
        userId,
        displayName,
        bio,
        payoutAddress,
        status: 'approved',
      });
      return res.status(201).json({ provider: profile });
    } catch (err) {
      logger.error('[ProviderRoutes] register failed', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  },
);

/**
 * GET /api/v1/marketplace/providers/:tenantId
 * Get provider profile.
 */
marketplaceProviderRouter.get(
  '/:tenantId',
  requireTier('FREE'),
  async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params as Record<string, string>;
      const profile = await providerRepository.findByTenant(tenantId);
      if (!profile) return res.status(404).json({ error: 'Provider not found' });
      return res.json({ provider: profile });
    } catch (err) {
      logger.error('[ProviderRoutes] get failed', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  },
);

/**
 * PATCH /api/v1/marketplace/providers/:tenantId/profile
 * Update provider profile.
 */
marketplaceProviderRouter.patch(
  '/:tenantId/profile',
  requireTier('FREE'),
  async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params as Record<string, string>;
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: 'Invalid request', details: parsed.error.issues });
      }
      const existing = await providerRepository.findByTenant(tenantId);
      if (!existing)
        return res.status(404).json({ error: 'Provider profile not found' });
      const updated = await providerRepository.update(existing.id, parsed.data);
      return res.json({ provider: updated });
    } catch (err) {
      logger.error('[ProviderRoutes] patch failed', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  },
);

/**
 * GET /api/v1/marketplace/providers/:tenantId/dashboard
 * Dashboard: subscriber count, active strategies, revenue.
 */
marketplaceProviderRouter.get(
  '/:tenantId/dashboard',
  requireTier('FREE'),
  async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params as Record<string, string>;
      const profile = await providerRepository.findByTenant(tenantId);
      if (!profile)
        return res.status(404).json({ error: 'Provider profile not found' });
      const [activeStrategyCount, revenueRows] = await Promise.all([
        strategyVersionRepository.countByTenant(tenantId),
        revenueShareRepository.findAll({
          tenantId,
        }),
      ]);
      const totalCents = revenueRows.data.reduce(
        (s: number, r) => s + r.creatorShareCents,
        0,
      );
      const pendingCents = revenueRows.data
        .filter((r) => r.status === 'pending')
        .reduce(
          (s: number, r) => s + r.creatorShareCents,
          0,
        );
      const metrics = {
        provider: profile,
        earningsCents: totalCents,
        subscriberCount: 0,
        activeStrategies: activeStrategyCount as number,
        totalRevenueCents: totalCents,
        pendingSettlementCents: pendingCents,
      };
      return res.json({ metrics });
    } catch (err) {
      logger.error('[ProviderRoutes] dashboard failed', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  },
);

export default marketplaceProviderRouter;
