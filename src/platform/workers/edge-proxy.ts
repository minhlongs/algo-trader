/**
 * Cloudflare Workers Edge Proxy + Standalone Auth
 * When VPS_ORIGIN is set: proxies to backend
 * When not set: handles auth + basic data locally via KV
 */

import { handleSignup, handleLogin, handleMe, handleListUsers, handleSetRole, handleDeleteUser, corsPreflightResponse, notImplementedResponse } from './auth-handlers';
// Durable Object exports for sharding architecture
export { ShardManager, StrategyShard } from '../../durable-objects';

import { getLatencyMonitor, type ProbeResult } from '../../regions/latency-monitor';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import {
  handleGetMySubscription, handleUpgrade, handleCancel, handleGetTiers,
} from './api/subscriptions';
import { handleNowPaymentsIPN } from './api/webhooks-nowpayments';
import { handleValidateCoupon, handleApplyCoupon } from './api/coupons';
import { handleVersion } from './api/version';
import { handleEnergy9Delivery } from './api/energy-9';
import { handleCopilotAsk } from './api/copilot';
import { handleTelegramWebhook, handleSetTelegramWebhook } from './api/telegram-bot';
import { handleGetRing, handleGetShardHealth, handleExecuteStrategy, handleGetStrategiesList, handleGetMarkets, handleGetShardById } from './api/markets';

// Internal loose type — avoid cross-file KV namespace type variance from @cloudflare/workers-types
interface _InternalEnv {
  CACHE: KVNamespace;
  ENVIRONMENT: string;
  VPS_ORIGIN?: string;
  JWT_SECRET: string;
  ALLOWED_ORIGINS?: string;
  REGION_ROUTING_ENABLED?: string;
  SUBSCRIBERS?: D1Database;
  NOWPAYMENTS_IPN_SECRET?: string;
}
// Use loose wrapper to avoid struct-assignment checks between different workers-types version instances
export type Env = _InternalEnv & Record<string, unknown>;

// Reserved: dynamic origin validation for multi-tenant CORS
function _getCorsOrigin(env: Env, origin?: string | null): string {
  const allowed = (env.ALLOWED_ORIGINS || 'https://cashclaw.cc').split(',').map((s: string) => s.trim());
  return origin && allowed.includes(origin) ? origin : allowed[0];
}
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://cashclaw.cc',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

const CACHE_TTL = 60;

// Region configuration
const REGIONS = {
  'us-east': { id: 'us-east', host: 'us-east.algo-trader.workers.dev', priority: 1 },
  'eu-central': { id: 'eu-central', host: 'eu.algo-trader.workers.dev', priority: 2 },
  'ap-southeast': { id: 'ap-southeast', host: 'asia.algo-trader.workers.dev', priority: 3 },
} as const;

type RegionId = keyof typeof REGIONS;

// Region health cache (in KV for cross-edge sharing)
interface RegionHealth {
  region: RegionId;
  healthy: boolean;
  latencyMs: number;
  lastCheck: number;
}

async function getRegionHealth(env: Env): Promise<RegionHealth[]> {
  const cached = await env.CACHE.get('region:health');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // fall through
    }
  }

  // Default health (assume healthy if we can't check)
  const defaultHealth: RegionHealth[] = Object.values(REGIONS).map(r => ({
    region: r.id,
    healthy: true,
    latencyMs: 0,
    lastCheck: Date.now(),
  }));

  await env.CACHE.put('region:health', JSON.stringify(defaultHealth), { expirationTtl: CACHE_TTL });
  return defaultHealth;
}

async function checkRegionHealth(region: RegionId): Promise<{ healthy: boolean; latencyMs: number }> {
  const regionConfig = REGIONS[region];
  const url = `https://${regionConfig.host}/api/health`;

  try {
    const start = Date.now();
    const res = await fetch(url, {
      method: 'GET',
      // Cloudflare-specific cache bypass - works in Workers
      cf: { cacheTtl: 0 } as any,
    });
    const latency = Date.now() - start;

    return {
      healthy: res.status === 200,
      latencyMs: latency,
    };
  } catch (error) {
    return { healthy: false, latencyMs: 0 };
  }
}

