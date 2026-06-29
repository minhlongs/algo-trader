/**
 * AI Decision Audit API Routes
 *
 * Endpoints:
 * - POST /api/v1/ai-audit/decisions        — record a decision
 * - GET  /api/v1/ai/audit/decisions         — list decisions (with filters)
 * - GET  /api/v1/ai/audit/decisions/:id     — get decision detail with metadata
 *
 * Uses express Router. Authenticated via auth middleware.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../../../shared/utils/logger';
import { auth } from '../../auth/auth-server';
import {
  getAIDecisionRepository,
  type AIDecisionWithMetadata,
  type RecordDecisionInput,
  type DecisionFilters,
} from '../../../audit/ai-decision-repository';

const router: Router = Router();
const repo = getAIDecisionRepository();

// ──── Zod Schemas ────

const recordDecisionSchema = z.object({
  model_name: z.string().min(1),
  input_hash: z.string().min(1),
  output: z.record(z.string(), z.unknown()).default({}),
  confidence: z.number().min(0).max(1),
  latency_ms: z.number().int().nonnegative().default(0),
  metadata: z.record(z.string(), z.string()).optional(),
});

const decisionFiltersSchema = z.object({
  model_name: z.string().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  min_confidence: z.number().min(0).max(1).optional(),
  max_confidence: z.number().min(0).max(1).optional(),
  limit: z.number().int().positive().max(1000).default(100),
  offset: z.number().int().nonnegative().default(0),
});

// ──── Middleware ────

/**
 * Auth middleware using Better Auth session check.
 * Requires a valid session cookie or Bearer token.
 */
async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Valid session required' });
    }
    (req as any).user = session.user;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized', message: 'Authentication failed' });
  }
}

// ──── Endpoints ────

/**
 * POST /api/v1/ai-audit/decisions
 * Record a new AI decision with optional metadata
 */
router.post('/decisions', authenticate, async (req: Request, res: Response) => {
  try {
    const body = recordDecisionSchema.parse(req.body);

    const decision = await repo.recordDecision({
      model_name: body.model_name,
      input_hash: body.input_hash,
      output: body.output,
      confidence: body.confidence,
      latency_ms: body.latency_ms,
    });

    // Attach metadata entries if provided
    if (body.metadata && Object.keys(body.metadata).length > 0) {
      const entries: Promise<void>[] = [];
      for (const [key, value] of Object.entries(body.metadata)) {
        entries.push(repo.recordMetadata(decision.id, key, value).then(() => {}));
      }
      await Promise.all(entries);
    }

    logger.info('[AI-Audit] Decision recorded', {
      decisionId: decision.id,
      model: decision.model_name,
    });

    res.status(201).json({ decision });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request',
        details: error.issues,
      });
    }
    logger.error('[AI-Audit] Failed to record decision', { error });
    res.status(500).json({ error: 'Failed to record decision' });
  }
});

/**
 * GET /api/v1/ai/audit/decisions
 * List decisions with optional filters (model_name, date range, confidence range)
 */
router.get('/decisions', authenticate, async (req: Request, res: Response) => {
  try {
    const filters = decisionFiltersSchema.parse(req.query) as DecisionFilters;

    const [decisions, total] = await Promise.all([
      repo.getDecisions(filters),
      repo.countDecisions(filters),
    ]);

    res.json({
      decisions,
      total,
      limit: filters.limit,
      offset: filters.offset ?? 0,
      hasMore: total > (filters.offset ?? 0) + decisions.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.issues,
      });
    }
    logger.error('[AI-Audit] Failed to list decisions', { error });
    res.status(500).json({ error: 'Failed to list decisions' });
  }
});

/**
 * GET /api/v1/ai/audit/decisions/:id
 * Get a single decision with all its metadata entries
 */
router.get('/decisions/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const decision = await repo.getDecisionWithMetadata(id as string);

    if (!decision) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Decision ${id} not found`,
      });
    }

    res.json({ decision });
  } catch (error) {
    logger.error('[AI-Audit] Failed to get decision', {
      decisionId: req.params.id,
      error,
    });
    res.status(500).json({ error: 'Failed to get decision' });
  }
});

export default router;
