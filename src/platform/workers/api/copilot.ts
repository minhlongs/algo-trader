/**
 * Co-pilot /ask endpoint — intent classifier + 5 handlers.
 *
 * POST /api/copilot/ask
 * Body: { query: string, context?: { tier, tenantId } }
 *
 * Intent routing (keyword-based with confidence scoring):
 * - risk    → market risk analysis (drawdown, VaR, correlation)
 * - arb     → arbitrage opportunity scan
 * - perf    → strategy performance metrics
 * - regime  → market regime detection (bull/bear/sideways)
 * - report  → generate trading report summary
 *
 * Dispatch: FREE ≤5/min, STARTER ≤10, PRO ≤20, ENTERPRISE ≤40, MASTER ≤200.
 * Handler timeout: 5s each via Promise.race.
 */
import { logger } from '../../../shared/utils/logger';
import type { Env } from './copilot-types';
import { classifyIntent, checkRateLimit, formatMarkdownResponse, buildFallbackResponse, corsHeaders } from './copilot-utils';
import { HANDLERS } from './copilot-handlers';
import type { CopilotContext, HandlerResult } from './copilot-types';

// ──────────────────────────────────────────────
// Re-export all public symbols for backward compatibility
// ──────────────────────────────────────────────

export type { Env, CopilotContext, HandlerResult, IntentResult, IntentType, HandlerFn } from './copilot-types';
export { RATE_LIMITS, INTENT_PATTERNS } from './copilot-types';
export { classifyIntent, checkRateLimit, formatMarkdownResponse, buildFallbackResponse } from './copilot-utils';
export { HANDLERS } from './copilot-handlers';

// ──────────────────────────────────────────────
// Public entry point (called from edge-proxy)
// ──────────────────────────────────────────────

export async function handleCopilotAsk(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(env) });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed — use POST' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const body = await request.json<{ query?: string; context?: { tier?: string; tenantId?: string } }>();
    const query = body.query?.trim();

    if (!query) {
      return new Response(JSON.stringify({ error: 'query is required (e.g. { query: "BTC outlook" })' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const tier = (body.context?.tier || 'free').toUpperCase();
    const tenantId = body.context?.tenantId || '';

    // Rate limit
    if (tenantId) {
      const rate = await checkRateLimit(tenantId, tier, env);
      if (!rate.allowed) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded', tier, remainingMs: '60s' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Classify intent
    const classified = classifyIntent(query);
    logger.info('[copilot] intent classified', { query: query.slice(0, 60), intent: classified.intent, confidence: classified.confidence });

    const ctx: CopilotContext = { tier, tenantId, query, env };

    // Dispatch with 5s timeout
    const handler = HANDLERS[classified.intent];
    let result: HandlerResult;
    try {
      result = await handler(ctx, 5000);
    } catch (timeoutErr) {
      logger.warn('[copilot] handler timeout', { intent: classified.intent });
      result = {
        intent: 'report',
        summary: `⏱️ *Timeout* — handler for ${classified.intent.toUpperCase()} exceeded 5s budget. Try /regime for lighter query.`,
        details: { error: String(timeoutErr) },
        generatedAt: new Date().toISOString(),
      };
    }

    const textReply = formatMarkdownResponse(result, classified.confidence, classified.intent);

    return new Response(JSON.stringify({
      intent: classified.intent,
      confidence: classified.confidence,
      reply: {
        text: textReply,
        parseMode: 'Markdown',
        action: result.action,
      },
      details: result.details,
    }), { headers: corsHeaders(env) });
  } catch (err) {
    logger.error('[copilot] ask error', { error: String(err) });
    return new Response(JSON.stringify({ error: 'Copilot processing failed', detail: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
