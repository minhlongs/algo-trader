/**
 * redis/index — Unit Tests
 *
 * Covers src/redis/index.ts:
 * - getRedisClient: single-instance mode (lazy init, error/connect listeners),
 *   cluster mode (delegates to cluster-config)
 * - getPubClient / getSubClient: single-instance (lazy, db passed through),
 *   cluster mode (createRedisClusterClient delegation)
 * - closeRedisConnections: single-instance (quit all, reset to null),
 *   cluster mode (close cluster + quit pub/sub, reset)
 * - isClusterMode: true / false
 *
 * NOTE: DEFAULT_CONFIG is a module-private const (not exported), so tests
 * infer it by inspecting the constructor args captured by RedisStub.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockLogger, mockError, mockInfo, mockQuit, mockClusterClose, mockCreateCluster, RedisStub, ClusterStub, redisCalls } = vi.hoisted(() => {
  const redisCalls: unknown[][] = [];
  const mockError = vi.fn();
  const mockInfo = vi.fn();
  const mockQuit = vi.fn();
  const mockClusterClose = vi.fn();
  const mockCreateCluster = vi.fn();

  class RedisStub {
    on = vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (event === 'error') mockError.mockImplementation(cb);
      if (event === 'connect') mockInfo.mockImplementation(cb);
      return this;
    });
    quit = mockQuit;
    constructor(...args: unknown[]) {
      redisCalls.push(args);
    }
  }

  class ClusterStub {
    quit = mockQuit;
    constructor() {
      mockCreateCluster();
    }
  }

  return {
    mockLogger: { debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() },
    mockError,
    mockInfo,
    mockQuit,
    mockClusterClose,
    mockCreateCluster,
    RedisStub,
    ClusterStub,
    redisCalls,
  };
});

vi.mock('ioredis', () => ({
  __esModule: true,
  default: RedisStub,
  Redis: RedisStub,
  Cluster: ClusterStub,
}));

vi.mock('../../../src/shared/utils/logger', () => ({
  logger: mockLogger,
}));

vi.mock('../../../src/redis/cluster-config', () => ({
  getRedisClusterClient: vi.fn(() => new ClusterStub()),
  getClusterHealth: vi.fn(),
  closeRedisClusterClient: mockClusterClose,
  createRedisClusterClient: vi.fn(() => new ClusterStub()),
}));

// Use dynamic import so the mocked modules are fresh after vi.resetModules.
let getRedisClient: () => RedisStub | ClusterStub;
let getPubClient: () => RedisStub | ClusterStub;
let getSubClient: () => RedisStub | ClusterStub;
let closeRedisConnections: () => Promise<void>;
let isClusterMode: () => boolean;

beforeEach(async () => {
  delete process.env.REDIS_CLUSTER_ENABLED;
  redisCalls.length = 0;
  mockQuit.mockClear();
  mockError.mockClear();
  mockInfo.mockClear();
  mockClusterClose.mockClear();
  mockCreateCluster.mockClear();
  vi.resetModules();
  const mod = await import('../../../src/redis/index');
  getRedisClient = mod.getRedisClient;
  getPubClient = mod.getPubClient;
  getSubClient = mod.getSubClient;
  closeRedisConnections = mod.closeRedisConnections;
  isClusterMode = mod.isClusterMode;
});

afterEach(async () => {
  await closeRedisConnections();
});

describe('getRedisClient — single-instance mode', () => {
  it('creates a Redis client with DEFAULT_CONFIG', () => {
    const client = getRedisClient();
    expect(client).toBeInstanceOf(RedisStub);
    expect(redisCalls).toHaveLength(1);
    const cfg = redisCalls[0][0] as Record<string, unknown>;
    expect(cfg.host).toBe('localhost');
    expect(cfg.port).toBe(6379);
    expect(cfg.password).toBeUndefined();
    expect(cfg.db).toBe(0);
    expect(cfg.maxRetriesPerRequest).toBe(3);
    expect(cfg.retryDelayOnFailover).toBe(100);
  });

  it('registers error listener', () => {
    const client = getRedisClient();
    expect(client.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('registers connect listener', () => {
    const client = getRedisClient();
    expect(client.on).toHaveBeenCalledWith('connect', expect.any(Function));
  });

  it('returns the same singleton on subsequent calls', () => {
    const a = getRedisClient();
    const b = getRedisClient();
    expect(a).toBe(b);
    expect(redisCalls).toHaveLength(1);
  });
});

describe('getPubClient — single-instance mode', () => {
  it('creates a Redis client with DEFAULT_CONFIG and db', () => {
    const client = getPubClient();
    expect(client).toBeInstanceOf(RedisStub);
    expect(redisCalls).toHaveLength(1);
    const cfg = redisCalls[0][0] as Record<string, unknown>;
    expect(cfg.host).toBe('localhost');
    expect(cfg.port).toBe(6379);
    expect(cfg.db).toBe(0);
  });

  it('returns the same singleton on subsequent calls', () => {
    const a = getPubClient();
    const b = getPubClient();
    expect(a).toBe(b);
    expect(redisCalls).toHaveLength(1);
  });
});

describe('getSubClient — single-instance mode', () => {
  it('creates a Redis client with DEFAULT_CONFIG and db', () => {
    const client = getSubClient();
    expect(client).toBeInstanceOf(RedisStub);
    expect(redisCalls).toHaveLength(1);
    const cfg = redisCalls[0][0] as Record<string, unknown>;
    expect(cfg.host).toBe('localhost');
    expect(cfg.port).toBe(6379);
    expect(cfg.db).toBe(0);
  });

  it('returns the same singleton on subsequent calls', () => {
    const a = getSubClient();
    const b = getSubClient();
    expect(a).toBe(b);
    expect(redisCalls).toHaveLength(1);
  });
});

describe('closeRedisConnections — single-instance mode', () => {
  it('quits all clients and resets singletons', async () => {
    const main = getRedisClient();
    const pub = getPubClient();
    const sub = getSubClient();
    expect(main).toBeInstanceOf(RedisStub);
    expect(pub).toBeInstanceOf(RedisStub);
    expect(sub).toBeInstanceOf(RedisStub);

    await closeRedisConnections();

    expect(mockQuit).toHaveBeenCalledTimes(3);
    // After close, a fresh client should be a new instance (singleton reset)
    const fresh = getRedisClient();
    expect(fresh).not.toBe(main);
    expect(fresh).toBeInstanceOf(RedisStub);
  });

  it('does not throw when no clients are open', async () => {
    await expect(closeRedisConnections()).resolves.toBeUndefined();
  });
});

describe('isClusterMode', () => {
  it('returns false by default', () => {
    expect(isClusterMode()).toBe(false);
  });

  it('returns true when REDIS_CLUSTER_ENABLED=true', () => {
    process.env.REDIS_CLUSTER_ENABLED = 'true';
    expect(isClusterMode()).toBe(true);
  });

  it('returns false for non-true values', () => {
    process.env.REDIS_CLUSTER_ENABLED = 'yes';
    expect(isClusterMode()).toBe(false);
  });
});

describe('cluster mode', () => {
  beforeEach(() => {
    process.env.REDIS_CLUSTER_ENABLED = 'true';
  });

  it('getRedisClient delegates to getRedisClusterClient', () => {
    const client = getRedisClient();
    expect(client).toBeInstanceOf(ClusterStub);
  });

  it('getPubClient creates a cluster client on first call', () => {
    const client = getPubClient();
    expect(client).toBeInstanceOf(ClusterStub);
    expect(mockCreateCluster).toHaveBeenCalledTimes(1);
  });

  it('getSubClient creates a cluster client on first call', () => {
    const client = getSubClient();
    expect(client).toBeInstanceOf(ClusterStub);
    expect(mockCreateCluster).toHaveBeenCalledTimes(1);
  });

  it('closeRedisConnections closes cluster and quits pub/sub', async () => {
    const pub = getPubClient();
    const sub = getSubClient();
    expect(pub).toBeInstanceOf(ClusterStub);
    expect(sub).toBeInstanceOf(ClusterStub);

    await closeRedisConnections();

    expect(mockClusterClose).toHaveBeenCalled();
    // pub/sub cluster clients were quit
    expect(mockQuit).toHaveBeenCalledTimes(2);
  });
});