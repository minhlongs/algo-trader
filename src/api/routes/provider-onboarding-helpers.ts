/**
 * Validation Schemas and Serialization Helper for Signal Provider Onboarding Routes
 */

import { z } from 'zod';
import type { ProviderApplication } from '../../agentic/signal-provider-onboarding';

export const applySchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  apiKey: z.string().min(10, 'API key must be at least 10 characters'),
  strategyId: z.string().min(1, 'strategyId is required'),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});

/**
 * Strip sensitive data (such as API keys) and serialize dates to ISO strings.
 */
export function serializeProviderApplication(
  application: ProviderApplication,
): Record<string, unknown> {
  return {
    id: application.id,
    userId: application.userId,
    strategyId: application.strategyId,
    status: application.status,
    backtestResult: application.backtestResult,
    paperTradingResult: application.paperTradingResult,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
    rejectionReason: application.rejectionReason,
  };
}
