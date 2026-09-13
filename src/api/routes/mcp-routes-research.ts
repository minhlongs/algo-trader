/**
 * MCP JSON-RPC 2.0 Router — Research Provenance Routes
 */

import type { Router, Request, Response } from 'express';
import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  handleListExperiments,
  handleGetRunCard,
  handleGetAlphaReport,
  handleGetBacktestSummary,
} from '../../platform/mcp/research-mcp-server';
import { type McpDeps, jsonRpcOk, jsonRpcErr } from './mcp-routes-types';

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
): Promise<Response> {
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

export function registerMcpResearchRoutes(router: Router, deps: McpDeps): void {
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
}
