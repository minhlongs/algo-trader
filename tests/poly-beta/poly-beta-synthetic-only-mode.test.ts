import { describe, expect, it } from 'vitest';
import worker from '../../src/platform/poly-beta/poly-beta-worker';
import {
  buildTestInvitesJson,
  createPolyBetaTestHarness,
  testInviteTokenForEmail,
} from './poly-beta-test-harness';

const ORIGIN = 'http://localhost:5173';

describe('SYNTHETIC_ONLY_MODE — Zero-Egress Local Paper Trading Cycle', () => {
  it('serves deterministic synthetic markets and completes a full $100 paper cycle with zero external fetch', async () => {
    const email = 'founder-synthetic@example.com';
    const token = testInviteTokenForEmail(email, 'syn-local');
    const { env } = await createPolyBetaTestHarness({
      marketDataEnabled: 'false',
      maintenanceMode: 'false',
      signupAllowlist: email,
      signupInvites: buildTestInvitesJson([{ rawToken: token, email }]),
    });
    env.ENVIRONMENT = 'dev';
    env.ALLOWED_ORIGINS = ORIGIN;
    env.SYNTHETIC_ONLY_MODE = 'true';

    // 1. Health reports SYNTHETIC_ONLY with zero external market data
    const healthRes = await worker.fetch(new Request('http://127.0.0.1:8787/api/health'), env);
    expect(healthRes.status).toBe(200);
    expect(await healthRes.json()).toMatchObject({
      ok: true,
      mode: 'SYNTHETIC_ONLY',
      syntheticOnlyMode: true,
      evidenceClass: 'SYNTHETIC_ONLY',
      liveTradingEnabled: false,
      marketDataEnabled: false,
      marketFeedHealthy: true,
      supportedMarketCount: 3,
    });

    // 2. Markets endpoint returns 3 deterministic synthetic fixtures
    const marketsRes = await worker.fetch(new Request('http://127.0.0.1:8787/api/beta/markets'), env);
    expect(marketsRes.status).toBe(200);
    const marketsJson = (await marketsRes.json()) as {
      marketDataEnabled: boolean;
      feedHealthy: boolean;
      markets: Array<{ marketId: string; source: string; bestBid: number; bestAsk: number }>;
    };
    expect(marketsJson.marketDataEnabled).toBe(false);
    expect(marketsJson.feedHealthy).toBe(true);
    expect(marketsJson.markets).toHaveLength(3);
    expect(marketsJson.markets.every((m) => m.source === 'deterministic-fixture')).toBe(true);

    // 3. Signup with $100.00 virtual starting balance
    const signupRes = await worker.fetch(
      new Request('http://127.0.0.1:8787/api/beta/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          'CF-Connecting-IP': '127.0.0.1',
          'CF-IPCountry': 'CH',
        },
        body: JSON.stringify({
          email,
          password: 'Synthetic#Password2026!',
          inviteToken: token,
          countryCode: 'CH',
          acknowledgeSimulationAndRisk: true,
          acknowledgeJurisdictionAndNonVpn: true,
        }),
      }),
      env,
    );
    expect(signupRes.status).toBe(201);
    const cookie = signupRes.headers.get('set-cookie')?.split(';')[0] ?? '';
    const signupBody = (await signupRes.json()) as { csrfToken: string };
    expect(cookie).toContain('poly_beta_sid=');

    // 4. Start paper engine & execute a simulated fill step
    const authHeaders = {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      Cookie: cookie,
      'X-CSRF-Token': signupBody.csrfToken,
    };

    const startRes = await worker.fetch(
      new Request('http://127.0.0.1:8787/api/beta/strategy/control', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          action: 'START',
          strategyId: 'toxicity-aware-mm-paper',
          marketId: 'syn-fed-rate-cut-q4',
        }),
      }),
      env,
    );
    expect(startRes.status).toBe(200);

    const stepRes = await worker.fetch(
      new Request('http://127.0.0.1:8787/api/beta/strategy/control', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          action: 'STEP',
          strategyId: 'toxicity-aware-mm-paper',
          marketId: 'syn-fed-rate-cut-q4',
        }),
      }),
      env,
    );
    expect(stepRes.status).toBe(200);

    // 5. Portfolio reflects updated virtual balance, open position, fee accounting, and trade history
    const dashRes = await worker.fetch(
      new Request('http://127.0.0.1:8787/api/beta/portfolio', {
        headers: { Cookie: cookie, Origin: ORIGIN },
      }),
      env,
    );
    expect(dashRes.status).toBe(200);
    const dash = (await dashRes.json()) as {
      summary: { initialCapitalUsd: number; cashBalanceUsd: number; feesPaidUsd: number; openExposureUsd: number };
      orders: unknown[];
      fills: unknown[];
      openPositions?: unknown[];
    };
    expect(dash.summary.initialCapitalUsd).toBe(100);
    expect(dash.summary.cashBalanceUsd).toBeLessThan(100);
    expect(dash.summary.openExposureUsd).toBeGreaterThan(0);
    expect(dash.summary.feesPaidUsd).toBeGreaterThan(0);
    expect(dash.fills.length).toBeGreaterThanOrEqual(1);
  });
});
