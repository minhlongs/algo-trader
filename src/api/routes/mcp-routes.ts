/**
 * MCP (Model Context Protocol) JSON-RPC 2.0 Endpoint
 * Mount at /api/mcp in ApiServer.
 *
 * Tools:
 *   GET /get_signals       — paginated signals (PRO+)
 *   GET /subscribe          — SSE real-time stream (PRO+)
 *   GET /check_track_record — public stub
 *   GET /get_consensus      — tier-gated stub
 *   GET /list_strategies    — public stub
 *   GET /get_performance    — public stub
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import type { TierKey, Signal } from '../../signal/signal-types';
import { handleListExperiments, handleGetRunCard, handleGetAlphaReport, handleGetBacktestSummary } from '../../platform/mcp/research-mcp-server';

// ---- Dependency interfaces (injectable for testing) ----

export interface McpDeps {
  gate: { validateApiKey(apiKey: string): { tier: string } | undefined };
  sseBroadcaster?: { subscribe(res: Response): void };
  signalTtlEnforcer?: { getLive(): Signal[] };
  filterSignalsForTier?: (signals: Signal[], tier: TierKey) => Signal[];
  logger?: { info(msg: string): void; warn(msg: string): void; error(msg: string): void };
  /** Research provenance deps — injected so tests can stub the ledger. */
  research?: {
    listExperiments: (args: { apiKey: string; limit?: number }) => Promise<CallToolResult>;
    getRunCard: (args: { apiKey: string; runId: string }) => Promise<CallToolResult>;
    getAlphaReport: (args: { apiKey: string; candidateId: string }) => Promise<CallToolResult>;
    getBacktestSummary: (args: { apiKey: string; runId: string }) => Promise<CallToolResult>;
  };
}

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const DEFAULT_TIER: TierKey = 'FREE';

function resolveTier(req: Request, deps: McpDeps): TierKey {
  const authHeader = req.headers.authorization ?? '';
  const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!apiKey) return DEFAULT_TIER;

  const license = deps.gate.validateApiKey(apiKey);
  if (!license) return DEFAULT_TIER;

  const tier = license.tier as string;
  if (tier === 'ENTERPRISE' || tier === 'PRO') return tier;
  return DEFAULT_TIER;
}

function jsonRpcOk(req: Request, result: unknown) {
  return { jsonrpc: '2.0', id: req.query.id ?? null, result };
}

function jsonRpcErr(req: Request, code: number, message: string) {
  return { jsonrpc: '2.0', id: req.query.id ?? null, error: { code, message } };
}

