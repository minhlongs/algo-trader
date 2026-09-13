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

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  type McpDeps,
  resolveTier,
  jsonRpcOk,
  jsonRpcErr,
} from './mcp-routes-types';
import { registerMcpResearchRoutes } from './mcp-routes-research';

export * from './mcp-routes-types';

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
  registerMcpResearchRoutes(router, deps);

  // --- Catch-all: RegExp avoids path-to-regexp '*' bug ---
  router.all(/.*/, (_req: Request, res: Response) => {
    res.status(404).json({ jsonrpc: '2.0', id: null, error: { code: -32601, message: 'Method not found' } });
  });

  return router;
}

export const mcpRouter = createMCPRouter();
