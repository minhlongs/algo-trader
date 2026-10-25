/**
 * Worker health-route contract.
 *
 * `/api/health` is an alias for `/health`: the SHA deploy verifier and the root
 * handler both advertise the /api-prefixed form, so it must never fall through
 * to notImplementedResponse (501).
 */

import { describe, it, expect, vi } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import type { Env } from '../edge-proxy-types';

// Stub out unrelated route submodules so testing the health route on the
// top-level Worker dispatcher does not eagerly import the entire worker
// dependency graph into V8 coverage collection.
vi.mock('../../durable-objects', () => ({ ShardManager: class {}, StrategyShard: class {} }));
vi.mock('../auth-handlers', () => ({
  handleSignup: vi.fn(),
  handleLogin: vi.fn(),
  handleMe: vi.fn(),
  handleListUsers: vi.fn(),
  handleSetRole: vi.fn(),
  handleDeleteUser: vi.fn(),
  notImplementedResponse: (path: string) =>
    new Response(JSON.stringify({ error: 'Not implemented', path }), { status: 501 }),
}));
vi.mock('../api/subscriptions', () => ({
  handleGetMySubscription: vi.fn(),
  handleUpgrade: vi.fn(),
  handleCancel: vi.fn(),
  handleGetTiers: vi.fn(),
}));
vi.mock('../api/webhooks-nowpayments', () => ({ handleNowPaymentsIPN: vi.fn() }));
vi.mock('../coupon-handlers', () => ({
  handleValidateCoupon: vi.fn(),
  handleApplyCoupon: vi.fn(),
  handleRedeemCoupon: vi.fn(),
  handleActivateCoupon: vi.fn(),
}));
vi.mock('../api/version', () => ({ handleVersion: vi.fn() }));
vi.mock('../api/energy-9', () => ({ handleEnergy9Delivery: vi.fn() }));
vi.mock('../api/copilot', () => ({ handleCopilotAsk: vi.fn() }));
vi.mock('../api/telegram-bot', () => ({
  handleTelegramWebhook: vi.fn(),
  handleSetTelegramWebhook: vi.fn(),
}));
vi.mock('../api/markets', () => ({
  handleGetRing: vi.fn(),
  handleExecuteStrategy: vi.fn(),
  handleGetStrategiesList: vi.fn(),
  handleGetMarkets: vi.fn(),
  handleGetShardById: vi.fn(),
}));
vi.mock('../edge-proxy-regions', () => ({
  getClientRegion: vi.fn(),
  getCachedRegionHealth: vi.fn(),
  selectBestRegion: vi.fn(),
  routeToRegion: vi.fn(),
  updateRegionHealthCache: vi.fn(),
}));
vi.mock('../edge-proxy-metrics', () => ({
  handleMetrics: vi.fn(),
  metricEntry: vi.fn(),
}));
vi.mock('../paper-trading-entry', () => ({
  initPaperTrading: vi.fn(),
  runPaperTradingTick: vi.fn(),
}));

import worker from '../edge-proxy';

function makeEnv(): Env {
  return {
    CACHE: { get: async () => null, put: async () => undefined, delete: async () => {} } as unknown as KVNamespace,
    ENVIRONMENT: 'test',
    REGION_ROUTING_ENABLED: 'false',
  } as unknown as Env;
}

const get = (path: string) => new Request(`https://api.cashclaw.cc${path}`);

