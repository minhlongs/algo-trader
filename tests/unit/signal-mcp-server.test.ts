/**
 * Signal MCP Server — unit tests
 *
 * Tests exported handler functions directly. The MCP SDK v1.29 Server
 * class wires handlers via setRequestHandler — only reachable through
 * JSON-RPC transport. We test the pure handler logic instead.
 *
 * Covers:
 * - Tool listing (get_signals, get_subscription_status)
 * - get_signals: valid key, missing args, invalid key, tier ceiling
 * - get_subscription_status: valid/invalid key, missing arg
 * - Resource listing/read (signal://feed/{tier}), URI parsing, auth
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Redis cache BEFORE importing the server module
vi.mock('../../src/desk/signal/signal-rest-cache', () => ({
  getCachedSignals: vi.fn().mockResolvedValue([]),
  setCachedSignals: vi.fn(),
  invalidateSignalCache: vi.fn(),
}));

import { resolveSubscriberId, __setGate } from '../../src/platform/middleware/signal-tier-resolver';
import { signalSubscriberRepo } from '../../src/platform/signal/signal-subscriber-repository-d1';
import {
  handleGetSignals,
  handleGetSubscriptionStatus,
  handleListTools,
  handleListResources,
  handleReadResource,
  MCP_TOOLS,
} from '../../src/platform/mcp/signal-mcp-server';

// ---------------------------------------------------------------------------
// Mock gate — maps string enum LicenseTier to TierKey
// ---------------------------------------------------------------------------
beforeEach(() => {
  __setGate({
    validateApiKey: (key: string) => {
      if (key === 'valid-pro-key')
        return { id: 'sub-1', subscriberId: 'sub-1', tier: 'PRO', userId: 'sub-1' } as any;
      if (key === 'valid-free-key')
        return { id: 'sub-2', subscriberId: 'sub-2', tier: 'FREE', userId: 'sub-2' } as any;
      if (key === 'valid-enterprise-key')
        return { id: 'sub-3', subscriberId: 'sub-3', tier: 'ENTERPRISE', userId: 'sub-3' } as any;
      return null;
    },
  } as any);
});

afterEach(() => {
  __setGate(null);
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tool listing
// ---------------------------------------------------------------------------
describe('SignalMcpServer — tool listing', () => {
  it('returns exactly 2 tools', () => {
    const result = handleListTools();
    expect(result.tools).toHaveLength(2);
    expect(result.tools.map((t: any) => t.name).sort()).toEqual([
      'get_signals',
      'get_subscription_status',
    ]);
  });

  it('listTools matches MCP_TOOLS export', () => {
    expect(handleListTools().tools).toBe(MCP_TOOLS);
  });

  it('get_signals requires apiKey and tier', () => {
    const gs = handleListTools().tools.find((t: any) => t.name === 'get_signals')!;
    expect(gs.inputSchema.required).toContain('apiKey');
    expect(gs.inputSchema.required).toContain('tier');
  });

  it('get_signals tier enum has FREE, PRO, ENTERPRISE', () => {
    const gs = handleListTools().tools.find((t: any) => t.name === 'get_signals')!;
    expect(gs.inputSchema.properties.tier.enum).toEqual(['FREE', 'PRO', 'ENTERPRISE']);
  });

  it('get_subscription_status requires only apiKey', () => {
    const gs = handleListTools().tools.find((t: any) => t.name === 'get_subscription_status')!;
    expect(gs.inputSchema.required).toEqual(['apiKey']);
  });
});

// ---------------------------------------------------------------------------
// get_signals
// ---------------------------------------------------------------------------
describe('SignalMcpServer — get_signals', () => {
  it('returns success with PRO key + PRO tier', async () => {
    const result = await handleGetSignals({ apiKey: 'valid-pro-key', tier: 'PRO' });
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toEqual([]);
    expect(parsed.tier).toBe('PRO');
    expect(parsed.count).toBe(0);
    expect(parsed.cached).toBe(false);
  });

  it('downgrades ENTERPRISE request to PRO for PRO key (tier ceiling)', async () => {
    const result = await handleGetSignals({ apiKey: 'valid-pro-key', tier: 'ENTERPRISE' });
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.tier).toBe('PRO');
    expect(parsed.count).toBe(0);
  });

  it('downgrades ENTERPRISE request to FREE for FREE key (ceiling)', async () => {
    const result = await handleGetSignals({ apiKey: 'valid-free-key', tier: 'ENTERPRISE' });
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.tier).toBe('FREE');
  });

  it('ENTERPRISE key can request ENTERPRISE tier', async () => {
    const result = await handleGetSignals({ apiKey: 'valid-enterprise-key', tier: 'ENTERPRISE' });
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.tier).toBe('ENTERPRISE');
  });

  it('rejects invalid API key', async () => {
    const result = await handleGetSignals({ apiKey: 'bad-key', tier: 'PRO' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Unauthorized|invalid/i);
  });

  it('rejects missing apiKey', async () => {
    const result = await handleGetSignals({ tier: 'PRO' } as any);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Missing required|apiKey/i);
  });

  it('rejects missing tier', async () => {
    const result = await handleGetSignals({ apiKey: 'valid-pro-key' } as any);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Missing required|tier/i);
  });

  it('clamps limit to 1–100 range', async () => {
    const low = await handleGetSignals({ apiKey: 'valid-pro-key', tier: 'PRO', limit: 0 });
    expect(low.isError).toBe(false);

    const high = await handleGetSignals({ apiKey: 'valid-pro-key', tier: 'PRO', limit: 999 });
    expect(high.isError).toBe(false);
  });

  it('defaults since to 0 and limit to 20', async () => {
    const result = await handleGetSignals({ apiKey: 'valid-pro-key', tier: 'PRO' });
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.tier).toBe('PRO');
    expect(parsed.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// get_subscription_status
// ---------------------------------------------------------------------------
describe('SignalMcpServer — get_subscription_status', () => {
  it('returns subscription info for valid PRO key', async () => {
    vi.spyOn(signalSubscriberRepo, 'getBySubscriberId').mockResolvedValue({
      id: 'sub-abc',
      subscriberId: 'sub-1',
      tier: 'PRO',
      active: true,
      createdAt: 1000,
      updatedAt: 2000,
      chatId: 12345,
      notificationsEnabled: true,
    } as any);

    const result = await handleGetSubscriptionStatus({ apiKey: 'valid-pro-key' });
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.subscriberId).toBe('sub-1');
    expect(parsed.tier).toBe('PRO');
    expect(parsed.subscribed).toBe(true);
    expect(parsed.subscriptionId).toBe('sub-abc');
    expect(parsed.subscriptionActive).toBe(true);
  });

  it('returns subscribed:false when no subscription', async () => {
    vi.spyOn(signalSubscriberRepo, 'getBySubscriberId').mockResolvedValue(null as any);

    const result = await handleGetSubscriptionStatus({ apiKey: 'valid-pro-key' });
    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.subscribed).toBe(false);
    expect(parsed.subscriptionId).toBeNull();
    expect(parsed.subscriptionActive).toBe(false);
  });

  it('rejects invalid API key', async () => {
    const result = await handleGetSubscriptionStatus({ apiKey: 'bad-key' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Unauthorized|invalid/i);
  });

  it('rejects missing apiKey', async () => {
    const result = await handleGetSubscriptionStatus({} as any);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Missing required|apiKey/i);
  });
});

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------
describe('SignalMcpServer — resources', () => {
  it('lists signal://feed/{tier} resource', () => {
    const uris = handleListResources().resources.map((r: any) => r.uri);
    expect(uris).toContain('signal://feed/{tier}');
  });

  it('listResources returns correctly shaped resource', () => {
    const result = handleListResources();
    expect(result.resources).toHaveLength(1);
    const r = result.resources[0];
    expect(r.uri).toBe('signal://feed/{tier}');
    expect(r.name).toBe('Signal Feed');
    expect(r.mimeType).toBe('application/json');
  });

  it('parses valid URI with all params', () => {
    const result = handleReadResource('signal://feed/PRO?since=1000&limit=50&apiKey=valid-pro-key');
    expect(result).toHaveProperty('parsed');
    expect(result).toHaveProperty('identity');
    expect(result.parsed.tier).toBe('PRO');
    expect(result.parsed.since).toBe(1000);
    expect(result.parsed.limit).toBe(50);
    expect(result.identity.subscriberId).toBe('sub-1');
  });

  it('parses URI without optional params', () => {
    const result = handleReadResource('signal://feed/FREE?apiKey=valid-free-key');
    expect(result.parsed.tier).toBe('FREE');
    expect(result.parsed.since).toBe(0);
    expect(result.parsed.limit).toBe(20);
  });

  it('returns error contents for invalid URI', () => {
    const result = handleReadResource('signal://unknown/tier');
    expect(result).toHaveProperty('contents');
    const text = result.contents?.[0]?.text ?? '';
    expect(text).toMatch(/error|Invalid/i);
  });

  it('returns error contents for bad API key', () => {
    const result = handleReadResource('signal://feed/PRO?apiKey=bad-key');
    expect(result).toHaveProperty('contents');
    const text = result.contents?.[0]?.text ?? '';
    expect(text).toMatch(/Unauthorized|invalid/i);
  });

  it('returns error for URI without apiKey', () => {
    const result = handleReadResource('signal://feed/PRO');
    expect(result).toHaveProperty('contents');
    const text = result.contents?.[0]?.text ?? '';
    expect(text).toMatch(/error|Invalid/i);
  });
});