export function createMCPRouter(deps: McpDeps = {
  gate: { validateApiKey: () => undefined },
}): Router {
  const router = Router();

  // --- GET /get_signals ---
  router.get('/get_signals', async (req: Request, res: Response) => {
    try {
      const tier = resolveTier(req, deps);

      if (tier === 'FREE') {
        return res.status(403).json({
          ...jsonRpcErr(req, -32001, 'PRO+ tier required for signals'),
          error: { code: -32001, message: 'PRO+ tier required for signals', upgrade: 'https://cashclaw.cc/pricing' },
        });
      }

      const schema = z.object({
        since: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      });
      const parsed = schema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json(jsonRpcErr(req, -32602, parsed.error.issues[0]?.message ?? 'Invalid params'));

      const { since, limit } = parsed.data;
      const live = deps.signalTtlEnforcer?.getLive() ?? [];
      const filtered = (deps.filterSignalsForTier ?? ((s) => s))(live.filter((s) => s.ts >= since), tier).slice(0, limit);

      return res.json(jsonRpcOk(req, { signals: filtered, count: filtered.length, tier }));
    } catch {
      return res.status(500).json(jsonRpcErr(req, -32603, 'Internal error'));
    }
  });

  // --- GET /subscribe (SSE) ---
  router.get('/subscribe', (req: Request, res: Response) => {
    const tier = resolveTier(req, deps);
    if (tier === 'FREE') {
      return res.status(403).json({
        error: { code: -32001, message: 'SSE requires PRO+ tier', upgrade: 'https://cashclaw.cc/pricing' },
      });
    }
    deps.logger?.info(`[MCP] SSE subscribe tier=${tier}`);
    deps.sseBroadcaster?.subscribe(res);
  });

  // --- GET /check_track_record — public stub ---
  router.get('/check_track_record', (req: Request, res: Response) => {
    const schema = z.object({ provider_id: z.string().min(1) });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json(jsonRpcErr(req, -32602, 'provider_id required'));
    return res.json(jsonRpcOk(req, { message: 'stub', params: req.query, provider_id: parsed.data.provider_id }));
  });

  // --- GET /get_consensus — tier-gated stub ---
  router.get('/get_consensus', (req: Request, res: Response) => {
    const tier = resolveTier(req, deps);
    if (tier === 'FREE') return res.status(403).json({
      error: { code: -32001, message: 'PRO+ tier required for consensus', upgrade: 'https://cashclaw.cc/pricing' },
    });
    const schema = z.object({ signal_ids: z.string().min(1) });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json(jsonRpcErr(req, -32602, parsed.error.issues[0]?.message ?? 'Invalid params'));
    return res.json(jsonRpcOk(req, { message: 'stub', params: req.query, tier }));
  });

  // --- GET /list_strategies — public stub ---
  router.get('/list_strategies', (req: Request, res: Response) => {
    const schema = z.object({
      category: z.string().optional(),
      min_sharpe: z.coerce.number().min(0).optional(),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json(jsonRpcErr(req, -32602, parsed.error.issues[0]?.message ?? 'Invalid params'));
    return res.json(jsonRpcOk(req, { message: 'stub', params: req.query, strategies: [] }));
  });

  // --- GET /get_performance — public stub ---
  router.get('/get_performance', (req: Request, res: Response) => {
    const schema = z.object({
      provider_id: z.string().min(1),
      period: z.string().default('7d'),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json(jsonRpcErr(req, -32602, parsed.error.issues[0]?.message ?? 'Invalid params'));
    return res.json(jsonRpcOk(req, { message: 'stub', params: req.query, provider_id: parsed.data.provider_id, period: parsed.data.period }));
  });

  // --- Research provenance routes (read-only, PRO+ tier) ---
  // These delegate to the Research MCP handlers. They never place, cancel, or
  // mutate any order — they only read provenance artifacts (ledger, run cards).

  function extractApiKey(req: Request): string {
    const authHeader = req.headers.authorization ?? '';
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  }

  function contentText(content: CallToolResult['content']): string {
    const first = content?.[0];
    return typeof first === 'object' && first !== null && 'text' in first
      ? String(first.text)
      : '';
  }

  async function runResearchTool(
    req: Request,
    res: Response,
    handler: (args: Record<string, unknown>) => Promise<CallToolResult>,
    args: Record<string, unknown>,
  ) {
    const apiKey = extractApiKey(req);
    const result = await handler({ ...args, apiKey });
    const text = contentText(result.content);
    if (result.isError) {
      return res.status(403).json({
        ...jsonRpcErr(req, -32001, text || 'Research tool error'),
        error: { code: -32001, message: text || 'Research tool error' },
      });
    }
    try {
      return res.json(jsonRpcOk(req, JSON.parse(text || '{}')));
    } catch {
      return res.json(jsonRpcOk(req, { raw: text }));
    }
  }

  router.get('/list_experiments', async (req: Request, res: Response) => {
    const schema = z.object({ limit: z.coerce.number().int().min(1).max(200).optional() });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json(jsonRpcErr(req, -32602, parsed.error.issues[0]?.message ?? 'Invalid params'));
    const handler = deps.research?.listExperiments ?? handleListExperiments;
    return runResearchTool(req, res, handler as (a: Record<string, unknown>) => Promise<CallToolResult>, { limit: parsed.data.limit });
  });

  router.get('/get_run_card', async (req: Request, res: Response) => {
    const schema = z.object({ runId: z.string().min(1) });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json(jsonRpcErr(req, -32602, 'runId required'));
    const handler = deps.research?.getRunCard ?? handleGetRunCard;
    return runResearchTool(req, res, handler as (a: Record<string, unknown>) => Promise<CallToolResult>, { runId: parsed.data.runId });
  });

  router.get('/get_alpha_report', async (req: Request, res: Response) => {
    const schema = z.object({ candidateId: z.string().min(1) });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json(jsonRpcErr(req, -32602, 'candidateId required'));
    const handler = deps.research?.getAlphaReport ?? handleGetAlphaReport;
    return runResearchTool(req, res, handler as (a: Record<string, unknown>) => Promise<CallToolResult>, { candidateId: parsed.data.candidateId });
  });

  router.get('/get_backtest_summary', async (req: Request, res: Response) => {
    const schema = z.object({ runId: z.string().min(1) });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json(jsonRpcErr(req, -32602, 'runId required'));
    const handler = deps.research?.getBacktestSummary ?? handleGetBacktestSummary;
    return runResearchTool(req, res, handler as (a: Record<string, unknown>) => Promise<CallToolResult>, { runId: parsed.data.runId });
  });

  // --- Catch-all: RegExp avoids path-to-regexp '*' bug ---
  router.all(/.*/, (_req: Request, res: Response) => {
    res.status(404).json({ jsonrpc: '2.0', id: null, error: { code: -32601, message: 'Method not found' } });
  });

  return router;
}

// Production router — deps are undefined and will be supplied by tests via createMCPRouter(deps),
// or by app.ts wiring real singletons.
export const mcpRouter = createMCPRouter();
