/**
 * Research MCP Server - Types, Config, and Tool Definitions
 */

import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Request } from 'express';
import { resolveSubscriberId } from '../middleware/signal-tier-resolver';
import type { TierKey } from '../../desk/signal/signal-types';

export const TIER_RANK: Record<TierKey, number> = { FREE: 0, PRO: 1, ENTERPRISE: 2 };
export const RESEARCH_MIN_TIER: TierKey = 'PRO';

export type CallToolParams = Record<string, unknown> | undefined;
export type ListExperimentsArgs = { apiKey: string; limit?: number };
export type GetRunCardArgs = { apiKey: string; runId: string };
export type GetAlphaReportArgs = { apiKey: string; candidateId: string };
export type GetBacktestSummaryArgs = { apiKey: string; runId: string };

export function resolveIdentity(apiKey: string): { subscriberId: string; tier: TierKey } | null {
  const mockReq = { headers: { authorization: `Bearer ${apiKey}` } } as unknown as Request;
  const identity = resolveSubscriberId(mockReq);
  if (!identity) return null;
  if (TIER_RANK[identity.tier] === undefined) return null;
  return identity;
}

export function hasMinimumTier(tier: TierKey, minimum: TierKey): boolean {
  return (TIER_RANK[tier] ?? 0) >= (TIER_RANK[minimum] ?? 0);
}

export function unauthorized(): CallToolResult {
  return { content: [{ type: 'text', text: 'Unauthorized — invalid API key' }], isError: true };
}

export function insufficientTier(): CallToolResult {
  return { content: [{ type: 'text', text: `Insufficient tier — ${RESEARCH_MIN_TIER}+ required` }], isError: true };
}

export const RESEARCH_MCP_TOOLS: Tool[] = [
  {
    name: 'list_experiments',
    description:
      'List all research runs recorded in the provenance ledger. ' +
      'Returns runId, resultClass, strategyRef, and gate outcomes for each run. ' +
      'Read-only — never mutates state.',
    annotations: { readOnlyHint: true },
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
    annotations: { readOnlyHint: true },
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
    annotations: { readOnlyHint: true },
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
    annotations: { readOnlyHint: true },
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