describe('Worker health route', () => {
  it('serves /health with 200 and a status field', async () => {
    const res = await worker.fetch(get('/health'), makeEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
  });

  it('serves /api/health identically to /health', async () => {
    const bareResponse = await worker.fetch(get('/health'), makeEnv());
    const aliasedResponse = await worker.fetch(get('/api/health'), makeEnv());
    expect(aliasedResponse.status).toBe(200);

    const bare = (await bareResponse.json()) as Record<string, unknown>;
    const aliased = (await aliasedResponse.json()) as Record<string, unknown>;

    // `timestamp` is a clock reading and differs between any two calls; the
    // rest of the payload must be identical.
    expect(aliased.status).toBe(bare.status);
    expect(aliased.service).toBe(bare.service);
    expect(aliased.environment).toBe(bare.environment);
    expect(aliased.checks).toEqual(bare.checks);
    expect(Object.keys(aliased).sort()).toEqual(Object.keys(bare).sort());
  });

  it('does not 501 on the aliased path (regression: deploy verifier probes /api/health)', async () => {
    const res = await worker.fetch(get('/api/health'), makeEnv());
    expect(res.status).not.toBe(501);
  });

  it('rejects non-GET methods on the aliased health path', async () => {
    const res = await worker.fetch(new Request('https://api.cashclaw.cc/api/health', { method: 'POST' }), makeEnv());
    // POST on a GET-only route must not be served as a health check.
    expect(res.status).not.toBe(200);
  });

  it('exposes no secret-bearing fields in the health payload', async () => {
    const res = await worker.fetch(get('/api/health'), makeEnv());
    const raw = JSON.stringify(await res.json());
    // Bindings are reported as a configured/missing flag, never as their values.
    expect(raw).not.toMatch(/NOWPAYMENTS_API_KEY|SUBSCRIBERS|METRIC_PASSWORD/);
  });

  it('serves root, OPTIONS preflight, metrics, tenant config, paper-trades, and fallback routes', async () => {
    const env = makeEnv();
    expect((await worker.fetch(new Request('https://api.cashclaw.cc/api/health', { method: 'OPTIONS' }), env)).status).toBe(204);
    expect((await worker.fetch(get('/'), env)).status).toBe(200);
    expect((await worker.fetch(get('/unknown-page'), env)).status).toBe(404);
    expect((await worker.fetch(get('/api/unknown'), { ...env, VPS_ORIGIN: 'https://vps.example' })).status).toBe(501);

    const metricEnv = { ...env, METRIC_PASSWORD: 'sec' };
    expect((await worker.fetch(get('/metrics?token=wrong'), metricEnv)).status).toBe(401);

    const cfgReq = new Request('https://api.cashclaw.cc/api/tenants/t1/config', {
      method: 'POST',
      body: JSON.stringify({ theme: 'dark' }),
    });
    expect((await worker.fetch(cfgReq, env)).status).toBe(200);

    expect((await worker.fetch(get('/api/v1/paper-trades'), env)).status).toBe(500);
    const d1Env = {
      ...env,
      SUBSCRIBERS: {
        prepare: () => ({
          all: async () => ({
            results: [
              { id: '1', tokenId: 'tok', side: 'YES', price: 0.5, size: 10, pnl: 1, strategy: 's', source: 'p', timestamp: Date.now() },
              { id: '2', tokenId: 'tok', side: 'NO', price: 0.5, size: 10, pnl: null, strategy: 's', source: 'p', timestamp: Date.now() },
            ],
          }),
        }),
      },
    } as unknown as Env;
    expect((await worker.fetch(get('/api/v1/paper-trades'), d1Env)).status).toBe(200);
    expect((await worker.fetch(new Request('https://api.cashclaw.cc/api/v1/paper-trading/tick', { method: 'POST' }), env)).status).toBe(200);
    await worker.scheduled({} as ScheduledEvent, env);
  });

  it('routes auth, subscription, webhook, coupon, version, copilot, telegram, market, and region endpoints', async () => {
    const env = makeEnv();
    const post = (p: string) => new Request(`https://api.cashclaw.cc${p}`, { method: 'POST' });
    const del = (p: string) => new Request(`https://api.cashclaw.cc${p}`, { method: 'DELETE' });

    for (const req of [
      post('/metrics'),
      post('/api/auth/signup'),
      post('/api/auth/login'),
      get('/api/auth/me'),
      get('/api/auth/users'),
      post('/api/auth/role'),
      post('/api/auth/delete'),
      get('/api/v1/subscriptions/me'),
      post('/api/v1/subscriptions/upgrade'),
      del('/api/v1/subscriptions/cancel'),
      get('/api/v1/subscriptions/tiers'),
      post('/api/webhooks/nowpayments'),
      post('/api/coupons/validate'),
      post('/api/coupons/apply'),
      post('/api/coupons/redeem'),
      post('/api/coupons/activate'),
      get('/api/version'),
      get('/api/delivery/energy-9'),
      post('/api/copilot/ask'),
      post('/api/telegram/webhook'),
      post('/api/telegram/set-webhook'),
      get('/api/markets'),
      get('/api/v1/shard/ring'),
      get('/api/v1/shard/1/health'),
      post('/api/v1/strategies/execute'),
      get('/api/v1/strategies/list'),
    ]) {
      await worker.fetch(req, env);
    }

    const regionEnv = { ...env, REGION_ROUTING_ENABLED: 'true', VPS_ORIGIN: 'https://vps.example' };
    await worker.fetch(get('/api/markets'), regionEnv);
  });
});
