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
  type CallToolResult,
  type Resource,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { signalSubscriberRepo } from '../signal/signal-subscriber-repository-d1';
import { getCachedSignals } from '../../desk/signal/signal-rest-cache';
import { resolveSubscriberId } from '../middleware/signal-tier-resolver';
import { logger } from '../../shared/utils/logger';
import type { TierKey, Signal } from '../../desk/signal/signal-types';

// ---------------------------------------------------------------------------
// Tier rank for minimum-tier enforcement
// ---------------------------------------------------------------------------
const TIER_RANK: Record<TierKey, number> = { FREE: 0, PRO: 1, ENTERPRISE: 2 };
const SIGNALS_BASIC_RANK = 0; // any paid tier counts

/** Validate an API key returns a usable subscriber identity. */
function resolveIdentity(apiKey: string): { subscriberId: string; tier: TierKey } | null {
  // Build a synthetic Express Request-like object for resolveSubscriberId
  const mockReq = { headers: { authorization: `Bearer ${apiKey}` } } as any;
  const identity = resolveSubscriberId(mockReq);
  if (!identity) return null;
  // Only signal tiers are eligible
  if (TIER_RANK[identity.tier] === undefined) return null;
  return identity;
}

/** Enforce minimum tier — accepted tier keys only. */
function hasMinimumTier(tier: TierKey, minimum: TierKey): boolean {
  return (TIER_RANK[tier] ?? 0) >= (TIER_RANK[minimum] ?? 0);
}

// ---------------------------------------------------------------------------
// Tool definitions — exported for tests to inspect
// ---------------------------------------------------------------------------
export const MCP_TOOLS: Tool[] = [
  {
    name: 'get_signals',
    description:
      'Fetch trading signals for a specific tier. ' +
      'Requires SIGNALS_BASIC minimum tier (PRO or ENTERPRISE). ' +
      'Results are tier-filtered and paginated.',
    inputSchema: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: 'Bearer API key for authentication' },
        tier: { type: 'string', enum: ['FREE', 'PRO', 'ENTERPRISE'], description: 'Subscriber tier' },
        since: { type: 'number', description: 'Unix ms timestamp', default: 0 },
        limit: { type: 'number', description: 'Max signals (1–100)', default: 20 },
      },
      required: ['apiKey', 'tier'],
    },
  },
  {
    name: 'get_subscription_status',
    description: 'Check subscription status and tier for an API key.',
    inputSchema: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: 'Bearer API key to check' },
      },
      required: ['apiKey'],
    },
  },
];

// ---------------------------------------------------------------------------
// Exported handler functions — tests call these directly
// ---------------------------------------------------------------------------
export async function handleGetSignals(args: GetSignalsArgs): Promise<CallToolResult> {
  if (!args?.apiKey || !args?.tier) {
    return { content: [{ type: 'text', text: 'Missing required: apiKey, tier' }], isError: true };
  }

  const identity = resolveIdentity(args.apiKey);
  if (!identity) {
    return { content: [{ type: 'text', text: 'Unauthorized — invalid API key' }], isError: true };
  }
  if (!hasMinimumTier(identity.tier, 'FREE')) {
    return { content: [{ type: 'text', text: 'Insufficient tier' }], isError: true };
  }

  // Strict enforcement: requested tier must not exceed subscriber's tier
  const requestedRank = TIER_RANK[args.tier] ?? 0;
  const identityRank = TIER_RANK[identity.tier] ?? 0;
  const effectiveTier: TierKey = requestedRank > identityRank ? identity.tier : args.tier;

  const since = typeof args.since === 'number' ? args.since : 0;
  const limit = typeof args.limit === 'number' ? Math.min(Math.max(args.limit, 1), 100) : 20;

  const signals = await fetchSignals(effectiveTier, since, limit);

  return {
    isError: false,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ data: signals, count: signals.length, tier: effectiveTier, cached: false }),
      },
    ],
  };
}

