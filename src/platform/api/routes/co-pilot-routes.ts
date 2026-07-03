/**
 * Co-pilot Routes
 * POST /api/v1/co-pilot/ask — Classify trading queries and route to intent handlers.
 *
 * Rate limiting: 10 req/min per PRO user (prevents cost amplification).
 * Tier gating: PRO+ → all 5 intents, FREE → fallback only.
 */

import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { requireTier } from '../../middleware/feature-gate';
import { classifyIntent } from '../../../desk/intelligence/co-pilot/intent-classifier';
import { handleRiskQuery } from '../../../desk/intelligence/co-pilot/handlers/risk-handler';
import { handleArbQuery } from '../../../desk/intelligence/co-pilot/handlers/arb-handler';
import { handlePerformanceQuery } from '../../../desk/intelligence/co-pilot/handlers/performance-handler';
import { handleRegimeQuery } from '../../../desk/intelligence/co-pilot/handlers/regime-handler';
import { handleReportQuery } from '../../../desk/intelligence/co-pilot/handlers/report-handler';
import { handleFallback } from '../../../desk/intelligence/co-pilot/handlers/fallback-handler';
import type { CopilotResponse } from '../../../desk/intelligence/co-pilot/response-formatter';
import type { Intent } from '../../../desk/intelligence/co-pilot/intent-classifier';
import type { LicenseTier } from '../../../shared/types/license';

// Per-user in-memory request tracking for co-pilot rate limiting
export const userRequestCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 requests per minute per user
const ENTERPRISE_RATE_LIMIT_MAX = 30;

/** Reset rate limiter state (used in tests) */
export function resetCoPilotRateLimiter(): void {
  userRequestCounts.clear();
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of userRequestCounts) {
    if (now > entry.resetAt) {
      userRequestCounts.delete(key);
    }
  }
}, 300_000);

/**
 * In-memory rate limiter middleware for co-pilot endpoint.
 * Prevents cost amplification from abuse.
 */
function coPilotRateLimiter(req: Request, res: Response, next: () => void): void {
  const userId = req.license?.id || req.ip || 'anonymous';
  const now = Date.now();
  let entry = userRequestCounts.get(userId);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    userRequestCounts.set(userId, entry);
  }

  entry.count++;

  const maxRequests = req.license?.tier === 'ENTERPRISE' || req.license?.tier === 'MASTER'
    ? ENTERPRISE_RATE_LIMIT_MAX
    : RATE_LIMIT_MAX;

  if (entry.count > maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.status(429).json({
      error: 'Too many requests — rate limit exceeded for co-pilot',
      retryAfterSeconds: retryAfter,
    });
    return;
  }

  next();
}

// Map intent strings to handler functions
type IntentHandler = (context?: { page?: string; strategyId?: string }) => Promise<CopilotResponse>;

const INTENT_HANDLERS: Record<Exclude<Intent, 'fallback'>, IntentHandler> = {
  risk_assessment: (ctx) => handleRiskQuery(ctx),
  arb_scan: (ctx) => handleArbQuery(ctx),
  strategy_performance: (ctx) => handlePerformanceQuery(ctx),
  market_regime: (ctx) => handleRegimeQuery(ctx),
  weekly_report: (ctx) => handleReportQuery(ctx),
};

export const coPilotRouter: RouterType = Router();

/**
 * POST /api/v1/co-pilot/ask
 *
 * Body: { query: string, context?: { page?: string, strategyId?: string } }
 * Response: { answer: string, actions: ActionButton[], sourceData?: any }
 *
 * FREE users always receive the fallback message (intent listing).
 * PRO+ users get the classified intent handler response.
 */
coPilotRouter.post(
  '/api/v1/co-pilot/ask',
  requireTier('FREE'),
  coPilotRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { query, context } = req.body;

      if (!query || typeof query !== 'string') {
        res.status(400).json({ error: 'Missing required field: query' });
        return;
      }

      const userTier = req.license?.tier as string | undefined;

      // FREE tier users always get fallback (intent listing only)
      if (userTier === 'FREE' || userTier === 'STARTER' || !userTier) {
        const result = handleFallback();
        res.json(result);
        return;
      }

      // Classify intent
      const { intent, confidence } = classifyIntent(query);

      let result: CopilotResponse;

      if (confidence >= 0.5 && intent !== 'fallback') {
        const handler = INTENT_HANDLERS[intent];
        result = await handler(context || {});
      } else {
        result = handleFallback();
      }

      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: 'Co-pilot request failed',
        detail: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  },
);
