/**
 * Multi-region health checks and routing logic.
 * Determines the best region for incoming requests based on
 * client location and region health status.
 */

import type { Env, CloudflareCf } from './edge-proxy-types';
import { REGIONS, type RegionId, CORS } from './edge-proxy-constants';

/** Health status for a single region */
export interface RegionHealth {
  region: RegionId;
  healthy: boolean;
  latencyMs: number;
}

/** Probe all regions for health and latency */
export async function getRegionHealth(env: Env): Promise<RegionHealth[]> {
  const regions = Object.keys(REGIONS) as RegionId[];
  const results: RegionHealth[] = [];

  for (const region of regions) {
    try {
      const start = Date.now();
      const res = await fetch(`https://${REGIONS[region].host}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      } as RequestInit & { cf: { cacheTtl: number } });
      const latency = Date.now() - start;

      results.push({
        region,
        healthy: res.status === 200,
        latencyMs: latency,
      });
    } catch {
      results.push({ region, healthy: false, latencyMs: 0 });
    }
  }

  return results;
}

/** Map Cloudflare IP country code to nearest region */
export function getClientRegion(cf: CloudflareCf | undefined): RegionId {
  const country = cf?.country || 'US';

  const regionMap: Record<string, RegionId> = {
    'US': 'us-east',
    'CA': 'us-east',
    'GB': 'eu-central',
    'DE': 'eu-central',
    'FR': 'eu-central',
    'IE': 'eu-central',
    'NL': 'eu-central',
    'JP': 'ap-southeast',
    'SG': 'ap-southeast',
    'AU': 'ap-southeast',
    'NZ': 'ap-southeast',
    'IN': 'ap-southeast',
  };

  return regionMap[country] || 'us-east';
}

/** Select the best region: prefer client's own if healthy, else nearest healthy */
export function selectBestRegion(health: RegionHealth[], clientRegion: RegionId): RegionId {
  // Prefer client's own region if healthy
  const clientHealth = health.find(h => h.region === clientRegion);
  if (clientHealth?.healthy) {
    return clientRegion;
  }

  // Otherwise, find nearest healthy region by priority
  const healthyRegions = health.filter(h => h.healthy);
  if (healthyRegions.length === 0) {
    return 'us-east'; // fallback
  }

  // Sort by priority (lower = closer to client)
  const priorityOrder: RegionId[] = ['us-east', 'eu-central', 'ap-southeast'];
  for (const priority of priorityOrder) {
    if (healthyRegions.some(h => h.region === priority)) {
      return priority;
    }
  }

  return healthyRegions[0].region;
}

/** Proxy the request to a target region's worker */
export async function routeToRegion(request: Request, targetRegion: RegionId, env: Env): Promise<Response> {
  const regionConfig = REGIONS[targetRegion];
  const url = new URL(request.url);

  // Rewrite host to target region
  url.hostname = regionConfig.host;

  // Add region header for tracing
  const headers = new Headers(request.headers);
  headers.set('X-Forwarded-Region', env.ENVIRONMENT);

  try {
    return await fetch(url.toString(), {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Region routing failed',
      original: targetRegion,
      message: error instanceof Error ? error.message : String(error),
    }), { status: 503, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
}
