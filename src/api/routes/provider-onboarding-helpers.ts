/**
 * Validation Schemas and Serialization/Response Helpers for Signal Provider Onboarding Routes
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import type { ProviderApplication } from '../../agentic/signal-provider-onboarding';
import { logger } from '../../shared/utils/logger';

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

export function parseIdParam(req: Request, res: Response): string | null {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: 'Invalid id' });
    return null;
  }
  return params.data.id;
}

export function sendNotFound(res: Response, id: string): Response {
  return res.status(404).json({ error: 'Not Found', message: `Application ${id} not found` });
}

export function handleOnboardingError(
  res: Response,
  action: string,
  fallbackMessage: string,
  err: unknown,
  id?: string,
): Response {
  const message = err instanceof Error ? err.message : fallbackMessage;
  logger.error(
    `[ProviderOnboardingRoutes] ${action} failed`,
    id ? { id, err, message } : { err, message },
  );
  return res.status(400).json({ error: message });
}
