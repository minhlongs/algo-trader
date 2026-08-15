/**
 * Marketplace Subscription Routes — Validation schemas
 *
 * Zod schemas for request validation across all subscription endpoints.
 * Exported for use by route handlers and tests.
 */
import { z } from 'zod';

/** POST / — subscribe to a strategy listing */
export const subscribeSchema = z.object({
  listingId: z.string().min(1),
  allocationPercent: z.number().int().min(1).max(100),
  customRiskLimits: z
    .object({
      maxDailyLossPercent: z.number().optional(),
      maxPositionSizePercent: z.number().optional(),
    })
    .optional(),
});

/** PATCH /:id — update subscription (pause/resume/cancel) */
export const updateSubscriptionSchema = z.object({
  status: z.enum(['active', 'paused', 'cancelled']),
  reason: z.string().optional(),
});

/** GET / — list subscriptions query params */
export const subscriptionFilterSchema = z.object({
  status: z.enum(['active', 'paused', 'cancelled', 'all']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

/** POST /execute-strategy — execute strategy across all subscribers (needs strategyId) */
export const executeSchema = z.object({
  strategyId: z.string().min(1),
  marketPayload: z.record(z.string(), z.unknown()).default({}),
});

/** POST /:id/execute — trigger execution for a single subscription */
export const executeSingleSchema = z.object({
  marketPayload: z.record(z.string(), z.unknown()).default({}),
});
