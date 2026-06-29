/**
 * Referral API Schemas
 * Zod validation schemas for referral endpoints
 */

import { z } from 'zod';

export const trackClickSchema = z.object({
  ip: z.union([z.string().ipv4(), z.string().ipv6()]),
  userAgent: z.string().max(512),
  metadata: z
    .object({
      campaign: z.string().optional(),
      landingPage: z.string().optional(),
      utmSource: z.string().optional(),
      utmMedium: z.string().optional(),
      utmCampaign: z.string().optional(),
      deviceType: z.enum(['desktop', 'mobile', 'tablet']).optional(),
      browser: z.string().optional(),
    })
    .optional(),
});

export const generateCodeSchema = z.object({
  tenantId: z.string().optional(),
});

export const validateReferralSchema = z.object({
  referralCode: z.string().length(8),
  tenantId: z.string(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  status: z.enum(['pending', 'approved', 'paid', 'void']).optional(),
});

export const commissionStatusSchema = z.enum(['pending', 'approved', 'paid', 'void']);
