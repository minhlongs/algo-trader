/**
 * Worker health-route contract (`/api/health` alias for `/health`).
 */

import { describe, it, expect, vi } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import type { Env } from '../edge-proxy-types';

vi.mock('../../durable-objects', () => ({ ShardManager: class {}, StrategyShard: class {} }));
vi.mock('../auth-handlers', () => ({
  handleSignup: vi.fn(), handleLogin: vi.fn(), handleMe: vi.fn(),
  handleListUsers: vi.fn(), handleSetRole: vi.fn(), handleDeleteUser: vi.fn(),
  notImplementedResponse: (path: string) =>
    new Response(JSON.stringify({ error: 'Not implemented', path }), { status: 501 }),
}));
vi.mock('../api/subscriptions', () => ({
  handleGetMySubscription: vi.fn(), handleUpgrade: vi.fn(), handleCancel: vi.fn(), handleGetTiers: vi.fn(),
}));
vi.mock('../api/webhooks-nowpayments', () => ({ handleNowPaymentsIPN: vi.fn() }));
vi.mock('../coupon-handlers', () => ({
  handleValidateCoupon: vi.fn(), handleApplyCoupon: vi.fn(), handleRedeemCoupon: vi.fn(), handleActivateCoupon: vi.fn(),
}));
vi.mock('../api/version', () => ({ handleVersion: vi.fn() }));
vi.mock('../api/energy-9', () => ({ handleEnergy9Delivery: vi.fn() }));
vi.mock('../api/copilot', () => ({ handleCopilotAsk: vi.fn() }));
vi.mock('../api/telegram-bot', () => ({ handleTelegramWebhook: vi.fn(), handleSetTelegramWebhook: vi.fn() }));
vi.mock('../api/markets', () => ({
  handleGetRing: vi.fn(), handleExecuteStrategy: vi.fn(), handleGetStrategiesList: vi.fn(),
  handleGetMarkets: vi.fn(), handleGetShardById: vi.fn(),
}));
vi.mock('../edge-proxy-regions', () => ({
  getClientRegion: vi.fn(), getCachedRegionHealth: vi.fn(), selectBestRegion: vi.fn(),
  routeToRegion: vi.fn(), updateRegionHealthCache: vi.fn(),
}));
vi.mock('../edge-proxy-metrics', () => ({ handleMetrics: vi.fn(), metricEntry: vi.fn() }));
vi.mock('../paper-trading-entry', () => ({
  initPaperTrading: vi.fn(), runPaperTradingTick: vi.fn(), stopPaperTrading: vi.fn(),
  getPaperTradingStatus: vi.fn(async () => ({ ok: true, enabled: true, killed: false, state: {}, tradeCounter: 0 })),
}));

import worker from '../edge-proxy';

