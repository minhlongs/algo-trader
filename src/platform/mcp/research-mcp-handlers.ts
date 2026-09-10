/**
 * Research MCP Server - Tool Execution Handlers
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { readLedgerRecords, verifyLedgerChain } from '../../alpha-lab/provenance/research-ledger';
import { readRunCardByRunId } from '../../alpha-lab/provenance/run-card-index';
import { readAlphaReportByCandidateId } from '../../alpha-lab/provenance/alpha-report-store';
import { logger } from '../../shared/utils/logger';
import {
  RESEARCH_MIN_TIER,
  resolveIdentity,
  hasMinimumTier,
  unauthorized,
  insufficientTier,
  type ListExperimentsArgs,
  type GetRunCardArgs,
  type GetAlphaReportArgs,
  type GetBacktestSummaryArgs,
} from './research-mcp-types';

export async function handleListExperiments(args: ListExperimentsArgs): Promise<CallToolResult> {
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

export async function handleGetRunCard(args: GetRunCardArgs): Promise<CallToolResult> {
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

export async function handleGetAlphaReport(args: GetAlphaReportArgs): Promise<CallToolResult> {
  if (!args?.apiKey || !args?.candidateId) {
    return { content: [{ type: 'text', text: 'Missing required: apiKey, candidateId' }], isError: true };
  }
  const identity = resolveIdentity(args.apiKey);
  if (!identity) return unauthorized();
  if (!hasMinimumTier(identity.tier, RESEARCH_MIN_TIER)) return insufficientTier();

  const report = await readAlphaReportByCandidateId(args.candidateId);
  if (!report) {
    return {
      isError: false,
      content: [{
        type: 'text',
        text: JSON.stringify({
          candidateId: args.candidateId,
          found: false,
          message: 'Alpha report not found for this candidateId.',
        }),
      }],
    };
  }

  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(report) }],
  };
}

export async function handleGetBacktestSummary(args: GetBacktestSummaryArgs): Promise<CallToolResult> {
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
