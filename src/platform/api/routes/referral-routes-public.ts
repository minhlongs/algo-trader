/**
 * Referral API Routes — Public handlers
 * POST /track-click, POST /validate
 */

import { Request, Response } from 'express';
import { referralService } from '../../referral/referral-service';
import { trackClickSchema, validateReferralSchema } from '../schemas/referral.schemas';
import { logger } from '../../../shared/utils/logger';

/**
 * POST /api/v1/referral/track-click
 * Public endpoint to track a referral link click
 * No authentication required, but rate limited
 */
export async function handleTrackClick(req: Request, res: Response) {
  const { code } = req.query as { code?: string };
  const parsed = trackClickSchema.safeParse(req.body);

  if (!code) {
    return res.status(400).json({ error: 'Referral code is required in query parameter' });
  }
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request body' });
  }

  try {
    const tracking = await referralService.trackReferralClick(
      code,
      parsed.data.ip,
      parsed.data.userAgent,
      parsed.data.metadata
    );
    return res.status(201).json({ data: tracking });
  } catch (error) {
    logger.error('[ReferralRoutes] Failed to track click', {
  cause: error instanceof Error ? error.message : String(error),
});
    const message = error instanceof Error ? error.message : 'Failed to track click';
    return res.status(400).json({ error: message });
  }
}

/**
 * POST /api/v1/referral/validate
 * Validate a referral code (used during signup)
 * Public endpoint
 */
export async function handleValidate(req: Request, res: Response) {
  const parsed = validateReferralSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request body' });
  }

  try {
    const { referralCode, tenantId: newTenantId } = parsed.data;

    // Check if code exists and is valid
    const codeInfo = await referralService.getReferralCodeByCode(referralCode);
    if (!codeInfo) {
      return res.status(404).json({
        data: {
          isValid: false,
          code: referralCode,
          referringTenantId: null,
          message: 'Invalid referral code',
        },
      });
    }

    if (!codeInfo.isActive) {
      return res.json({
        data: {
          isValid: false,
          code: referralCode,
          referringTenantId: codeInfo.tenantId,
          message: 'Referral code is inactive',
        },
      });
    }

    if (codeInfo.maxUses !== null && codeInfo.usedCount >= codeInfo.maxUses) {
      return res.json({
        data: {
          isValid: false,
          code: referralCode,
          referringTenantId: codeInfo.tenantId,
          message: 'Referral code has reached maximum uses',
        },
      });
    }

    // Cannot refer yourself (basic check - would need IP validation for stronger guarantee)
    // This is a placeholder; actual self-referral prevention happens at conversion time

    return res.json({
      data: {
        isValid: true,
        code: referralCode,
        referringTenantId: codeInfo.tenantId,
        message: 'Referral code is valid',
      },
    });
  } catch (error) {
    logger.error('[ReferralRoutes] Failed to validate code', {
  cause: error instanceof Error ? error.message : String(error),
});
    return res.status(500).json({ error: 'Failed to validate referral code' });
  }
}