function getClientRegion(cf: any): RegionId {
  // Use Cloudflare's IP country code to estimate region
  const country = cf?.country || 'US';

  // Simple country-to-region mapping
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

function selectBestRegion(health: RegionHealth[], clientRegion: RegionId): RegionId {
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

async function routeToRegion(request: Request, targetRegion: RegionId, env: Env): Promise<Response> {
  const regionConfig = REGIONS[targetRegion];
  const url = new URL(request.url);

  // Rewrite host to target region
  url.hostname = regionConfig.host;

  // Add region header for tracing
  const headers = new Headers(request.headers);
  headers.set('X-Routed-Region', targetRegion);

  try {
    const response = await fetch(url.toString(), {
      method: request.method,
      headers,
      body: request.body,
      // Cloudflare-specific cache bypass
      cf: { cacheTtl: 0 } as any,
    });

    return response;
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Region routing failed',
      original: targetRegion,
      message: error instanceof Error ? error.message : String(error),
    }), { status: 503, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') return corsPreflightResponse();

    // Metrics endpoint (Cloudflare Workers Prometheus)
    if (path === '/metrics' && request.method === 'GET') {
      return this.metrics(env);
    }

    // Multi-region routing (only for API requests)
    const routingEnabled = env.REGION_ROUTING_ENABLED !== 'false';
    if (routingEnabled && path.startsWith('/api/') && env.VPS_ORIGIN) {
      // Access Cloudflare-specific properties
      const cf = (request as any).cf as { country?: string } | undefined;
      const clientRegion = getClientRegion(cf);
      const health = await getRegionHealth(env);
      const bestRegion = selectBestRegion(health, clientRegion);

      // If best region is different from this edge's region, route there
      if (bestRegion !== env.ENVIRONMENT) {
        return await routeToRegion(request, bestRegion, env);
      }
    }

 // Root — API info page
 if (path === '/' && request.method === 'GET') {
   return new Response(JSON.stringify({
     service: 'algo-trader API',
     version: '1.0',
     endpoints: ['/api/health', '/api/auth/*'],
     status: 'ok',
     origin: env.VPS_ORIGIN || 'standalone',
   }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
 }

    // Health check
    if (path === '/health' || path === '/api/health') {
      // Region health check endpoint (for latency monitor) - must come first
      // Note: region health is at /api/health/region (more specific check)
      if (path === '/api/health' && url.searchParams.get('region') === 'self') {
        const health = await checkRegionHealth(env.ENVIRONMENT as RegionId);
        return new Response(JSON.stringify({
          region: env.ENVIRONMENT,
          status: health.healthy ? 'healthy' : 'unhealthy',
          latencyMs: health.latencyMs,
          timestamp: new Date().toISOString(),
        }), { headers: CORS });
      }

      return new Response(JSON.stringify({
        status: 'ok', edge: 'cloudflare', environment: env.ENVIRONMENT,
        hasVps: !!env.VPS_ORIGIN, timestamp: new Date().toISOString(),
      }), { headers: CORS });
    }

    // Auth routes — always handled locally (KV-backed)
    if (path === '/api/auth/signup' && request.method === 'POST') return handleSignup(request, env as any);
    if (path === '/api/auth/login' && request.method === 'POST') return handleLogin(request, env as any);
    if (path === '/api/auth/me' && request.method === 'GET') return handleMe(request, env as any);
    if (path === '/api/auth/users' && request.method === 'GET') return handleListUsers(request, env as any);
    if (path === '/api/auth/role' && request.method === 'POST') return handleSetRole(request, env as any);
    if (path === '/api/auth/delete' && request.method === 'POST') return handleDeleteUser(request, env as any);

// CF-only: Subscriptions (D1-backed)
if (path === '/api/v1/subscriptions/me' && request.method === 'GET') return handleGetMySubscription(request, env as any);
if (path === '/api/v1/subscriptions/upgrade' && request.method === 'POST') return handleUpgrade(request, env as any);
if (path === '/api/v1/subscriptions/cancel' && request.method === 'DELETE') return handleCancel(request, env as any);
if (path === '/api/v1/subscriptions/tiers' && request.method === 'GET') return handleGetTiers();

// CF-only: NOWPayments IPN webhook
if (path === '/api/webhooks/nowpayments' && request.method === 'POST') return handleNowPaymentsIPN(request, env as any, env.NOWPAYMENTS_IPN_SECRET);

// CF-only: Coupon service
if (path === '/api/coupons/validate' && request.method === 'POST') return handleValidateCoupon(request, env as any);
if (path === '/api/coupons/apply' && request.method === 'POST') return handleApplyCoupon(request, env as any);

// CF-only: Version endpoint
if (path === '/api/version' && request.method === 'GET') return handleVersion(env as any);
// CF-only: Energy 9 delivery endpoint
if (path === '/api/delivery/energy-9' && request.method === 'POST') return handleEnergy9Delivery(request, env as any);

// ── Phase 2: Telegram + Co-pilot + Markets ──
if (path === '/api/copilot/ask' && request.method === 'POST') return handleCopilotAsk(request, env as any);
if (path === '/api/telegram/webhook' && request.method === 'POST') return handleTelegramWebhook(request, env as any);
if (path === '/api/telegram/set-webhook' && request.method === 'POST') return handleSetTelegramWebhook(request, env as any);

if (path === '/api/markets' && request.method === 'GET') return handleGetMarkets(request, env as any);

if (path === '/api/v1/shard/ring' && request.method === 'GET') return handleGetRing(request, env as any);
if (path.match(/^\/api\/v1\/shard\/\d+\/health$/) && request.method === 'GET') return handleGetShardById(request, env as any);

// Strategy execution (auth required)
if (path === '/api/v1/strategies/execute' && request.method === 'POST') return handleExecuteStrategy(request, env as any);
if (path === '/api/v1/strategies/list' && request.method === 'GET') return handleGetStrategiesList(request, env as any);

// Settings save — store in KV
if (path.match(/^\/api\/tenants\/[^/]+\/config$/) && request.method === 'POST') {
 try {
  const body = await request.json();
  const tenantId = path.split('/')[3];
  await env.CACHE.put(`config:${tenantId}`, JSON.stringify(body));
  return new Response(JSON.stringify({ saved: true }), { headers: CORS });
 } catch {
  return new Response(JSON.stringify({ error: 'Failed to save' }), { status: 500, headers: CORS });
 }
}

// If VPS_ORIGIN is set, proxy remaining API requests

    // If VPS_ORIGIN is set, proxy remaining API requests
    if (env.VPS_ORIGIN && path.startsWith('/api/')) {
      // Webhook routes — no caching
      if (path.startsWith('/api/webhooks/')) return proxyToOrigin(request, env);

      // GET requests — cache at edge
      if (request.method === 'GET') {
        const cacheKey = `cache:${path}:${url.search}`;
        const cached = await env.CACHE.get(cacheKey);
        if (cached) {
          return new Response(cached, { headers: { ...CORS, 'X-Cache': 'HIT' } });
        }
        const response = await proxyToOrigin(request, env);
        if (response.ok) {
          const body = await response.text();
          await env.CACHE.put(cacheKey, body, { expirationTtl: CACHE_TTL });
          return new Response(body, { headers: { ...CORS, 'X-Cache': 'MISS' } });
        }
        return response;
      }

      return proxyToOrigin(request, env);
    }

    // No VPS — return 501 for unhandled API routes
    if (path.startsWith('/api/')) return notImplementedResponse(path);

    // Non-API routes — 404
    return new Response('Not Found', { status: 404 });
  },

  // Metrics endpoint for Cloudflare Workers (Prometheus format)
  async metrics(env: Env): Promise<Response> {
    const health = await getRegionHealth(env);
    const latencyMonitor = getLatencyMonitor();

    const lines: string[] = [];

    // Region health metrics
    for (const h of health) {
      lines.push(`# HELP region_healthy Region health status (1=healthy, 0=unhealthy)`);
      lines.push(`# TYPE region_healthy gauge`);
      lines.push(`region_healthy{region="${h.region}"} ${h.healthy ? 1 : 0}`);

      lines.push(`# HELP region_latency_ms Region p95 latency in milliseconds`);
      lines.push(`# TYPE region_latency_ms gauge`);
      lines.push(`region_latency_ms{region="${h.region}"} ${h.latencyMs.toFixed(2)}`);

      lines.push(`# HELP region_error_rate Region error rate`);
      lines.push(`# TYPE region_error_rate gauge`);
      // Get error rate from latency monitor
      const monitorHealth = latencyMonitor.getHealth(h.region)[0];
      lines.push(`region_error_rate{region="${h.region}"} ${monitorHealth?.errorRate || 0}`);
    }

    // Probes total
    lines.push(`# HELP region_probes_total Total number of latency probes`);
    lines.push(`# TYPE region_probes_total counter`);
    for (const region of ['us-east', 'eu-central', 'ap-southeast']) {
      const count = latencyMonitor.getResults().filter((r: ProbeResult) => r.region === region).length;
      lines.push(`region_probes_total{region="${region}"} ${count}`);
    }

    // Worker info
    lines.push(`# HELP edge_proxy_info Edge proxy information`);
    lines.push(`# TYPE edge_proxy_info gauge`);
    lines.push(`edge_proxy_info{region="${env.ENVIRONMENT}",routing_enabled="${env.REGION_ROUTING_ENABLED || 'true'}"} 1`);

    return new Response(lines.join('\n') + '\n', {
      headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
    });
  },
};

async function proxyToOrigin(request: Request, env: Env): Promise<Response> {
  const origin = env.VPS_ORIGIN!;
  const url = new URL(request.url);
  const target = new URL(origin);
  url.protocol = target.protocol;
  url.host = target.host;
  url.port = target.port;

  return fetch(url.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
  });
}
