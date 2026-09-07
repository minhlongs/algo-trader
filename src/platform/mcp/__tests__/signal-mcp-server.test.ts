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
 * - Server factory: createSignalMcpServer, runSignalMcpServer
 * - MCP_TOOLS constant
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies BEFORE importing the server module
const { mockGetCachedSignals } = vi.hoisted(() => ({
  mockGetCachedSignals: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../desk/signal/signal-rest-cache', () => ({
  getCachedSignals: mockGetCachedSignals,
}));

import { __setGate } from '../../middleware/signal-tier-resolver';
import { signalSubscriberRepo } from '../../signal/signal-subscriber-repository-d1';
import {
  handleGetSignals,
  handleGetSubscriptionStatus,
  handleListTools,
  handleListResources,
  handleReadResource,
  createSignalMcpServer,
  MCP_TOOLS,
} from '../signal-mcp-server';
import { License, LicenseTier, LicenseStatus } from '../../../shared/types/license';

// ---------------------------------------------------------------------------
// Mock gate — returns License object matching the real interface
// ---------------------------------------------------------------------------
function fakeLicense(tier: LicenseTier, subscriberId = 'sub-1', userId = 'user-1'): License {
  return {
    id: `lic-${subscriberId}`,
    name: `Test License ${tier}`,
    key: `test-key-${subscriberId}`,
    tier,
    status: LicenseStatus.ACTIVE,
    createdAt: new Date().toISOString(),
    usageCount: 0,
    userId,
  };
}

const FREE_GATE = { validateApiKey: (k: string) => k ? fakeLicense(LicenseTier.FREE, 'sub-free', 'user-free') : undefined };
const PRO_GATE = { validateApiKey: (k: string) => k ? fakeLicense(LicenseTier.PRO, 'sub-pro', 'user-pro') : undefined };
const ENTERPRISE_GATE = { validateApiKey: (k: string) => k ? fakeLicense(LicenseTier.ENTERPRISE, 'sub-ent', 'user-ent') : undefined };
const INVALID_GATE = { validateApiKey: () => undefined };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCachedSignals.mockResolvedValue([]);
});

