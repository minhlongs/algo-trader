/**
 * Signal MCP Server — stdio transport for agent-native signal discovery.
 *
 * Tools:
 * get_signals(tier, since, limit)
 * get_subscription_status(apiKey)
 *
 * Resources:
 * signal://feed/{tier}?since=<ms>&limit=<n>
 *
 * Auth: Bearer API key passed as tool argument.
 * Tier gate: SIGNALS_BASIC minimum for get_signals.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../../shared/utils/logger';
import {
  type GetSignalsArgs,
  type GetSubscriptionStatusArgs,
  type TierKey,
  type Signal,
} from './signal-mcp-types';
import {
  resolveIdentity,
  hasMinimumTier,
  parseResourceUri,
  buildResourceError,
  fetchSignals,
} from './signal-mcp-auth';
import {
  MCP_TOOLS,
  handleGetSignals,
  handleGetSubscriptionStatus,
  handleListTools,
  handleListResources,
  handleReadResource,
} from './signal-mcp-tools';

// Re-export for backward compatibility
export {
  MCP_TOOLS,
  handleGetSignals,
  handleGetSubscriptionStatus,
  handleListTools,
  handleListResources,
  handleReadResource,
};
export type { GetSignalsArgs, GetSubscriptionStatusArgs, TierKey, Signal };

/**
 * Server factory creating the MCP server instance with registered handlers.
 */
export function createSignalMcpServer() {
  const server = new Server(
    { name: 'signal-mcp-server', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {} } },
  );

  // ---------- Tool handlers ----------
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: MCP_TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name === 'get_signals') {
      return handleGetSignals(args as unknown as GetSignalsArgs);
    }
    if (name === 'get_subscription_status') {
      return handleGetSubscriptionStatus(args as unknown as GetSubscriptionStatusArgs);
    }
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  });

  // ---------- Resource handlers ----------
  server.setRequestHandler(ListResourcesRequestSchema, async () => handleListResources());

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const parsed = parseResourceUri(uri);
    if (!parsed) {
      return buildResourceError(
        `Invalid resource URI: ${uri}. Expected signal://feed/{tier}?since=N&limit=N`,
      );
    }

    const identity = resolveIdentity(parsed.apiKey);
    if (!identity) {
      return buildResourceError('Unauthorized — invalid API key');
    }
    if (!hasMinimumTier(identity.tier, 'FREE')) {
      return buildResourceError('Insufficient tier for signal access');
    }

    const signals = await fetchSignals(parsed.tier, parsed.since, parsed.limit);
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ data: signals, count: signals.length, tier: parsed.tier }),
        },
      ],
    };
  });

  return server;
}

/**
 * Entry point for running MCP server on stdio transport.
 */
export async function runSignalMcpServer(): Promise<void> {
  const server = createSignalMcpServer();
  const transport = new StdioServerTransport();

  logger.info('[MCP] Signal MCP server starting on stdio');
  await server.connect(transport);
}
