/**
 * Unit tests for api-stats Worker handler.
 * Uses vitest mocks for D1 and KV.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleStats } from '../api-stats';

// Mock types
const mockD1Result = {
  results: [
    {
      trades: 10,
      batches: 2,
      edge_avg_pct: 5.5,
      actionable_pct: 60,
    },
  ],
};

const mockEmptyResult = {
  results: [{}],
};

function createMockEnv(d1AllReturn: Record<string, unknown> = mockD1Result) {
  const cache = {
    get: vi.fn(),
    put: vi.fn().mockResolvedValue(undefined),
  } as any;
  const db = {
    prepare: vi.fn().mockReturnValue({
      all: vi.fn().mockResolvedValue(d1AllReturn),
    }),
  } as any;
  return { STATS_DB: db, CACHE: cache } as any;
}

describe('handleStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns aggregated stats from D1 when data exists', async () => {
    const env = createMockEnv(mockD1Result);
    const response = await handleStats(env);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    const data = await response.json();

    expect(data.trades).toBe(10);
    expect(data.batches).toBe(2);
    expect(data.edge_avg_pct).toBe(5.5);
    expect(data.actionable_pct).toBe(60);
    expect(data.source).toBe('d1');
    expect(data.note).toContain('Live mirror');
  });

  it('returns empty stats when D1 has no trades', async () => {
    // Simulate COUNT(*) = 0, other aggregates NULL -> row.trades = 0
    const emptyResult = {
      results: [
        {
          trades: 0,
          batches: 0,
          edge_avg_pct: null,
          actionable_pct: null,
        },
      ],
    };
    const env = createMockEnv(emptyResult);
    const response = await handleStats(env);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.trades).toBe(0);
    expect(data.batches).toBe(0);
    expect(data.edge_avg_pct).toBe(0);
    expect(data.actionable_pct).toBe(0);
    expect(data.source).toBe('d1-empty');
  });

  it('uses KV cache on subsequent calls', async () => {
    const env = createMockEnv(mockD1Result);
    // First call: cache miss (get returns null), second: cache hit (returns cached)
    env.CACHE.get = vi.fn()
      .mockReturnValueOnce(null) // first call: miss
      .mockReturnValueOnce(JSON.stringify(mockD1Result.results[0])); // second call: hit

    const response1 = await handleStats(env);
    expect(response1.headers.get('X-Cache')).toBe('MISS');
    // On first call, DB should be queried and cache.put should be called
    expect(env.STATS_DB.prepare).toHaveBeenCalledTimes(1);
    expect(env.CACHE.put).toHaveBeenCalled();

    const response2 = await handleStats(env);
    expect(response2.headers.get('X-Cache')).toBe('HIT');
    // Second call should not query DB again
    expect(env.STATS_DB.prepare).toHaveBeenCalledTimes(1); // still 1
  });
});
