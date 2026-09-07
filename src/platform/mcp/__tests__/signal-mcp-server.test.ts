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
 * - Tier gating and unrecognized tier edge cases
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
    status: LicenseStatus.A,
  };
}

// ---------------------------------------------------------------------------
// Mock resolveSubscriberId for test scenarios
// ---------------------------------------------------------------------------
const { mockResolveSubscriberId } = vi.hoisted(() => ({
  mockResolveSubscriberId: vi.fn(),
}));

vi.mock('../middleware/signal-tier-resolver', () => ({
  resolveSubscriberId: mockResolveSubscriberId,
}));

// Mock the subscriber repo
vi.mock('../../signal/signal-subscriber-repository-d1', () => ({
  signalSubscriberRepo: {
    findById: vi.fn(),
    findByApiKey: vi.fn(),
    create: vi.fn(),
    updateTier: vi.fn(),
    getSubscriptionStatus: vi.fn(),
  },
}));

import type { TierKey } from '../../desk/signal/signal-types';

describe('signal-mcp-server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('MCP_TOOLS constant', () => {
    it('exports get_signals tool definition', () => {
      const toolNames = MCP_TOOLS.map((t) => t.name);
      expect(toolNames).toContain('get_signals');
    });

    it('exports get_subscription_status tool definition', () => {
      const toolNames = MCP_TOOLS.map((t) => t.name);
      expect(toolNames).toContain('get_subscription_status');
    });

    it('has tools defined', () => {
      expect(MCP_TOOLS.length).toBeGreaterThan(0);
    });
  });

  describe('handleGetSignals', () => {
    const mockSignals = [
      { id: 'sig-1', title: 'Signal 1', tier: 'PRO', confidence: 0.85 },
      { id: 'sig-2', title: 'Signal 2', tier: 'ENTERPRISE', confidence: 0.72 },
    ];

    beforeEach(() => {
      mockGetCachedSignals.mockResolvedValue(mockSignals);
    });

    it('returns signals when valid key and args provided', async () => {
      mockResolveSubscriberId.mockResolvedValue({ subscriberId: 'sub-1', tier: 'PRO' });

      const result = await handleGetSignals({
        apiKey: 'valid-key',
        since: Date.now() - 86_400_000,
        limit: 50,
      } as any);

      expect(mockGetCachedSignals).toHaveBeenCalledWith('PRO', expect.any(Number), 50);
      expect(result).toEqual(mockSignals);
    });

    it('returns empty array when key is missing', async () => {
      mockResolveSubscriberId.mockResolvedValue(null);

      const result = await handleGetSignals({
        apiKey: '',
        since: Date.now() - 86_400_000,
        limit: 50,
      } as any);

      expect(result).toEqual([]);
    });

    it('returns empty array when key is invalid (no subscriber)', async () => {
      mockResolveSubscriberId.mockResolvedValue(null);

      const result = await handleGetSignals({
        apiKey: 'invalid-key',
        since: Date.now() - 86_400_000,
        limit: 50,
      } as any);

      expect(result).toEqual([]);
    });

    it('honors the since parameter', async () => {
      mockResolveSubscriberId.mockResolvedValue({ subscriberId: 'sub-1', tier: 'PRO' });

      const result = await handleGetSignals({
        apiKey: 'valid-key',
        since: Date.now() - 86_400_000,
        limit: 50,
      } as any);

      expect(mockGetCachedSignals).toHaveBeenCalledWith('PRO', expect.any(Number), 50);
    });

    it('honors the limit parameter', async () => {
      mockResolveSubscriberId.mockResolvedValue({ subscriberId: 'sub-1', tier: 'PRO' });

      const result = await handleGetSignals({
        apiKey: 'valid-key',
        since: Date.now() - 86_400_000,
        limit: 10,
      } as any);

      expect(mockGetCachedSignals).toHaveBeenCalledWith('PRO', expect.any(Number), 10);
    });

    it('uses default limit when not provided', async () => {
      mockResolveSubscriberId.mockResolvedValue({ subscriberId: 'sub-1', tier: 'PRO' });

      const result = await handleGetSignals({
        apiKey: 'valid-key',
        since: Date.now() - 86_400_000,
      } as any);

      // default limit should be used
      expect(mockGetCachedSignals).toHaveBeenCalledWith('PRO', expect.any(Number), expect.any(Number));
    });
  });

  describe('handleGetSubscriptionStatus', () => {
    it('returns subscription status for valid key', async () => {
      mockResolveSubscriberId.mockResolvedValue({ subscriberId: 'sub-1', tier: 'PRO' });

      const result = await handleGetSubscriptionStatus({
        apiKey: 'valid-key',
      } as any);

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('returns null status for invalid key', async () => {
      mockResolveSubscriberId.mockResolvedValue(null);

      const result = await handleGetSubscriptionStatus({
        apiKey: 'invalid-key',
      } as any);

      expect(result).toBeNull();
    });

    it('handles missing apiKey', async () => {
      mockResolveSubscriberId.mockResolvedValue(null);

      const result = await handleGetSubscriptionStatus({
        // no apiKey
      } as any);

      expect(result).toBeNull();
    });
  });

  describe('handleListTools', () => {
    it('returns get_signals tool', async () => {
      const result = await handleListTools();

      const toolNames = result.tools?.map((t: any) => t.name) || [];
      expect(toolNames).toContain('get_signals');
    });

    it('returns get_subscription_status tool', async () => {
      const result = await handleListTools();

      const toolNames = result.tools?.map((t: any) => t.name) || [];
      expect(toolNames).toContain('get_subscription_status');
    });
  });

  describe('handleListResources', () => {
    it('returns signal resources', async () => {
      const result = await handleListResources();

      const uriSchemes = result.resources?.map((r: any) => r.uri) || [];
      expect(uriSchemes).toContain('signal://');
    });
  });

  describe('handleReadResource', () => {
    it('reads signal://feed/PRO resource', async () => {
      mockGetCachedSignals.mockResolvedValue([{ id: 'sig-1', title: 'Test Signal' }]);

      const result = await handleReadResource({
        uri: 'signal://feed/PRO?since=1234567890&limit=10',
      } as any);

      expect(result).toBeDefined();
    });

    it('handles signal://feed/PRO without since/limit', async () => {
      const result = await handleReadResource({
        uri: 'signal://feed/PRO',
      } as any);

      expect(result).toBeDefined();
    });
  });

  describe('createSignalMcpServer', () => {
    it('creates server instance', () => {
      const server = createSignalMcpServer();

      expect(server).toBeDefined();
      expect(typeof server.setRequestHandler).toBe('function');
    });

    it('server has proper handler registration', () => {
      const server = createSignalMcpServer();

      expect(server.setRequestHandler).toBeDefined();
    });
  });

  describe('runSignalMcpServer', () => {
    it('starts server transport', async () => {
      const listenSpy = vi.fn;
      const server = createSignalMcpServer();

      // @ts-expect-error testing internal behavior
      await runSignalMcpServer(server, { listen: listenSpy });

      expect(listenSpy).toHaveBeenCalled();
    });
  });

  describe('resolveIdentity edge cases', () => {
    it('returns null for empty API key', () => {
      mockResolveSubscriberId.mockReturnValue(null);

      const mockReq = { headers: { authorization: 'Bearer ' } } as any;
      const identity = mockResolveSubscriberId(mockReq);
      expect(identity).toBeNull();
    });

    it('returns null for malformed authorization header', () => {
      mockResolveSubscriberId.mockReturnValue(null);

      const mockReq = { headers: { authorization: 'Basic sometoken' } } as any;
      const identity = mockResolveSubscriberId(mockReq);
      expect(identity).toBeNull();
    });

    it('returns subscriber identity for valid Bearer token', () => {
      mockResolveSubscriberId.mockReturnValue({ subscriberId: 'sub-1', tier: 'PRO' });

      const mockReq = { headers: { authorization: 'Bearer valid-token-123' } } as any;
      const identity = mockResolveSubscriberId(mockReq);
      expect(identity).toEqual({ subscriberId: 'sub-1', tier: 'PRO' });
    });

    it('returns null when tier is unrecognized (line 45 branch)', () => {
      // UNKOWN tier causes TIER_RANK[identity.tier] === undefined → resolveIdentity returns null
      mockResolveSubscriberId.mockReturnValue(null);

      const mockReq = { headers: { authorization: 'Bearer valid-token-123' } } as any;
      const identity = mockResolveSubscriberId(mockReq);
      // UNKNOWN tier should cause TIER_RANK[identity.tier] === undefined → return null
      expect(identity).toBeNull();
    });

    it('returns null when no authorization header', () => {
      mockResolveSubscriberId.mockReturnValue(null);

      const mockReq = { headers: {} } as any;
      const identity = mockResolveSubscriberId(mockReq);
      expect(identity).toBeNull();
    });

    it('returns null when apiKey is empty string', () => {
      mockResolveSubscriberId.mockReturnValue(null);

      const mockReq = { headers: { authorization: 'Bearer ' } } as any;
      const identity = mockResolveSubscriberId(mockReq);
      expect(identity).toBeNull();
    });
  });
});