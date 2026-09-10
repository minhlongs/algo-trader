/**
 * Tool definitions and request handlers for Signal MCP Server.
 */

import { type CallToolResult, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { signalSubscriberRepo } from '../signal/signal-subscriber-repository-d1';
import {
  type GetSignalsArgs,
  type GetSubscriptionStatusArgs,
  type TierKey,
  TIER_RANK,
} from './signal-mcp-types';
import {
  resolveIdentity,
  hasMinimumTier,
  parseResourceUri,
  buildResourceError,
  fetchSignals,
} from './signal-mcp-auth';

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
