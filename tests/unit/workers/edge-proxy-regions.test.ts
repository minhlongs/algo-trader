import { describe, it, expect, vi, beforeEach } from 'vitest';
import { probeAllRegions, getCachedRegionHealth } from '../../../src/platform/workers/edge-proxy-regions';
import type { Env } from '../../../src/platform/workers/edge-proxy-types';
import type { RegionHealth } from '../../../src/platform/workers/edge-proxy-regions';

describe('edge-proxy-regions', () => {
  const mockEnv = {
    CACHE: {
      get: vi.fn(),
      put: vi.fn(),
    },
  } as unknown as Env;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('probeAllRegions should return health status for all regions', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const health = await probeAllRegions(mockEnv);
    expect(health.length).toBeGreaterThan(0);
    expect(health[0]).toHaveProperty('healthy');
  });

  it('getCachedRegionHealth should return cached status if available', async () => {
    const mockHealth: RegionHealth[] = [{ region: 'us-east', healthy: true, latencyMs: 10 }];
    vi.mocked(mockEnv.CACHE.get).mockResolvedValue(mockHealth as unknown as string);

    const health = await getCachedRegionHealth(mockEnv);
    expect(health).toEqual(mockHealth);
  });

  it('getCachedRegionHealth should return default healthy if cache is cold', async () => {
    vi.mocked(mockEnv.CACHE.get).mockResolvedValue(null);

    const health = await getCachedRegionHealth(mockEnv);
    expect(health.length).toBeGreaterThan(0);
    expect(health[0].healthy).toBe(true);
  });
});
