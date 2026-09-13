/**
 * MCP JSON-RPC 2.0 Router — Types & Helper Functions
 */

import type { Request, Response } from 'express';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TierKey, Signal } from '../../signal/signal-types';

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

export const DEFAULT_TIER: TierKey = 'FREE';

export function resolveTier(req: Request, deps: McpDeps): TierKey {
  const authHeader = req.headers.authorization ?? '';
  const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!apiKey) return DEFAULT_TIER;

  const license = deps.gate.validateApiKey(apiKey);
  if (!license) return DEFAULT_TIER;

  const tier = license.tier as string;
  if (tier === 'ENTERPRISE' || tier === 'PRO') return tier;
  return DEFAULT_TIER;
}

export function jsonRpcOk(req: Request, result: unknown): { jsonrpc: '2.0'; id: unknown; result: unknown } {
  return { jsonrpc: '2.0', id: req.query.id ?? null, result };
}

export function jsonRpcErr(
  req: Request,
  code: number,
  message: string,
): { jsonrpc: '2.0'; id: unknown; error: { code: number; message: string } } {
  return { jsonrpc: '2.0', id: req.query.id ?? null, error: { code, message } };
}
