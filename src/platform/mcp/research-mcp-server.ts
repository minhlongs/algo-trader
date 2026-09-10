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
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../../shared/utils/logger';
import {
  RESEARCH_MCP_TOOLS,
  type CallToolParams,
  type ListExperimentsArgs,
  type GetRunCardArgs,
  type GetAlphaReportArgs,
  type GetBacktestSummaryArgs,
} from './research-mcp-types';
import {
  handleListExperiments,
  handleGetRunCard,
  handleGetAlphaReport,
  handleGetBacktestSummary,
} from './research-mcp-handlers';

export {
  RESEARCH_MCP_TOOLS,
  handleListExperiments,
  handleGetRunCard,
  handleGetAlphaReport,
  handleGetBacktestSummary,
};

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
