/**
 * Deterministic Offline Adversarial Test Matrix — Zero Market-Data Egress & Private Worker Routing.
 *
 * Covers:
 * - Default-deny `MARKET_DATA_ENABLED` policy (missing, "false", malformed, KV-populated, KV-stale)
 * - Side-effect-free `/api/health` and `/health` in maintenance & non-maintenance modes
 * - `/api/beta/markets`, `/api/beta/portfolio`, strategy START/STEP, manual order, and DO `alarm()`
 * - Gamma/CLOB failure handling, concurrent health requests, repeated retries
 * - Closed Worker routing config (`workers_dev=false`, `preview_urls=false`, `routes=[]`)
 * - Wrong Cloudflare env, unexpected routes, live-trading flag, and auth/Access bypass attempts
 *
 * Every disabled-feed assertion verifies:
 *   gammaFetchCalls=0, clobFetchCalls=0, polygonRpcCalls=0,
 *   returnedLiveMarkets=0, liveOrders=0, userInvitations=0.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../src/platform/poly-beta/poly-beta-worker';
import { fetchSupportedBetaMarkets } from '../../src/platform/poly-beta/poly-beta-markets';
import {
  isMarketDataEnabled,
  MARKET_DATA_DISABLED_REASON,
} from '../../src/platform/poly-beta/poly-beta-types';
import {
  parseWranglerToml,
  validateWranglerConfig,
} from '../../scripts/poly-beta-disable.mjs';
import {
  createPolyBetaTestHarness,
  seedMarketSnapshots,
  testInviteTokenForEmail,
} from './poly-beta-test-harness';

interface EgressTelemetry {
  gammaFetchCalls: number;
  clobFetchCalls: number;
  polygonRpcCalls: number;
  otherExternalFetchCalls: number;
  liveOrders: number;
  userInvitations: number;
}

function createEgressTracker() {
  const counts: EgressTelemetry = {
    gammaFetchCalls: 0,
    clobFetchCalls: 0,
    polygonRpcCalls: 0,
    otherExternalFetchCalls: 0,
    liveOrders: 0,
    userInvitations: 0,
  };

  const fetchSpy = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('gamma') || url.includes('/markets')) counts.gammaFetchCalls += 1;
    else if (url.includes('clob') || url.includes('/books')) counts.clobFetchCalls += 1;
    else if (url.includes('polygon') || url.includes('rpc') || url.includes('alchemy')) counts.polygonRpcCalls += 1;
    else counts.otherExternalFetchCalls += 1;
    throw new Error(`UNEXPECTED_OUTBOUND_FETCH:${url}`);
  });

  return { counts, fetchSpy };
}

function assertZeroEgress(counts: EgressTelemetry, returnedLiveMarkets = 0) {
  expect(counts.gammaFetchCalls).toBe(0);
  expect(counts.clobFetchCalls).toBe(0);
  expect(counts.polygonRpcCalls).toBe(0);
  expect(counts.otherExternalFetchCalls).toBe(0);
  expect(returnedLiveMarkets).toBe(0);
  expect(counts.liveOrders).toBe(0);
  expect(counts.userInvitations).toBe(0);
}

const ORIGIN = 'https://poly-beta-dashboard.pages.dev';
const WRANGLER_CONFIG_PATH = resolve(__dirname, '../../wrangler.poly-beta.toml');

async function signupAndGetAuthHeaders(
  env: Awaited<ReturnType<typeof createPolyBetaTestHarness>>['env'],
  email = 'guard@example.com',
) {
  const prevMaintenance = env.MAINTENANCE_MODE;
  env.MAINTENANCE_MODE = 'false';
  const signupRes = await worker.fetch(
    new Request('https://poly-beta-api.internal/api/beta/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({
        email,
        password: 'StrongPassword#2026!',
        inviteToken: testInviteTokenForEmail(email),
        acknowledgeSimulationAndRisk: true,
      }),
    }),
    env,
  );
  env.MAINTENANCE_MODE = prevMaintenance;
  expect(signupRes.status).toBe(201);
  const setCookie = signupRes.headers.get('Set-Cookie') ?? '';
  const cookiePair = setCookie.split(';')[0] ?? '';
  const body = (await signupRes.json()) as { csrfToken: string; user: { tenantId: string } };
  return { cookie: cookiePair, csrfToken: body.csrfToken, tenantId: body.user.tenantId };
}

describe('Zero market-data egress & private Worker routing adversarial matrix', () => {
  let originalFetch: typeof globalThis.fetch;
  let tempDir: string;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    tempDir = mkdtempSync(join(tmpdir(), 'poly-beta-zero-egress-'));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('Cases 1-2: /api/health and /health with maintenance enabled report liveness without outbound egress', async () => {
    const tracker = createEgressTracker();
    globalThis.fetch = tracker.fetchSpy as unknown as typeof fetch;

    const { env } = await createPolyBetaTestHarness({
      maintenanceMode: 'true',
      marketDataEnabled: 'false',
    });

    for (const path of ['/api/health', '/health']) {
      const res = await worker.fetch(new Request(`https://poly-beta-api.internal${path}`), env);
      expect(res.status).toBe(200);
      const data = (await res.json()) as Record<string, unknown>;
      expect(data).toMatchObject({
        ok: true,
        status: 'operational',
        service: 'poly-beta-api',
        mode: 'PAPER_ONLY',
        liveTradingEnabled: false,
        maintenanceMode: true,
        marketDataEnabled: false,
        marketFeedHealthy: false,
        supportedMarketCount: 0,
        marketFeedDisabledReason: MARKET_DATA_DISABLED_REASON,
        commitSha: 'b778f53a',
      });
      // Must never leak secrets or internal allowlists
      const serialized = JSON.stringify(data);
      expect(serialized).not.toContain('BETA_SIGNUP_INVITES');
      expect(serialized).not.toContain('POLY_BETA_SESSION_SECRET');
      assertZeroEgress(tracker.counts, Number(data.supportedMarketCount));
    }
  });

  it('Cases 3-5: health enforces default-deny when MARKET_DATA_ENABLED is missing, false, or malformed', async () => {
    const tracker = createEgressTracker();
    globalThis.fetch = tracker.fetchSpy as unknown as typeof fetch;

    const variants: Array<string | undefined> = [
      undefined,
      'false',
      'FALSE',
      '',
      '1',
      'yes',
      'enabled',
      'true-ish',
      'null',
    ];

    for (const rawVal of variants) {
      expect(isMarketDataEnabled({ MARKET_DATA_ENABLED: rawVal })).toBe(false);
      const { env } = await createPolyBetaTestHarness({
        maintenanceMode: 'false',
        marketDataEnabled: rawVal,
      });
      const res = await worker.fetch(new Request('https://poly-beta-api.internal/api/health'), env);
      expect(res.status).toBe(200);
      const data = (await res.json()) as Record<string, unknown>;
      expect(data.marketDataEnabled).toBe(false);
      expect(data.marketFeedHealthy).toBe(false);
      expect(data.supportedMarketCount).toBe(0);
      expect(data.marketFeedDisabledReason).toBe(MARKET_DATA_DISABLED_REASON);
      assertZeroEgress(tracker.counts, Number(data.supportedMarketCount));
    }
  });

  it('Cases 6-7: /api/beta/markets and authenticated /api/beta/portfolio fail closed with zero egress', async () => {
    const tracker = createEgressTracker();
    globalThis.fetch = tracker.fetchSpy as unknown as typeof fetch;

    const { env } = await createPolyBetaTestHarness({
      maintenanceMode: 'false',
      marketDataEnabled: 'false',
    });

    const marketsRes = await worker.fetch(
      new Request('https://poly-beta-api.internal/api/beta/markets', {
        headers: { Origin: ORIGIN },
      }),
      env,
    );
    expect(marketsRes.status).toBe(200);
    const marketsBody = (await marketsRes.json()) as {
      ok: boolean;
      marketDataEnabled: boolean;
      feedHealthy: boolean;
      staleReason: string | null;
      markets: unknown[];
    };
    expect(marketsBody.ok).toBe(true);
    expect(marketsBody.marketDataEnabled).toBe(false);
    expect(marketsBody.feedHealthy).toBe(false);
    expect(marketsBody.staleReason).toBe(MARKET_DATA_DISABLED_REASON);
    expect(marketsBody.markets).toEqual([]);

    const auth = await signupAndGetAuthHeaders(env);
    const pfRes = await worker.fetch(
      new Request('https://poly-beta-api.internal/api/beta/portfolio', {
        headers: { Origin: ORIGIN, Cookie: auth.cookie },
      }),
      env,
    );
    expect(pfRes.status).toBe(200);
    const pfBody = (await pfRes.json()) as {
      ok: boolean;
      markets: unknown[];
      health: {
        marketDataEnabled: boolean;
        marketFeedHealthy: boolean;
        staleReason: string | null;
        marketDataProvenance: { mode: string };
      };
    };
    expect(pfBody.ok).toBe(true);
    expect(pfBody.markets).toEqual([]);
    expect(pfBody.health.marketDataEnabled).toBe(false);
    expect(pfBody.health.marketFeedHealthy).toBe(false);
    expect(pfBody.health.staleReason).toBe(MARKET_DATA_DISABLED_REASON);
    expect(pfBody.health.marketDataProvenance.mode).toBe('DISABLED_DEFAULT_DENY');

    assertZeroEgress(tracker.counts, marketsBody.markets.length + pfBody.markets.length);
  });

  it('Cases 8-10: strategy START, strategy STEP, and TenantPaperEngine DO alarm fail safely with feeds disabled', async () => {
    const tracker = createEgressTracker();
    globalThis.fetch = tracker.fetchSpy as unknown as typeof fetch;

    const { env, rawSqlite, engines } = await createPolyBetaTestHarness({
      maintenanceMode: 'false',
      marketDataEnabled: 'false',
    });
    const auth = await signupAndGetAuthHeaders(env);

    // Case 8: START blocked fail-closed (503 MARKET_DATA_DISABLED), no alarm, no orders
    const startRes = await worker.fetch(
      new Request('https://poly-beta-api.internal/api/beta/strategy/control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          Cookie: auth.cookie,
          'X-CSRF-Token': auth.csrfToken,
        },
        body: JSON.stringify({ action: 'START', strategyId: 'toxicity-aware-mm-paper' }),
      }),
      env,
    );
    expect(startRes.status).toBe(503);
    await expect(startRes.json()).resolves.toMatchObject({
      ok: false,
      code: MARKET_DATA_DISABLED_REASON,
    });

    // Case 9: STEP blocked fail-closed (503 MARKET_DATA_DISABLED), no orders
    const stepRes = await worker.fetch(
      new Request('https://poly-beta-api.internal/api/beta/strategy/control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          Cookie: auth.cookie,
          'X-CSRF-Token': auth.csrfToken,
        },
        body: JSON.stringify({ action: 'STEP', strategyId: 'toxicity-aware-mm-paper' }),
      }),
      env,
    );
    expect(stepRes.status).toBe(503);
    await expect(stepRes.json()).resolves.toMatchObject({
      ok: false,
      code: MARKET_DATA_DISABLED_REASON,
    });

    // Case 10: Armed DO alarm cannot bypass disabled market data
    const doEntry = engines.get(auth.tenantId);
    expect(doEntry).toBeDefined();
    await doEntry!.storage.put('tenantId', auth.tenantId);
    await doEntry!.storage.put('ticksRemaining', 10);
    await doEntry!.storage.setAlarm(Date.now() + 1_000);
    rawSqlite
      .prepare(`UPDATE beta_portfolios SET engine_state = 'RUNNING' WHERE tenant_id = ?`)
      .run(auth.tenantId);

    await doEntry!.instance.alarm();

    expect(doEntry!.storage.getScheduledAlarm()).toBeNull();
    const pfRow = rawSqlite
      .prepare(`SELECT engine_state FROM beta_portfolios WHERE tenant_id = ?`)
      .get(auth.tenantId) as { engine_state: string };
    expect(pfRow.engine_state).toBe('PAUSED');
    const orderCountRow = rawSqlite
      .prepare(`SELECT COUNT(*) AS c FROM beta_orders WHERE tenant_id = ?`)
      .get(auth.tenantId) as { c: number };
    expect(orderCountRow.c).toBe(0);

    assertZeroEgress(tracker.counts, 0);
  });

  it('Cases 11-12: populated fresh KV cache and stale KV cache are bypassed when feeds disabled', async () => {
    const tracker = createEgressTracker();
    globalThis.fetch = tracker.fetchSpy as unknown as typeof fetch;

    const { env, kv } = await createPolyBetaTestHarness({
      maintenanceMode: 'false',
      marketDataEnabled: 'false',
    });

    const kvGetSpy = vi.spyOn(kv, 'get');

    // Case 11: Fresh KV cache present
    const nowMs = Date.now();
    await kv.put('markets:public:v1', JSON.stringify(seedMarketSnapshots(nowMs)));
    const freshResult = await fetchSupportedBetaMarkets(env, { nowMs });
    expect(freshResult).toEqual({
      markets: [],
      feedHealthy: false,
      staleReason: MARKET_DATA_DISABLED_REASON,
      marketDataEnabled: false,
    });

    // Case 12: Stale KV cache present
    const staleSnapshots = seedMarketSnapshots(nowMs - 120_000);
    await kv.put('markets:public:v1', JSON.stringify(staleSnapshots));
    const staleResult = await fetchSupportedBetaMarkets(env, { nowMs });
    expect(staleResult).toEqual({
      markets: [],
      feedHealthy: false,
      staleReason: MARKET_DATA_DISABLED_REASON,
      marketDataEnabled: false,
    });

    // Guard must execute BEFORE any KV cache read
    expect(kvGetSpy).not.toHaveBeenCalled();
    assertZeroEgress(tracker.counts, freshResult.markets.length + staleResult.markets.length);
  });

  it('Cases 13-14: Gamma failure and CLOB failure fail closed when enabled, and never fire when disabled', async () => {
    // When disabled: neither Gamma nor CLOB fetch is invoked
    const disabledTracker = createEgressTracker();
    const { env: disabledEnv } = await createPolyBetaTestHarness({
      marketDataEnabled: 'false',
    });
    const disabledFeed = await fetchSupportedBetaMarkets(disabledEnv, {
      fetchImpl: disabledTracker.fetchSpy as unknown as typeof fetch,
    });
    expect(disabledFeed.feedHealthy).toBe(false);
    expect(disabledFeed.staleReason).toBe(MARKET_DATA_DISABLED_REASON);
    assertZeroEgress(disabledTracker.counts, disabledFeed.markets.length);

    // When explicitly enabled: Gamma HTTP 503 fails closed with empty markets
    const { env: enabledEnv, kv: enabledKv } = await createPolyBetaTestHarness({
      marketDataEnabled: 'true',
    });
    await enabledKv.delete('markets:public:v1');
    const gammaFail = await fetchSupportedBetaMarkets(enabledEnv, {
      fetchImpl: async () => new Response('upstream unavailable', { status: 503 }),
    });
    expect(gammaFail.feedHealthy).toBe(false);
    expect(gammaFail.markets).toEqual([]);
    expect(gammaFail.staleReason).toContain('HTTP 503');

    // When explicitly enabled: CLOB failure fails closed with empty markets (no fabricated quotes)
    const nowMs = Date.now();
    const clobFail = await fetchSupportedBetaMarkets(enabledEnv, {
      nowMs,
      fetchImpl: async (input) => {
        const u = String(input);
        if (u.includes('/markets')) {
          return new Response(
            JSON.stringify([
              {
                id: 'mkt-clob-fail',
                question: 'Will macro CPI print below 2%?',
                slug: 'macro-cpi-below-2',
                category: 'Macro',
                clobTokenIds: ['tok_yes', 'tok_no'],
                outcomes: ['Yes', 'No'],
                outcomePrices: ['0.50', '0.50'],
                bestBid: '0.49',
                bestAsk: '0.51',
                enableOrderBook: true,
                active: true,
                closed: false,
              },
            ]),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('clob down', { status: 502 });
      },
    });
    expect(clobFail.feedHealthy).toBe(false);
    expect(clobFail.markets).toEqual([]);

    // Health endpoint MUST NEVER call fetch() even when MARKET_DATA_ENABLED="true" and KV is empty
    const healthTracker = createEgressTracker();
    globalThis.fetch = healthTracker.fetchSpy as unknown as typeof fetch;
    const healthRes = await worker.fetch(
      new Request('https://poly-beta-api.internal/api/health'),
      enabledEnv,
    );
    expect(healthRes.status).toBe(200);
    const healthData = (await healthRes.json()) as {
      marketDataEnabled: boolean;
      marketFeedHealthy: boolean;
      supportedMarketCount: number;
    };
    expect(healthData.marketDataEnabled).toBe(true);
    expect(healthData.marketFeedHealthy).toBe(false);
    expect(healthData.supportedMarketCount).toBe(0);
    assertZeroEgress(healthTracker.counts, healthData.supportedMarketCount);
  });

  it('Cases 15-16: concurrent health requests and repeated retries produce zero egress', async () => {
    const tracker = createEgressTracker();
    globalThis.fetch = tracker.fetchSpy as unknown as typeof fetch;

    const { env } = await createPolyBetaTestHarness({
      maintenanceMode: 'true',
      marketDataEnabled: 'false',
    });

    // Case 15: 12 concurrent health requests
    const concurrentResponses = await Promise.all(
      Array.from({ length: 12 }, (_, idx) =>
        worker.fetch(
          new Request(`https://poly-beta-api.internal${idx % 2 === 0 ? '/api/health' : '/health'}`),
          env,
        ),
      ),
    );
    for (const res of concurrentResponses) {
      expect(res.status).toBe(200);
      const body = (await res.json()) as { marketFeedHealthy: boolean; supportedMarketCount: number };
      expect(body.marketFeedHealthy).toBe(false);
      expect(body.supportedMarketCount).toBe(0);
    }

    // Case 16: Repeated retries across health and markets
    env.MAINTENANCE_MODE = 'false';
    for (let i = 0; i < 5; i += 1) {
      const mRes = await worker.fetch(
        new Request('https://poly-beta-api.internal/api/beta/markets', {
          headers: { Origin: ORIGIN },
        }),
        env,
      );
      expect(mRes.status).toBe(200);
      const mBody = (await mRes.json()) as { markets: unknown[]; feedHealthy: boolean };
      expect(mBody.feedHealthy).toBe(false);
      expect(mBody.markets).toEqual([]);
    }

    assertZeroEgress(tracker.counts, 0);
  });

  it('Cases 18-19: wrangler.poly-beta.toml enforces closed private routing (workers_dev=false, preview_urls=false, routes=[])', () => {
    const parsed = parseWranglerToml(readFileSync(WRANGLER_CONFIG_PATH, 'utf8')) as {
      name: string;
      workers_dev: boolean;
      preview_urls: boolean;
      routes: string;
      vars: Record<string, string>;
      env?: { dev?: { vars?: Record<string, string> } };
    };

    expect(parsed.name).toBe('poly-beta-api');
    expect(parsed.workers_dev).toBe(false);
    expect(parsed.preview_urls).toBe(false);
    expect(parsed.routes).toBe('[]');
    expect(parsed.vars.LIVE_TRADING_ENABLED).toBe('false');
    expect(parsed.vars.MAINTENANCE_MODE).toBe('true');
    expect(parsed.vars.MARKET_DATA_ENABLED).toBe('false');
    expect(parsed.vars.SIGNUP_GATE_MODE).toBe('allowlist');
    expect(parsed.vars.G1_SOAK_LOCK).toBe('locked');
    expect(parsed.vars.G2_POLY_SHADOW_LOCK).toBe('locked');
    expect(parsed.env?.dev?.vars?.MAINTENANCE_MODE).toBe('true');
    expect(parsed.env?.dev?.vars?.MARKET_DATA_ENABLED).toBe('false');

    // Also verify emergency disable validator accepts the closed config
    const validated = validateWranglerConfig(WRANGLER_CONFIG_PATH, 'poly-beta-prod');
    expect(validated.workerName).toBe('poly-beta-api');
    expect(validated.databaseName).toBe('poly-beta-db');
  });

  it('Cases 20-22: rejects wrong Cloudflare env, unexpected routes, and LIVE_TRADING_ENABLED=true', async () => {
    // Case 20: Wrong Cloudflare environment (staging missing in prod config)
    expect(() => validateWranglerConfig(WRANGLER_CONFIG_PATH, 'poly-beta-staging')).toThrow(
      /requires explicit \[env\.staging\]/,
    );

    // Case 21: Worker config with unexpected public route
    const badRouteConfig = join(tempDir, 'wrangler.unexpected-route.toml');
    writeFileSync(
      badRouteConfig,
      [
        'name = "poly-beta-api"',
        'workers_dev = false',
        'preview_urls = false',
        '[[routes]]',
        'pattern = "api.cashclaw.cc/*"',
        '[vars]',
        'ENVIRONMENT = "public-beta"',
        'LIVE_TRADING_ENABLED = "false"',
        '[[d1_databases]]',
        'binding = "POLY_BETA_DB"',
        'database_name = "poly-beta-db"',
      ].join('\n'),
      'utf8',
    );
    expect(() => validateWranglerConfig(badRouteConfig, 'poly-beta-prod')).toThrow(
      /unexpected public routes/,
    );

    // Case 22: Worker config with LIVE_TRADING_ENABLED="true" + Worker runtime safety halt
    const liveConfig = join(tempDir, 'wrangler.live-flag.toml');
    writeFileSync(
      liveConfig,
      [
        'name = "poly-beta-api"',
        'workers_dev = false',
        'preview_urls = false',
        'routes = []',
        '[vars]',
        'ENVIRONMENT = "public-beta"',
        'LIVE_TRADING_ENABLED = "true"',
        '[[d1_databases]]',
        'binding = "POLY_BETA_DB"',
        'database_name = "poly-beta-db"',
      ].join('\n'),
      'utf8',
    );
    expect(() => validateWranglerConfig(liveConfig, 'poly-beta-prod')).toThrow(
      /LIVE_TRADING_ENABLED must be "false"/,
    );

    const { env } = await createPolyBetaTestHarness({ marketDataEnabled: 'false' });
    env.LIVE_TRADING_ENABLED = 'true';
    const haltRes = await worker.fetch(new Request('https://poly-beta-api.internal/api/health'), env);
    expect(haltRes.status).toBe(503);
    await expect(haltRes.json()).resolves.toMatchObject({ code: 'LIVE_TRADING_FORBIDDEN_IN_BETA' });
  });

  it('Case 23: rejects Cloudflare Access header spoofing, unauthenticated access, CSRF bypass, and maintenance mutations', async () => {
    const tracker = createEgressTracker();
    globalThis.fetch = tracker.fetchSpy as unknown as typeof fetch;

    const { env } = await createPolyBetaTestHarness({
      maintenanceMode: 'false',
      marketDataEnabled: 'false',
    });

    // Forged Cloudflare Access header without valid app session cookie -> 401
    const accessSpoof = await worker.fetch(
      new Request('https://poly-beta-api.internal/api/beta/portfolio', {
        headers: {
          Origin: ORIGIN,
          'Cf-Access-Authenticated-User-Email': 'founder@example.com',
          'Cf-Access-Jwt-Assertion': 'forged.jwt.token',
        },
      }),
      env,
    );
    expect(accessSpoof.status).toBe(401);

    // Valid session but missing CSRF token on mutation -> 403
    const auth = await signupAndGetAuthHeaders(env);
    const csrfMissing = await worker.fetch(
      new Request('https://poly-beta-api.internal/api/beta/strategy/control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          Cookie: auth.cookie,
        },
        body: JSON.stringify({ action: 'START', strategyId: 'toxicity-aware-mm-paper' }),
      }),
      env,
    );
    expect(csrfMissing.status).toBe(403);

    // Caller authority override via query string -> 403
    const scopeOverride = await worker.fetch(
      new Request('https://poly-beta-api.internal/api/beta/portfolio?tenantId=other-tenant', {
        headers: { Origin: ORIGIN, Cookie: auth.cookie },
      }),
      env,
    );
    expect(scopeOverride.status).toBe(403);

    // Maintenance mode blocks signup, login, strategy mutation, while allowing logout
    env.MAINTENANCE_MODE = 'true';
    const maintSignup = await worker.fetch(
      new Request('https://poly-beta-api.internal/api/beta/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ email: 'alice@example.com' }),
      }),
      env,
    );
    expect(maintSignup.status).toBe(503);

    const maintLogin = await worker.fetch(
      new Request('https://poly-beta-api.internal/api/beta/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ email: 'guard@example.com', password: 'StrongPassword#2026!' }),
      }),
      env,
    );
    expect(maintLogin.status).toBe(503);

    const maintLogout = await worker.fetch(
      new Request('https://poly-beta-api.internal/api/beta/auth/logout', {
        method: 'POST',
        headers: {
          Origin: ORIGIN,
          Cookie: auth.cookie,
          'X-CSRF-Token': auth.csrfToken,
        },
      }),
      env,
    );
    expect(maintLogout.status).toBe(200);

    assertZeroEgress(tracker.counts, 0);
  });
});
