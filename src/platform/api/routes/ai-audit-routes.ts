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

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../../../shared/utils/logger';
import {
  getAIDecisionRepository,
  type DecisionFilters,
} from '../../audit/ai-decision-repository';
import { requireTier } from '../../middleware/feature-gate';
import {
  recordDecisionSchema,
  decisionFiltersSchema,
  authenticate,
  recordDecisionMetadataEntries,
  formatDecisionListResponse,
} from './ai-audit-routes-helpers';

export {
  recordDecisionSchema,
  decisionFiltersSchema,
  authenticate,
  recordDecisionMetadataEntries,
  formatDecisionListResponse,
};

const router: Router = Router();
const repo = getAIDecisionRepository();

// ──── Endpoints ────

/**
 * POST /api/v1/ai-audit/decisions
 * Record a new AI decision with optional metadata
 */
router.post('/decisions', requireTier('PRO'), authenticate, async (req: Request, res: Response) => {
  try {
    const body = recordDecisionSchema.parse(req.body);

    const decision = await repo.recordDecision({
      model_name: body.model_name,
      input_hash: body.input_hash,
      output: body.output,
      confidence: body.confidence,
      latency_ms: body.latency_ms,
    });

    await recordDecisionMetadataEntries(
      (id, key, val) => repo.recordMetadata(id, key, val),
      decision.id,
      body.metadata,
    );

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
router.get('/decisions', requireTier('PRO'), authenticate, async (req: Request, res: Response) => {
  try {
    const filters = decisionFiltersSchema.parse(req.query) as DecisionFilters;

    const [decisions, total] = await Promise.all([
      repo.getDecisions(filters),
      repo.countDecisions(filters),
    ]);

    res.json(formatDecisionListResponse(decisions, total, filters));
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
router.get('/decisions/:id', requireTier('PRO'), authenticate, async (req: Request, res: Response) => {
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