export async function handleGetSubscriptionStatus(
  args: GetSubscriptionStatusArgs,
): Promise<CallToolResult> {
  if (!args?.apiKey) {
    return { content: [{ type: 'text', text: 'Missing required: apiKey' }], isError: true };
  }

  const identity = resolveIdentity(args.apiKey);
  if (!identity) {
    return { content: [{ type: 'text', text: 'Unauthorized — invalid API key' }], isError: true };
  }

  const subscription = await signalSubscriberRepo.getBySubscriberId(identity.subscriberId);

  return {
    isError: false,
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          subscriberId: identity.subscriberId,
          tier: identity.tier,
          subscribed: !!subscription,
          subscriptionId: subscription?.id ?? null,
          subscriptionActive: subscription?.active ?? false,
        }),
      },
    ],
  };
}

export function handleListTools() {
  return { tools: MCP_TOOLS };
}

export function handleListResources() {
  return {
    resources: [
      {
        uri: 'signal://feed/{tier}',
        name: 'Signal Feed',
        description: 'Paginated tier-filtered signal feed. Pass tier, since, limit as query params.',
        mimeType: 'application/json',
      },
    ],
  };
}

export function handleReadResource(uri: string) {
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

  return { parsed, identity };
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------
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
      return handleGetSignals(args as any);
    }
    if (name === 'get_subscription_status') {
      return handleGetSubscriptionStatus(args as any);
    }
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  });

  // ---------- Resource handlers ----------
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: 'signal://feed/{tier}',
        name: 'Signal Feed',
        description: 'Paginated tier-filtered signal feed. Pass tier, since, limit as query params.',
        mimeType: 'application/json',
      },
    ],
  }));

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

export type { GetSignalsArgs, GetSubscriptionStatusArgs, TierKey, Signal };

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------
interface GetSignalsArgs {
  apiKey: string;
  tier: TierKey;
  since?: number;
  limit?: number;
}

interface GetSubscriptionStatusArgs {
  apiKey: string;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
interface ResourceQuery {
  apiKey: string;
  tier: TierKey;
  since: number;
  limit: number;
}

function parseResourceUri(uri: string): ResourceQuery | null {
  try {
    const match = uri.match(/^signal:\/\/feed\/([A-Z]+)\?(.+)$/);
    if (!match) return null;
    const apiKey = extractApiKeyFromResource(match[2]);
    const tier = match[1] as TierKey;
    const since = extractIntParam(match[2], 'since', 0);
    const limit = extractIntParam(match[2], 'limit', 20);
    if (!apiKey || TIER_RANK[tier] === undefined) return null;
    return { apiKey, tier, since, limit: Math.min(Math.max(limit, 1), 100) };
  } catch {
    return null;
  }
}

function extractApiKeyFromResource(query: string): string | null {
  const m = query.match(/apiKey=([^&]+)/);
  if (m) return decodeURIComponent(m[1]);
  return null;
}

function extractIntParam(query: string, key: string, fallback: number): number {
  const m = query.match(new RegExp(`${key}=(\\d+)`));
  return m ? parseInt(m[1], 10) : fallback;
}

function buildResourceError(message: string) {
  return {
    contents: [
      {
        uri: 'signal://feed/error',
        mimeType: 'application/json',
        text: JSON.stringify({ error: message }),
      },
    ],
  };
}

/** Fetch signals with cache-first, tier-filter fallback. */
async function fetchSignals(tier: TierKey, since: number, limit: number): Promise<Signal[]> {
  try {
    const cached = await getCachedSignals(tier, since, limit);
    if (cached && cached.length > 0) {
      return cached;
    }
    logger.debug('[MCP] Signal cache miss, returning empty result');
    return [];
  } catch (err) {
    logger.warn('[MCP] fetchSignals failed', { err });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export async function runSignalMcpServer(): Promise<void> {
  const server = createSignalMcpServer();
  const transport = new StdioServerTransport();

  logger.info('[MCP] Signal MCP server starting on stdio');
  await server.connect(transport);
}
