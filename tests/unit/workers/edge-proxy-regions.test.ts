import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  probeAllRegions,
  getCachedRegionHealth,
  updateRegionHealthCache,
  getClientRegion,
  selectBestRegion,
  routeToRegion,
} from '../../../src/platform/workers/edge-proxy-regions';
import type { Env, CloudflareCf } from '../../../src/platform/workers/edge-proxy-types';
import type { RegionHealth } from '../../../src/platform/workers/edge-proxy-regions';

describe('edge-proxy-regions', () => {
  const mockEnv = {
    ENVIRONMENT: 'production',
    CACHE: {
      get: vi.fn(),
      put: vi.fn(),
    },
  } as unknown as Env;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('probeAllRegions should return health status for all regions including failures', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return new Response(null, { status: 200 });
      if (callCount === 2) return new Response(null, { status: 500 });
      throw new Error('Network timeout');
    });

    const health = await probeAllRegions(mockEnv);
    expect(health.length).toBe(3);
    expect(health[0].healthy).toBe(true);
    expect(health[1].healthy).toBe(false);
    expect(health[2].healthy).toBe(false);
    expect(health[2].latencyMs).toBe(0);
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

  it('updateRegionHealthCache should probe and put in cache', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await updateRegionHealthCache(mockEnv);
    expect(mockEnv.CACHE.put).toHaveBeenCalledWith(
      'region:health:status',
      expect.any(String),
      { expirationTtl: 300 }
    );
  });

  describe('getClientRegion', () => {
    it('maps known and fallback countries correctly', () => {
      expect(getClientRegion(undefined)).toBe('us-east');
      expect(getClientRegion({} as CloudflareCf)).toBe('us-east');
      expect(getClientRegion({ country: 'CA' } as CloudflareCf)).toBe('us-east');
      expect(getClientRegion({ country: 'GB' } as CloudflareCf)).toBe('eu-central');
      expect(getClientRegion({ country: 'DE' } as CloudflareCf)).toBe('eu-central');
      expect(getClientRegion({ country: 'FR' } as CloudflareCf)).toBe('eu-central');
      expect(getClientRegion({ country: 'IE' } as CloudflareCf)).toBe('eu-central');
      expect(getClientRegion({ country: 'NL' } as CloudflareCf)).toBe('eu-central');
      expect(getClientRegion({ country: 'JP' } as CloudflareCf)).toBe('ap-southeast');
      expect(getClientRegion({ country: 'SG' } as CloudflareCf)).toBe('ap-southeast');
      expect(getClientRegion({ country: 'AU' } as CloudflareCf)).toBe('ap-southeast');
      expect(getClientRegion({ country: 'NZ' } as CloudflareCf)).toBe('ap-southeast');
      expect(getClientRegion({ country: 'IN' } as CloudflareCf)).toBe('ap-southeast');
      expect(getClientRegion({ country: 'BR' } as CloudflareCf)).toBe('us-east');
    });
  });

  describe('selectBestRegion', () => {
    it('returns client region if healthy', () => {
      const health: RegionHealth[] = [
        { region: 'us-east', healthy: true, latencyMs: 20 },
        { region: 'eu-central', healthy: true, latencyMs: 50 },
      ];
      expect(selectBestRegion(health, 'eu-central')).toBe('eu-central');
    });

    it('falls back to us-east when no regions are healthy', () => {
      const health: RegionHealth[] = [
        { region: 'us-east', healthy: false, latencyMs: 0 },
        { region: 'eu-central', healthy: false, latencyMs: 0 },
      ];
      expect(selectBestRegion(health, 'eu-central')).toBe('us-east');
    });

    it('selects nearest healthy region by priority order', () => {
      const health: RegionHealth[] = [
        { region: 'us-east', healthy: false, latencyMs: 0 },
        { region: 'eu-central', healthy: true, latencyMs: 40 },
        { region: 'ap-southeast', healthy: true, latencyMs: 80 },
      ];
      expect(selectBestRegion(health, 'us-east')).toBe('eu-central');
    });

    it('selects first healthy region if priority does not match', () => {
      const health: RegionHealth[] = [
        { region: 'ap-southeast', healthy: true, latencyMs: 80 },
      ];
      expect(selectBestRegion(health, 'eu-central')).toBe('ap-southeast');
    });
  });

  describe('routeToRegion', () => {
    it('routes GET request rewriting host and adding headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));
      global.fetch = mockFetch;

      const req = new Request('https://original.com/api/orders', { method: 'GET' });
      const res = await routeToRegion(req, 'eu-central', mockEnv);
      expect(res.status).toBe(200);

      const [calledUrl, calledInit] = mockFetch.mock.calls[0];
      expect(calledUrl).toContain('eu.algo-trader.workers.dev');
      expect(calledInit.method).toBe('GET');
      expect(calledInit.body).toBeUndefined();
    });

    it('routes POST request forwarding body', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('CREATED', { status: 201 }));
      global.fetch = mockFetch;

      const req = new Request('https://original.com/api/orders', {
        method: 'POST',
        body: JSON.stringify({ item: 'x' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await routeToRegion(req, 'us-east', mockEnv);
      expect(res.status).toBe(201);
    });

    it('returns 503 response when routing fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const req = new Request('https://original.com/api/orders', { method: 'GET' });
      const res = await routeToRegion(req, 'ap-southeast', mockEnv);
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toBe('Region routing failed');
      expect(data.message).toBe('Connection refused');
    });
  });
});
