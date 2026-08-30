/**
 * Tests for cluster-config — mocks ioredis Cluster constructor and logger so
 * every exported function (create, get, health check, close) is exercised
 * without a live Redis cluster.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockLogger, mockOn, mockClusterInfo, mockQuit } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  mockOn: vi.fn(),
  mockClusterInfo: vi.fn(),
  mockQuit: vi.fn(),
}));

// Captured constructor arguments per Cluster instantiation.
const clusterCalls: [unknown[], unknown][] = [];

// `new Cluster(...)` needs a real class, not an arrow-function vi.fn().
class ClusterStub {
  on = mockOn;
  cluster = mockClusterInfo;
  quit = mockQuit;
  constructor(nodes: unknown[], options: unknown) {
    clusterCalls.push([nodes, options]);
  }
}

vi.mock('ioredis', () => ({
  Cluster: ClusterStub,
  ClusterNode: class {},
}));

vi.mock('../../shared/utils/logger', () => ({
  logger: mockLogger,
}));

let createRedisClusterClient: typeof import('../cluster-config').createRedisClusterClient;
let getRedisClusterClient: typeof import('../cluster-config').getRedisClusterClient;
let getClusterHealth: typeof import('../cluster-config').getClusterHealth;
let closeRedisClusterClient: typeof import('../cluster-config').closeRedisClusterClient;

beforeEach(async () => {
  vi.clearAllMocks();
  clusterCalls.length = 0;
  vi.resetModules();
  const mod = await import('../cluster-config');
  createRedisClusterClient = mod.createRedisClusterClient;
  getRedisClusterClient = mod.getRedisClusterClient;
  getClusterHealth = mod.getClusterHealth;
  closeRedisClusterClient = mod.closeRedisClusterClient;
});

afterEach(async () => {
  await closeRedisClusterClient();
});

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('createRedisClusterClient', () => {
  it('builds a Cluster with 6 default nodes and the configured options', () => {
    const client = createRedisClusterClient();

    expect(clusterCalls).toHaveLength(1);
    const [nodes, options] = clusterCalls[0]!;
    expect(nodes).toHaveLength(6);
    expect(nodes[0]).toEqual({ host: '127.0.0.1', port: 7000 });
    expect(nodes[5]).toEqual({ host: '127.0.0.1', port: 7005 });
    expect((options as { retryDelayOnFailover: number }).retryDelayOnFailover).toBe(500);
    expect((options as { slotsRefreshInterval: number }).slotsRefreshInterval).toBe(300000);
    expect((options as { slotsRefreshTimeout: number }).slotsRefreshTimeout).toBe(2000);
    expect((options as { scaleReads: string }).scaleReads).toBe('slave');
    expect((options as { redisOptions: { connectTimeout: number } }).redisOptions.connectTimeout).toBe(5000);
    expect((options as { redisOptions: { maxRetriesPerRequest: number } }).redisOptions.maxRetriesPerRequest).toBe(10);
    expect((options as { redisOptions: { keepAlive: number } }).redisOptions.keepAlive).toBe(10000);
    expect((options as { redisOptions: { noDelay: boolean } }).redisOptions.noDelay).toBe(true);
    expect(client).toBeInstanceOf(ClusterStub);
  });

  it('attaches an error handler to the new client', () => {
    createRedisClusterClient();
    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('logs debug on each retry attempt with exponential backoff', () => {
    createRedisClusterClient();
    const options = clusterCalls[0]![1] as { clusterRetryStrategy: (times: number) => number };
    // Verify return values
    expect(options.clusterRetryStrategy(0)).toBe(100);
    expect(options.clusterRetryStrategy(1)).toBe(200);
    expect(options.clusterRetryStrategy(2)).toBe(400);
    expect(options.clusterRetryStrategy(3)).toBe(800);
    expect(options.clusterRetryStrategy(4)).toBe(1600);
    expect(options.clusterRetryStrategy(10)).toBe(2000);

    // logger.debug should have been called once per invocation above (6 times)
    expect(mockLogger.debug).toHaveBeenCalledTimes(6);
    expect(mockLogger.debug).toHaveBeenCalledWith('[RedisCluster] Retry attempt 0, delay: 100ms');
  });

  it('logs error message when the client emits an error', () => {
    createRedisClusterClient();
    const handler = mockOn.mock.calls.find((c) => c[0] === 'error')![1] as (err: { message: string }) => void;
    handler({ message: 'boom' });
    expect(mockLogger.error).toHaveBeenCalledWith('[RedisCluster] Error:', { message: 'boom' });
  });

  it('uses REDIS_CLUSTER_HOST / REDIS_CLUSTER_PASSWORD env when set', async () => {
    process.env.REDIS_CLUSTER_HOST = 'cluster.example.com';
    process.env.REDIS_CLUSTER_PASSWORD = 'secret';
    vi.resetModules();
    const mod = await import('../cluster-config');
    mod.createRedisClusterClient();
    const [nodes, options] = clusterCalls[0]!;
    expect((nodes[0] as { host: string }).host).toBe('cluster.example.com');
    expect((options as { redisOptions: { password?: string } }).redisOptions.password).toBe('secret');
    delete process.env.REDIS_CLUSTER_HOST;
    delete process.env.REDIS_CLUSTER_PASSWORD;
  });
});

describe('getRedisClusterClient', () => {
  it('creates and caches the singleton client', () => {
    const first = getRedisClusterClient();
    const second = getRedisClusterClient();
    expect(first).toBe(second);
    expect(clusterCalls).toHaveLength(1);
  });

  it('registers connect / ready / close / clusterError handlers', () => {
    const client = getRedisClusterClient();
    expect(client.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(client.on).toHaveBeenCalledWith('ready', expect.any(Function));
    expect(client.on).toHaveBeenCalledWith('close', expect.any(Function));
    expect(client.on).toHaveBeenCalledWith('clusterError', expect.any(Function));
  });

  it('logs the connect / ready / close events', () => {
    getRedisClusterClient();
    const findHandler = (ev: string) =>
      mockOn.mock.calls.find((c) => c[0] === ev)![1] as () => void;
    (findHandler('connect'))();
    (findHandler('ready'))();
    (findHandler('close'))();
    expect(mockLogger.info).toHaveBeenCalledWith('[RedisCluster] Connected to cluster');
    expect(mockLogger.info).toHaveBeenCalledWith('[RedisCluster] Cluster ready');
    expect(mockLogger.info).toHaveBeenCalledWith('[RedisCluster] Connection closed');
  });

  it('logs clusterError with the error object', () => {
    const client = getRedisClusterClient();
    const handler = mockOn.mock.calls.find((c) => c[0] === 'clusterError')![1] as (err: unknown) => void;
    handler({ code: 'ECONN' });
    expect(mockLogger.error).toHaveBeenCalledWith('[RedisCluster] Cluster error:', { err: { code: 'ECONN' } });
  });
});

describe('getClusterHealth', () => {
  it('parses cluster INFO lines into a healthy result', async () => {
    mockClusterInfo.mockResolvedValueOnce(
      'cluster_state:ok\ncluster_slots_ok:16384\ncluster_known_nodes:6\n',
    );
    const health = await getClusterHealth();
    expect(health.healthy).toBe(true);
    expect(health.slotsOk).toBe(16384);
    expect(health.slotsTotal).toBe(16384);
    expect(health.knownNodes).toBe(6);
    expect(health.state).toBe('ok');
    expect(mockClusterInfo).toHaveBeenCalledWith('INFO');
  });

  it('parses an unhealthy state line', async () => {
    mockClusterInfo.mockResolvedValueOnce(
      'cluster_state:fail\ncluster_slots_ok:0\ncluster_known_nodes:3\n',
    );
    const health = await getClusterHealth();
    expect(health.healthy).toBe(false);
    expect(health.state).toBe('fail');
    expect(health.slotsOk).toBe(0);
    expect(health.knownNodes).toBe(3);
  });

  it('returns unknown defaults when INFO has no recognized lines', async () => {
    mockClusterInfo.mockResolvedValueOnce('some other line\n');
    const health = await getClusterHealth();
    expect(health).toEqual({
      healthy: false,
      slotsOk: 0,
      slotsTotal: 16384,
      knownNodes: 0,
      state: 'unknown',
    });
  });

  it('returns the error shape when cluster() throws', async () => {
    mockClusterInfo.mockRejectedValueOnce(new Error('connection refused'));
    const health = await getClusterHealth();
    expect(health).toEqual({
      healthy: false,
      slotsOk: 0,
      slotsTotal: 16384,
      knownNodes: 0,
      state: 'error',
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[RedisCluster] Health check failed:',
      { error: expect.any(Error) },
    );
  });
});

describe('closeRedisClusterClient', () => {
  it('quits and nulls the cached client', async () => {
    const firstInstance = getRedisClusterClient();
    await closeRedisClusterClient();
    expect(mockQuit).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith('[RedisCluster] Connection closed');
    // singleton was reset, so the next call creates a fresh client
    const fresh = getRedisClusterClient();
    expect(fresh).not.toBe(firstInstance);
    expect(clusterCalls).toHaveLength(2);
  });

  it('no-ops when no client is cached', async () => {
    await closeRedisClusterClient();
    expect(mockQuit).not.toHaveBeenCalled();
    expect(mockLogger.info).not.toHaveBeenCalledWith('[RedisCluster] Connection closed');
  });
});

describe('re-exports', () => {
  it('re-exports the ioredis Cluster class', () => {
    expect(ClusterStub).toBeDefined();
    expect(typeof ClusterStub).toBe('function');
  });
});