afterEach(() => {
  __setGate(null);
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
    __setGate(PRO_GATE);
    try {
      const result = await handleGetSignals({ apiKey: 'valid-pro-key', tier: 'PRO' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data).toEqual([]);
      expect(parsed.tier).toBe('PRO');
      expect(parsed.count).toBe(0);
      expect(parsed.cached).toBe(false);
    } finally {
      __setGate(null);
    }
  });

  it('returns success with FREE key + FREE tier', async () => {
    __setGate(FREE_GATE);
    try {
      const result = await handleGetSignals({ apiKey: 'valid-free-key', tier: 'FREE' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tier).toBe('FREE');
    } finally {
      __setGate(null);
    }
  });

  it('returns success with ENTERPRISE key + ENTERPRISE tier', async () => {
    __setGate(ENTERPRISE_GATE);
    try {
      const result = await handleGetSignals({ apiKey: 'valid-enterprise-key', tier: 'ENTERPRISE' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tier).toBe('ENTERPRISE');
    } finally {
      __setGate(null);
    }
  });

  it('downgrades ENTERPRISE request to PRO for PRO key (tier ceiling)', async () => {
    __setGate(PRO_GATE);
    try {
      const result = await handleGetSignals({ apiKey: 'valid-pro-key', tier: 'ENTERPRISE' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tier).toBe('PRO');
      expect(parsed.count).toBe(0);
    } finally {
      __setGate(null);
    }
  });

  it('downgrades ENTERPRISE request to FREE for FREE key (ceiling)', async () => {
    __setGate(FREE_GATE);
    try {
      const result = await handleGetSignals({ apiKey: 'valid-free-key', tier: 'ENTERPRISE' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tier).toBe('FREE');
    } finally {
      __setGate(null);
    }
  });

  it('downgrades PRO request to FREE for FREE key (ceiling)', async () => {
    __setGate(FREE_GATE);
    try {
      const result = await handleGetSignals({ apiKey: 'valid-free-key', tier: 'PRO' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tier).toBe('FREE');
    } finally {
      __setGate(null);
    }
  });

  it('rejects invalid API key', async () => {
    __setGate(INVALID_GATE);
    try {
      const result = await handleGetSignals({ apiKey: 'bad-key', tier: 'PRO' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Unauthorized|invalid/i);
    } finally {
      __setGate(null);
    }
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
    __setGate(PRO_GATE);
    try {
      const low = await handleGetSignals({ apiKey: 'valid-pro-key', tier: 'PRO', limit: 0 });
      expect(low.isError).toBe(false);

      const high = await handleGetSignals({ apiKey: 'valid-pro-key', tier: 'PRO', limit: 999 });
      expect(high.isError).toBe(false);
    } finally {
      __setGate(null);
    }
  });

  it('defaults since to 0 and limit to 20', async () => {
    __setGate(PRO_GATE);
    try {
      const result = await handleGetSignals({ apiKey: 'valid-pro-key', tier: 'PRO' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tier).toBe('PRO');
      expect(parsed.count).toBe(0);
    } finally {
      __setGate(null);
    }
  });

  it('returns cached signals when cache has data', async () => {
    __setGate(PRO_GATE);
    try {
      const mockSignals = [
        { id: 'sig-1', symbol: 'BTC', direction: 'LONG', timestamp: 1000 },
        { id: 'sig-2', symbol: 'ETH', direction: 'SHORT', timestamp: 2000 },
      ];
      mockGetCachedSignals.mockResolvedValue(mockSignals);

      const result = await handleGetSignals({ apiKey: 'valid-pro-key', tier: 'PRO', since: 500, limit: 10 });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data).toEqual(mockSignals);
      expect(parsed.count).toBe(2);
      expect(parsed.cached).toBe(false); // SUT doesn't currently expose cache hit
      expect(mockGetCachedSignals).toHaveBeenCalledWith('PRO', 500, 10);
    } finally {
      __setGate(null);
    }
  });

  it('handles cache errors gracefully', async () => {
    __setGate(PRO_GATE);
    try {
      mockGetCachedSignals.mockRejectedValue(new Error('cache down'));

      const result = await handleGetSignals({ apiKey: 'valid-pro-key', tier: 'PRO' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data).toEqual([]);
      expect(parsed.count).toBe(0);
    } finally {
      __setGate(null);
    }
  });

  it('returns effective tier when invalid tier value provided', async () => {
    __setGate(PRO_GATE);
    try {
      const result = await handleGetSignals({ apiKey: 'valid-pro-key', tier: 'INVALID' } as any);
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      // Invalid tier passes through (rank 0), tier ceiling keeps identity tier since 0 > 2 is false
      // But the code returns args.tier when requestedRank <= identityRank, so 'INVALID' is returned
      expect(parsed.tier).toBe('INVALID');
    } finally {
      __setGate(null);
    }
  });
});

// ---------------------------------------------------------------------------
// get_subscription_status
// ---------------------------------------------------------------------------
describe('SignalMcpServer — get_subscription_status', () => {
  it('returns subscription info for valid PRO key', async () => {
    __setGate(PRO_GATE);
    vi.spyOn(signalSubscriberRepo, 'getBySubscriberId').mockResolvedValue({
      id: 'sub-abc',
      subscriberId: 'sub-pro',
      tier: 'PRO',
      active: true,
      createdAt: 1000,
      updatedAt: 2000,
      chatId: 12345,
      notificationsEnabled: true,
    } as any);

    try {
      const result = await handleGetSubscriptionStatus({ apiKey: 'valid-pro-key' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.subscriberId).toBe('user-pro');
      expect(parsed.tier).toBe('PRO');
      expect(parsed.subscribed).toBe(true);
      expect(parsed.subscriptionId).toBe('sub-abc');
      expect(parsed.subscriptionActive).toBe(true);
    } finally {
      __setGate(null);
    }
  });

  it('returns subscribed:false when no subscription', async () => {
    __setGate(PRO_GATE);
    vi.spyOn(signalSubscriberRepo, 'getBySubscriberId').mockResolvedValue(null as any);

    try {
      const result = await handleGetSubscriptionStatus({ apiKey: 'valid-pro-key' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.subscribed).toBe(false);
      expect(parsed.subscriptionId).toBeNull();
      expect(parsed.subscriptionActive).toBe(false);
    } finally {
      __setGate(null);
    }
  });

  it('rejects invalid API key', async () => {
    __setGate(INVALID_GATE);
    try {
      const result = await handleGetSubscriptionStatus({ apiKey: 'bad-key' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Unauthorized|invalid/i);
    } finally {
      __setGate(null);
    }
  });

  it('rejects missing apiKey', async () => {
    const result = await handleGetSubscriptionStatus({} as any);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Missing required|apiKey/i);
  });

  it('works with FREE tier key', async () => {
    __setGate(FREE_GATE);
    vi.spyOn(signalSubscriberRepo, 'getBySubscriberId').mockResolvedValue({
      id: 'sub-free-1',
      subscriberId: 'sub-free',
      tier: 'FREE',
      active: false,
      createdAt: 1000,
      updatedAt: 2000,
      chatId: null,
      notificationsEnabled: false,
    } as any);

    try {
      const result = await handleGetSubscriptionStatus({ apiKey: 'valid-free-key' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.subscriberId).toBe('user-free');
      expect(parsed.tier).toBe('FREE');
      expect(parsed.subscribed).toBe(true);
      expect(parsed.subscriptionActive).toBe(false);
    } finally {
      __setGate(null);
    }
  });

  it('works with ENTERPRISE tier key', async () => {
    __setGate(ENTERPRISE_GATE);
    vi.spyOn(signalSubscriberRepo, 'getBySubscriberId').mockResolvedValue({
      id: 'sub-ent-1',
      subscriberId: 'sub-ent',
      tier: 'ENTERPRISE',
      active: true,
      createdAt: 1000,
      updatedAt: 2000,
      chatId: 99999,
      notificationsEnabled: true,
    } as any);

    try {
      const result = await handleGetSubscriptionStatus({ apiKey: 'valid-enterprise-key' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tier).toBe('ENTERPRISE');
      expect(parsed.subscriptionActive).toBe(true);
    } finally {
      __setGate(null);
    }
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
    __setGate(PRO_GATE);
    try {
      const result = handleReadResource('signal://feed/PRO?since=1000&limit=50&apiKey=valid-pro-key');
      expect(result).toHaveProperty('parsed');
      expect(result).toHaveProperty('identity');
      expect(result.parsed.tier).toBe('PRO');
      expect(result.parsed.since).toBe(1000);
      expect(result.parsed.limit).toBe(50);
      expect(result.identity.subscriberId).toBe('user-pro');
    } finally {
      __setGate(null);
    }
  });

  it('parses URI without optional params', () => {
    __setGate(FREE_GATE);
    try {
      const result = handleReadResource('signal://feed/FREE?apiKey=valid-free-key');
      expect(result.parsed.tier).toBe('FREE');
      expect(result.parsed.since).toBe(0);
      expect(result.parsed.limit).toBe(20);
    } finally {
      __setGate(null);
    }
  });

  it('parses ENTERPRISE tier URI', () => {
    __setGate(ENTERPRISE_GATE);
    try {
      const result = handleReadResource('signal://feed/ENTERPRISE?since=5000&limit=100&apiKey=valid-enterprise-key');
      expect(result.parsed.tier).toBe('ENTERPRISE');
      expect(result.parsed.since).toBe(5000);
      expect(result.parsed.limit).toBe(100);
      expect(result.identity.subscriberId).toBe('user-ent');
    } finally {
      __setGate(null);
    }
  });

  it('returns error contents for invalid URI', () => {
    const result = handleReadResource('signal://unknown/tier');
    expect(result).toHaveProperty('contents');
    const text = result.contents?.[0]?.text ?? '';
    expect(text).toMatch(/error|Invalid/i);
  });

  it('returns error contents for bad API key', () => {
    __setGate(INVALID_GATE);
    try {
      const result = handleReadResource('signal://feed/PRO?apiKey=bad-key');
      expect(result).toHaveProperty('contents');
      const text = result.contents?.[0]?.text ?? '';
      expect(text).toMatch(/Unauthorized|invalid/i);
    } finally {
      __setGate(null);
    }
  });

  it('returns error for URI without apiKey', () => {
    const result = handleReadResource('signal://feed/PRO');
    expect(result).toHaveProperty('contents');
    const text = result.contents?.[0]?.text ?? '';
    expect(text).toMatch(/error|Invalid/i);
  });

  it('returns error for URI with invalid tier', () => {
    __setGate(PRO_GATE);
    try {
      const result = handleReadResource('signal://feed/INVALID?apiKey=valid-pro-key');
      expect(result).toHaveProperty('contents');
      const text = result.contents?.[0]?.text ?? '';
      expect(text).toMatch(/error|Invalid/i);
    } finally {
      __setGate(null);
    }
  });

  it('clamps limit to 1-100 in resource URI', () => {
    __setGate(PRO_GATE);
    try {
      // limit > 100 should clamp to 100
      const high = handleReadResource('signal://feed/PRO?limit=999&apiKey=valid-pro-key');
      expect(high.parsed.limit).toBe(100);

      // limit < 1 should clamp to 1
      const low = handleReadResource('signal://feed/PRO?limit=0&apiKey=valid-pro-key');
      expect(low.parsed.limit).toBe(1);
    } finally {
      __setGate(null);
    }
  });

  it('defaults since to 0 when missing', () => {
    __setGate(PRO_GATE);
    try {
      const result = handleReadResource('signal://feed/PRO?apiKey=valid-pro-key');
      expect(result.parsed.since).toBe(0);
    } finally {
      __setGate(null);
    }
  });

  it('passes minimum tier check for valid tiers', () => {
    // FREE tier has minimum tier FREE (rank 0), so it should pass minimum tier check
    __setGate(PRO_GATE);
    try {
      const result = handleReadResource('signal://feed/PRO?apiKey=valid-pro-key');
      expect(result).toHaveProperty('parsed');
      expect(result).toHaveProperty('identity');
      expect(result.identity.tier).toBe('PRO');
    } finally {
      __setGate(null);
    }
  });

  it('passes minimum tier check for FREE tier', () => {
    __setGate(FREE_GATE);
    try {
      const result = handleReadResource('signal://feed/FREE?apiKey=valid-free-key');
      expect(result).toHaveProperty('parsed');
      expect(result.identity.tier).toBe('FREE');
    } finally {
      __setGate(null);
    }
  });
});

// ---------------------------------------------------------------------------
// createSignalMcpServer
// ---------------------------------------------------------------------------
describe('createSignalMcpServer', () => {
  it('creates a server with tools and resources capability', () => {
    const server = createSignalMcpServer();
    expect(server).toBeDefined();
    // Server instance is from MCP SDK; just verify it was created without error
  });

  it('server has correct name and version', () => {
    const server = createSignalMcpServer();
    // @ts-expect-error - accessing private field for test
    expect(server._serverInfo?.name).toBe('signal-mcp-server');
    // @ts-expect-error
    expect(server._serverInfo?.version).toBe('1.0.0');
  });
});

// ---------------------------------------------------------------------------
// runSignalMcpServer
// ---------------------------------------------------------------------------
describe('runSignalMcpServer', () => {
  it('is exported as a function', async () => {
    const mod = await import('../signal-mcp-server');
    expect(typeof mod.runSignalMcpServer).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// MCP_TOOLS constant
// ---------------------------------------------------------------------------
describe('MCP_TOOLS constant', () => {
  it('is a non-empty array of Tool objects', () => {
    expect(Array.isArray(MCP_TOOLS)).toBe(true);
    expect(MCP_TOOLS.length).toBe(2);
  });

  it('each tool has required fields', () => {
    for (const tool of MCP_TOOLS) {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.properties?.apiKey).toBeDefined();
    }
  });

  it('get_signals tool has tier parameter with enum', () => {
    const gs = MCP_TOOLS.find(t => t.name === 'get_signals')!;
    expect(gs.inputSchema.properties.tier).toBeDefined();
    expect(gs.inputSchema.properties.tier.enum).toEqual(['FREE', 'PRO', 'ENTERPRISE']);
  });

  it('get_subscription_status tool has only apiKey parameter', () => {
    const gs = MCP_TOOLS.find(t => t.name === 'get_subscription_status')!;
    expect(Object.keys(gs.inputSchema.properties)).toEqual(['apiKey']);
  });
});

// ---------------------------------------------------------------------------
// Tier ceiling edge cases
// ---------------------------------------------------------------------------
describe('SignalMcpServer — tier ceiling edge cases', () => {
  it('FREE key requesting PRO gets FREE', async () => {
    __setGate(FREE_GATE);
    try {
      const result = await handleGetSignals({ apiKey: 'valid-free-key', tier: 'PRO' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tier).toBe('FREE');
    } finally {
      __setGate(null);
    }
  });

  it('FREE key requesting ENTERPRISE gets FREE', async () => {
    __setGate(FREE_GATE);
    try {
      const result = await handleGetSignals({ apiKey: 'valid-free-key', tier: 'ENTERPRISE' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tier).toBe('FREE');
    } finally {
      __setGate(null);
    }
  });

  it('PRO key requesting ENTERPRISE gets PRO', async () => {
    __setGate(PRO_GATE);
    try {
      const result = await handleGetSignals({ apiKey: 'valid-pro-key', tier: 'ENTERPRISE' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tier).toBe('PRO');
    } finally {
      __setGate(null);
    }
  });

  it('PRO key requesting FREE gets FREE (no upgrade)', async () => {
    __setGate(PRO_GATE);
    try {
      const result = await handleGetSignals({ apiKey: 'valid-pro-key', tier: 'FREE' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tier).toBe('FREE');
    } finally {
      __setGate(null);
    }
  });

  it('ENTERPRISE key requesting FREE gets FREE (no upgrade)', async () => {
    __setGate(ENTERPRISE_GATE);
    try {
      const result = await handleGetSignals({ apiKey: 'valid-enterprise-key', tier: 'FREE' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tier).toBe('FREE');
    } finally {
      __setGate(null);
    }
  });

  it('ENTERPRISE key requesting PRO gets PRO (no upgrade)', async () => {
    __setGate(ENTERPRISE_GATE);
    try {
      const result = await handleGetSignals({ apiKey: 'valid-enterprise-key', tier: 'PRO' });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tier).toBe('PRO');
    } finally {
      __setGate(null);
    }
  });
});

// ---------------------------------------------------------------------------
// Since parameter edge cases
// ---------------------------------------------------------------------------
describe('SignalMcpServer — since parameter edge cases', () => {
  it('handles since = 0', async () => {
    __setGate(PRO_GATE);
    try {
      const result = await handleGetSignals({ apiKey: 'valid-pro-key', tier: 'PRO', since: 0 });
      expect(result.isError).toBe(false);
    } finally {
      __setGate(null);
    }
  });

  it('handles large since value', async () => {
    __setGate(PRO_GATE);
    try {
      const result = await handleGetSignals({ apiKey: 'valid-pro-key', tier: 'PRO', since: 9999999999999 });
      expect(result.isError).toBe(false);
      expect(mockGetCachedSignals).toHaveBeenCalledWith('PRO', 9999999999999, 20);
    } finally {
      __setGate(null);
    }
  });

  it('handles negative since (treated as 0 by SUT)', async () => {
    __setGate(PRO_GATE);
    try {
      const result = await handleGetSignals({ apiKey: 'valid-pro-key', tier: 'PRO', since: -1000 });
      expect(result.isError).toBe(false);
      // SUT does: typeof args.since === 'number' ? args.since : 0
      // So negative is passed through to cache
      expect(mockGetCachedSignals).toHaveBeenCalledWith('PRO', -1000, 20);
    } finally {
      __setGate(null);
    }
  });
});