function makeEnv(): Env {
  return {
    CACHE: { get: async () => null, put: async () => undefined, delete: async () => {} } as unknown as KVNamespace,
    SUBSCRIBERS: {
      prepare: (query: string) => ({
        first: async () => {
          if (query.includes('SELECT 1')) return { ready: 1 };
          if (query.includes('subscriptions')) return { id: 's1', user_id: 'u1', status: 'active', tier: 'PRO', created_at: Date.now() };
          if (query.includes('paper_trades_v3')) return { id: 'p1', market_id: 'm1', side: 'BUY', size_usd: 100, entry_price: 0.5, status: 'OPEN', strategy: 's', created_at: Date.now() };
          return null;
        },
      }),
    } as unknown as Env['SUBSCRIBERS'],
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
    expect(res.status).not.toBe(200);
  });

  it('exposes no secret-bearing fields in the health payload', async () => {
    const res = await worker.fetch(get('/api/health'), makeEnv());
    const raw = JSON.stringify(await res.json());
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

    const { createJwt } = await import('../crypto-utils');
    const authEnv = { ...env, JWT_SECRET: 'test-jwt-secret' } as Env;
    const validToken = await createJwt({ sub: 'user@example.com', tenantId: 't1', tier: 'PRO' }, 'test-jwt-secret');

    const cfgReqUnauth = new Request('https://api.cashclaw.cc/api/tenants/t1/config', {
      method: 'POST',
      body: JSON.stringify({ theme: 'dark' }),
    });
    expect((await worker.fetch(cfgReqUnauth, authEnv)).status).toBe(401);

    const cfgReq = new Request('https://api.cashclaw.cc/api/tenants/t1/config', {
      method: 'POST',
      headers: { Authorization: `Bearer ${validToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'dark' }),
    });
    expect((await worker.fetch(cfgReq, authEnv)).status).toBe(200);

    const noD1Env = { ...env, SUBSCRIBERS: undefined } as unknown as Env;
    expect((await worker.fetch(get('/api/v1/paper-trades'), noD1Env)).status).toBe(500);
    const d1Env = {
      ...env,
      SUBSCRIBERS: {
        prepare: () => ({
          all: async () => ({
            results: [
              { id: '1', tokenId: 'tok', side: 'YES', price: 0.5, exit_price: 0.52, size: 10, pnl: 1, strategy: 's', source: 'p', timestamp: 1793580000000, closed_at: 1793580060000 },
              { id: '2', tokenId: 'tok', side: 'NO', price: 0.5, exit_price: null, size: 10, pnl: null, strategy: 's', source: 'p', timestamp: 1793580120000, closed_at: null },
            ],
          }),
        }),
      },
    } as unknown as Env;
    const tradesRes = await worker.fetch(get('/api/v1/paper-trades'), d1Env);
    expect(tradesRes.status).toBe(200);
    const tradesBody = (await tradesRes.json()) as {
      count: number;
      trades: Array<{ id: string; exitPrice: number | null; closedAt: string | null }>;
    };
    expect(tradesBody.count).toBe(2);
    expect(tradesBody.trades[0].exitPrice).toBe(0.52);
    expect(tradesBody.trades[0].closedAt).toBe(new Date(1793580060000).toISOString());
    expect(tradesBody.trades[1].exitPrice).toBeNull();
    expect(tradesBody.trades[1].closedAt).toBeNull();
    expect((await worker.fetch(get('/api/v1/paper-trading/status'), env)).status).toBe(200);
    expect((await worker.fetch(new Request('https://api.cashclaw.cc/api/v1/paper-trading/tick', { method: 'POST' }), env)).status).toBe(200);
    await worker.scheduled({} as ScheduledEvent, env);
  });

  it('routes auth, subscription, webhook, coupon, version, copilot, telegram, market, and region endpoints', async () => {
    const env = makeEnv();
    const post = (p: string) => new Request(`https://api.cashclaw.cc${p}`, { method: 'POST' });
    const del = (p: string) => new Request(`https://api.cashclaw.cc${p}`, { method: 'DELETE' });
    const endpoints = [
      post('/metrics'), post('/api/auth/signup'), post('/api/auth/login'), get('/api/auth/me'),
      get('/api/auth/users'), post('/api/auth/role'), post('/api/auth/delete'), get('/api/v1/subscriptions/me'),
      post('/api/v1/subscriptions/upgrade'), del('/api/v1/subscriptions/cancel'), get('/api/v1/subscriptions/tiers'),
      post('/api/webhooks/nowpayments'), post('/api/coupons/validate'), post('/api/coupons/apply'),
      post('/api/coupons/redeem'), post('/api/coupons/activate'), get('/api/version'), get('/api/delivery/energy-9'),
      post('/api/copilot/ask'), post('/api/telegram/webhook'), post('/api/telegram/set-webhook'),
      get('/api/markets'), get('/api/v1/shard/ring'), get('/api/v1/shard/1/health'),
      post('/api/v1/strategies/execute'), get('/api/v1/strategies/list'),
    ];
    for (const req of endpoints) {
      await worker.fetch(req, env);
    }
    const regionEnv = { ...env, REGION_ROUTING_ENABLED: 'true', VPS_ORIGIN: 'https://vps.example' };
    await worker.fetch(get('/api/markets'), regionEnv);
  });
});
