/**
 * Marketplace Badge Routes
 * Listing quality badges for strategy marketplace.
 *
 * Endpoints:
 *   GET    /api/v1/marketplace/listings/:id/badges       — Get badges for a listing
 *   POST   /api/v1/marketplace/listings/:id/badges/refresh — Refresh badges for a listing (PRO+)
 *   GET    /api/v1/marketplace/badges/definitions         — Get all badge definitions
 *   POST   /api/v1/marketplace/badges/refresh-all         — Refresh all badges (admin only)
 */
import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import { getDbClient } from '../../../shared/db/postgres-client';
import { getTenantId, isAdmin } from './marketplace-strategy-helpers';
import {
  getListingBadges,
  getBadgeDefinitions,
  refreshListingBadges,
  refreshAllListingBadges,
} from '../../marketplace/services/badge-service';

// ── Listing-scoped badge routes (mounted at /api/v1/marketplace/listings) ──

export const marketplaceListingBadgeRouter: RouterType = Router();

/**
 * GET /:listingId/badges — Get badges for a specific listing
 */
marketplaceListingBadgeRouter.get('/:listingId/badges', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const listingId = req.params.listingId as string;

    const db = getDbClient();
    const listing = await db.query(
      `SELECT id FROM marketplace_listings WHERE id = $1`,
      [listingId],
    );
    if (listing.rows.length === 0) {
      return res.status(404).json({ error: 'Not found', message: 'Listing not found' });
    }

    const badges = await getListingBadges(listingId);

    return res.json({ listingId, badges });
  } catch (error) {
    logger.error('[BadgeRoutes] Error fetching badges', { error, listingId: req.params.listingId });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to fetch badges' });
  }
});

/**
 * POST /:listingId/badges/refresh — Refresh badges for a listing (PRO+)
 */
marketplaceListingBadgeRouter.post('/:listingId/badges/refresh', requireTier('PRO'), async (req: Request, res: Response) => {
  try {
    const listingId = req.params.listingId as string;
    const tenantId = getTenantId(req);
    const isUserAdmin = isAdmin(req);

    const db = getDbClient();
    const listingResult = await db.query(
      `SELECT id, strategy_id, tenant_id FROM marketplace_listings WHERE id = $1`,
      [listingId],
    );

    if (listingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Not found', message: 'Listing not found' });
    }

    const listing = listingResult.rows[0] as Record<string, unknown>;
    if (!isUserAdmin && listing.tenant_id !== tenantId) {
      return res.status(403).json({ error: 'Forbidden', message: 'You do not own this listing' });
    }

    const badges = await refreshListingBadges(listingId, listing.strategy_id as string);

    logger.info('[BadgeRoutes] Badges refreshed', { listingId, tenantId, badges });

    return res.json({ listingId, badges });
  } catch (error) {
    logger.error('[BadgeRoutes] Error refreshing badges', { error, listingId: req.params.listingId });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to refresh badges' });
  }
});

// ── Global badge routes (mounted at /api/v1/marketplace/badges) ──

export const marketplaceBadgeDefinitionRouter: RouterType = Router();

/**
 * GET /definitions — Get all badge definitions
 */
marketplaceBadgeDefinitionRouter.get('/definitions', requireTier('FREE'), async (_req: Request, res: Response) => {
  try {
    const definitions = await getBadgeDefinitions();
    return res.json({ data: definitions });
  } catch (error) {
    logger.error('[BadgeRoutes] Error fetching badge definitions', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to fetch badge definitions' });
  }
});

/**
 * POST /refresh-all — Refresh badges for all listings (admin only)
 */
marketplaceBadgeDefinitionRouter.post('/refresh-all', requireTier('ENTERPRISE'), async (req: Request, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
    }

    const result = await refreshAllListingBadges();

    logger.info('[BadgeRoutes] Bulk badge refresh complete', result);

    return res.json(result);
  } catch (error) {
    logger.error('[BadgeRoutes] Error in bulk badge refresh', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to refresh badges' });
  }
});
