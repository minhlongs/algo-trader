/**
 * Research MCP Server — stdio transport for read-only research provenance.
 *
 * Tools (all read-only; NO order-placing or state-mutating tool is ever surfaced):
 *   list_experiments()              — list research runs from the ledger
 *   get_run_card(runId)             — fetch a provenance run card by runId
 *   get_alpha_report(candidateId)   — fetch an alpha report by candidateId
 *   get_backtest_summary(runId)     — fetch backtest metrics summary by runId
 *
 * Auth: Bearer API key passed as tool argument. Tier gate: PRO minimum.
 *
 * This server is deliberately separate from signal-mcp-server. It exposes only
 * research provenance — it can never place, cancel, or mutate any order.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { resolveSubscriberId } from '../middleware/signal-tier-resolver';
import type { Request } from 'express';
import { readLedgerRecords, verifyLedgerChain } from '../../alpha-lab/provenance/research-ledger';
import { readRunCardByRunId } from '../../alpha-lab/provenance/run-card-index';
import { logger } from '../../shared/utils/logger';
import type { TierKey } from '../../desk/signal/signal-types';

// ---------------------------------------------------------------------------
// Tier gate — PRO minimum for research provenance
// ---------------------------------------------------------------------------
// TierKey is the signal-tier vocabulary (FREE | PRO | ENTERPRISE). The
// signal-tier-resolver maps every LicenseTier outside {PRO, ENTERPRISE}
// (including MASTER/STARTER) to 'FREE', so the ranking here only needs the
// three signal tiers. Unknown tiers fall through to rank 0 via the ?? 0 in
// hasMinimumTier, which is the safe default.
const TIER_RANK: Record<TierKey, number> = { FREE: 0, PRO: 1, ENTERPRISE: 2 };
const RESEARCH_MIN_TIER: TierKey = 'PRO';

// ── Tool argument types ───────────────────────────────────────────────────────
// MCP delivers tool arguments as a plain object; each handler re-validates its
// own required fields at runtime. These interfaces name the expected shape so
// the dispatch boundary below can narrow without `any` casts.

type CallToolParams = Record<string, unknown> | undefined;
type ListExperimentsArgs = { apiKey: string; limit?: number };
type GetRunCardArgs = { apiKey: string; runId: string };
type GetAlphaReportArgs = { apiKey: string; candidateId: string };
type GetBacktestSummaryArgs = { apiKey: string; runId: string };

function resolveIdentity(apiKey: string): { subscriberId: string; tier: TierKey } | null {
  const mockReq = { headers: { authorization: `Bearer ${apiKey}` } } as unknown as Request;
  const identity = resolveSubscriberId(mockReq);
  if (!identity) return null;
  if (TIER_RANK[identity.tier] === undefined) return null;
  return identity;
}

function hasMinimumTier(tier: TierKey, minimum: TierKey): boolean {
  return (TIER_RANK[tier] ?? 0) >= (TIER_RANK[minimum] ?? 0);
}

function unauthorized(): CallToolResult {
  return { content: [{ type: 'text', text: 'Unauthorized — invalid API key' }], isError: true };
}

function insufficientTier(): CallToolResult {
  return { content: [{ type: 'text', text: `Insufficient tier — ${RESEARCH_MIN_TIER}+ required` }], isError: true };
}

// ---------------------------------------------------------------------------
// Tool definitions — exported for tests to inspect
// ---------------------------------------------------------------------------
export const RESEARCH_MCP_TOOLS: Tool[] = [
  {
    name: 'list_experiments',
    description:
      'List all research runs recorded in the provenance ledger. ' +
      'Returns runId, resultClass, strategyRef, and gate outcomes for each run. ' +
      'Read-only — never mutates state.',
    inputSchema: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: 'Bearer API key for authentication' },
        limit: { type: 'number', description: 'Max runs to return (1–200)', default: 50 },
      },
      required: ['apiKey'],
    },
  },
  {
    name: 'get_run_card',
    description:
      'Fetch a provenance run card by runId. Returns the full run card including ' +
      'config hash, result class, data source provenance, metrics, and gate results. ' +
      'Read-only — never mutates state.',
    inputSchema: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: 'Bearer API key for authentication' },
        runId: { type: 'string', description: 'The runId of the run card to fetch' },
      },
      required: ['apiKey', 'runId'],
    },
  },
  {
    name: 'get_alpha_report',
    description:
      'Fetch an alpha report by candidateId. Returns the alpha verdict and ' +
      'baseline comparisons for a candidate strategy. Read-only — never mutates state.',
    inputSchema: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: 'Bearer API key for authentication' },
        candidateId: { type: 'string', description: 'The candidateId of the alpha report to fetch' },
      },
      required: ['apiKey', 'candidateId'],
    },
  },
  {
    name: 'get_backtest_summary',
    description:
      'Fetch a backtest metrics summary by runId. Returns key performance metrics ' +
      '(PnL, Sharpe, max drawdown, win rate, trade count) from the run card. ' +
      'Read-only — never mutates state.',
    inputSchema: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: 'Bearer API key for authentication' },
        runId: { type: 'string', description: 'The runId of the backtest to summarize' },
      },
      required: ['apiKey', 'runId'],
    },
  },
];

// ---------------------------------------------------------------------------
// Exported handler functions — tests call these directly
// ---------------------------------------------------------------------------

export async function handleListExperiments(args: { apiKey: string; limit?: number }): Promise<CallToolResult> {
  if (!args?.apiKey) {
    return { content: [{ type: 'text', text: 'Missing required: apiKey' }], isError: true };
  }
  const identity = resolveIdentity(args.apiKey);
  if (!identity) return unauthorized();
  if (!hasMinimumTier(identity.tier, RESEARCH_MIN_TIER)) return insufficientTier();

  const limit = typeof args.limit === 'number' ? Math.min(Math.max(args.limit, 1), 200) : 50;

  try {
    const records = await readLedgerRecords();
    const chainBreak = verifyLedgerChain(records);
    const sliced = records.slice(-limit).reverse(); // most recent first

    return {
      isError: false,
      content: [{
        type: 'text',
        text: JSON.stringify({
          runs: sliced.map((r) => ({
            runId: r.runId,
            resultClass: r.resultClass,
            strategyRef: r.strategyRef,
            configHash: r.configHash,
            recordedAt: r.recordedAt,
            gates: r.gates,
          })),
          count: sliced.length,
          total: records.length,
          chainIntact: chainBreak === -1,
          chainBreakIndex: chainBreak >= 0 ? chainBreak : null,
        }),
      }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[ResearchMCP] list_experiments failed', { err: message });
    return { content: [{ type: 'text', text: `Failed to read ledger: ${message}` }], isError: true };
  }
}

export async function handleGetRunCard(args: { apiKey: string; runId: string }): Promise<CallToolResult> {
  if (!args?.apiKey || !args?.runId) {
    return { content: [{ type: 'text', text: 'Missing required: apiKey, runId' }], isError: true };
  }
  const identity = resolveIdentity(args.apiKey);
  if (!identity) return unauthorized();
  if (!hasMinimumTier(identity.tier, RESEARCH_MIN_TIER)) return insufficientTier();

  const card = await readRunCardByRunId(args.runId);
  if (!card) {
    return { content: [{ type: 'text', text: `No run card found for runId: ${args.runId}` }], isError: true };
  }

  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(card) }],
  };
}

export async function handleGetAlphaReport(args: { apiKey: string; candidateId: string }): Promise<CallToolResult> {
  if (!args?.apiKey || !args?.candidateId) {
    return { content: [{ type: 'text', text: 'Missing required: apiKey, candidateId' }], isError: true };
  }
  const identity = resolveIdentity(args.apiKey);
  if (!identity) return unauthorized();
  if (!hasMinimumTier(identity.tier, RESEARCH_MIN_TIER)) return insufficientTier();

  // Alpha reports are not yet persisted to a dedicated store. Return a clear
  // "not found" rather than fabricating data. When an alpha-report store is
  // added, this handler should read from it.
  return {
    isError: false,
    content: [{
      type: 'text',
      text: JSON.stringify({
        candidateId: args.candidateId,
        found: false,
        message: 'No alpha report store is configured. Alpha reports are produced in-memory by the alpha evaluator and are not yet persisted.',
      }),
    }],
  };
}

export async function handleGetBacktestSummary(args: { apiKey: string; runId: string }): Promise<CallToolResult> {
  if (!args?.apiKey || !args?.runId) {
    return { content: [{ type: 'text', text: 'Missing required: apiKey, runId' }], isError: true };
  }
  const identity = resolveIdentity(args.apiKey);
  if (!identity) return unauthorized();
  if (!hasMinimumTier(identity.tier, RESEARCH_MIN_TIER)) return insufficientTier();

  const card = await readRunCardByRunId(args.runId);
  if (!card) {
    return { content: [{ type: 'text', text: `No run card found for runId: ${args.runId}` }], isError: true };
  }

  // Extract the key performance metrics from the run card as a summary.
  const summary = {
    runId: card.runId,
    resultClass: card.resultClass,
    strategyRef: card.strategyRef,
    configHash: card.configHash,
    createdAt: card.createdAt,
    metrics: card.metrics,
    gateResults: card.gateResults,
    warnings: card.warnings,
  };

  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(summary) }],
  };
}

export function handleListTools() {
  return { tools: RESEARCH_MCP_TOOLS };
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------
export function createResearchMcpServer() {
  const server = new Server(
    { name: 'research-mcp-server', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: RESEARCH_MCP_TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    // MCP delivers tool arguments as an untyped object; each handler re-validates
    // its own required fields, so we narrow via a discriminated union rather than
    // casting through `any` at the dispatch boundary.
    const params = args as CallToolParams;
    switch (name) {
      case 'list_experiments':
        return handleListExperiments(params as ListExperimentsArgs);
      case 'get_run_card':
        return handleGetRunCard(params as GetRunCardArgs);
      case 'get_alpha_report':
        return handleGetAlphaReport(params as GetAlphaReportArgs);
      case 'get_backtest_summary':
        return handleGetBacktestSummary(params as GetBacktestSummaryArgs);
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
    }
  });

  return server;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export async function runResearchMcpServer(): Promise<void> {
  const server = createResearchMcpServer();
  const transport = new StdioServerTransport();

  logger.info('[ResearchMCP] Research MCP server starting on stdio');
  await server.connect(transport);
}
