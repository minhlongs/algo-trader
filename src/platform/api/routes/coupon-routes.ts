/**
 * Coupon API Routes
 * POST /api/coupons          — Admin: create coupon
 * GET  /api/coupons          — Admin: list coupons
 * POST /api/coupons/apply    — Customer: apply coupon → get NOWPayments checkout URL
 * DELETE /api/coupons/:code  — Admin: deactivate coupon
 */

import { Router, Request, Response } from 'express';
import { CouponService } from '../../billing/coupon-service';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import {
  TIER_PRICES,
  PROJECT_URLS,
  requireAdmin,
  resolveProjectTierConfig,
  createCouponNowPaymentsInvoice,
} from './coupon-routes-helpers';

export {
  TIER_PRICES,
  PROJECT_URLS,
  requireAdmin,
  resolveProjectTierConfig,
  createCouponNowPaymentsInvoice,
};

export const couponRouter: Router = Router();
const couponService = CouponService.getInstance();

couponRouter.post('/', requireTier('FREE'), requireAdmin, async (req: Request, res: Response) => {
  try {
    const coupon = couponService.createCoupon(req.body);
    return res.json({ success: true, coupon });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ error: message });
  }
});

couponRouter.get('/', requireTier('FREE'), requireAdmin, (_req: Request, res: Response) => {
  return res.json({ coupons: couponService.listCoupons() });
});

couponRouter.delete('/:code', requireTier('FREE'), requireAdmin, (req: Request, res: Response) => {
  const ok = couponService.deactivateCoupon(req.params.code as string);
  return res.json({ success: ok });
});

couponRouter.post('/apply', requireTier('FREE'), async (req: Request, res: Response) => {
  const { code, tier, project } = req.body;
  if (!code || !tier) {
    return res.status(400).json({ error: 'code and tier required' });
  }

  const resolved = resolveProjectTierConfig(project, tier);
  if (!resolved.ok) {
    return res.status(400).json({ error: resolved.error });
  }
  const { projectKey, tierKey, tierConfig } = resolved;

  const result = couponService.applyCoupon(code, tierKey, tierConfig.price);
  if (!result.valid) {
    return res.status(400).json({ error: result.error });
  }

  if (result.discountedPrice === 0) {
    couponService.recordUse(code);
    return res.json({
      success: true,
      discountPercent: result.discountPercent,
      originalPrice: tierConfig.price,
      finalPrice: 0,
      message: 'Free access granted',
      checkoutUrl: null,
    });
  }

  try {
    const invoice = await createCouponNowPaymentsInvoice(
      projectKey,
      tierKey,
      code,
      result.discountedPrice,
      result.discountPercent,
    );

    if (!invoice.id) {
      logger.error('[Coupon] NOWPayments invoice creation failed', invoice);
      return res.status(500).json({ error: 'Payment provider error' });
    }

    couponService.recordUse(code);
    return res.json({
      success: true,
      discountPercent: result.discountPercent,
      originalPrice: tierConfig.price,
      finalPrice: result.discountedPrice,
      checkoutUrl: `https://nowpayments.io/payment?iid=${invoice.id}`,
    });
  } catch (err) {
    logger.error('[Coupon] Invoice creation error', { err });
    return res.status(500).json({ error: 'Failed to create payment' });
  }
});
