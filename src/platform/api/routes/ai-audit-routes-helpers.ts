/**
 * AI Decision Audit Route Schemas, Auth & Formatting Helpers
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { auth } from '../../auth/auth-server';
import type { DecisionFilters } from '../../audit/ai-decision-repository';

// ──── Zod Schemas ────

export const recordDecisionSchema = z.object({
  model_name: z.string().min(1),
  input_hash: z.string().min(1),
  output: z.record(z.string(), z.unknown()).default({}),
  confidence: z.number().min(0).max(1),
  latency_ms: z.number().int().nonnegative().default(0),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const decisionFiltersSchema = z.object({
  model_name: z.string().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  min_confidence: z.number().min(0).max(1).optional(),
  max_confidence: z.number().min(0).max(1).optional(),
  limit: z.number().int().positive().max(1000).default(100),
  offset: z.number().int().nonnegative().default(0),
});

/**
 * Auth middleware using Better Auth session check.
 * Requires a valid session cookie or Bearer token.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Valid session required' });
    }
    (req as Request & { user?: unknown }).user = session.user;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized', message: 'Authentication failed' });
  }
}

export async function recordDecisionMetadataEntries(
  recordMetadataFn: (decisionId: string, key: string, value: string) => Promise<unknown>,
  decisionId: string,
  metadata?: Record<string, string>,
): Promise<void> {
  if (!metadata || Object.keys(metadata).length === 0) return;
  const entries: Promise<void>[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    entries.push(recordMetadataFn(decisionId, key, value).then(() => {}));
  }
  await Promise.all(entries);
}

export function formatDecisionListResponse<T>(
  decisions: T[],
  total: number,
  filters: DecisionFilters,
) {
  const offset = filters.offset ?? 0;
  return {
    decisions,
    total,
    limit: filters.limit,
    offset,
    hasMore: total > offset + decisions.length,
  };
}
