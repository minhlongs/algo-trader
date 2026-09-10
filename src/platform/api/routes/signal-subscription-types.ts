/**
 * Signal Subscription Routes - Schemas and Types
 */

import { z } from 'zod';

export const subscribeBodySchema = z.object({
  chatId: z.number().int().optional(),
});

export const checkoutBodySchema = z.object({
  tier: z.enum(['SIGNALS_BASIC', 'SIGNALS_PRO', 'SIGNALS_ENTERPRISE']),
});
