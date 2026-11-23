/**
 * POLY-G5 Dashboard Pages Function Same-Origin Proxy Hardening Tests:
 * - Host allowlist isolation (`quant.cashclaw.cc` -> 404; `poly-beta-dashboard.pages.dev` -> 200)
 * - Blocks cross-site form POST (`Sec-Fetch-Site: cross-site` / missing `Origin`+`Referer`)
 * - Prefers `POLY_BETA_API` Service Binding, attaches HMAC client IP, strips incoming spoof headers
 * - Never leaks CORS headers onto non-OPTIONS same-origin responses
 */

import { describe, expect, it, vi } from 'vitest';
import {
  isAllowedBetaPagesHost,
  isSameOriginBrowserMutation,
  onRequest,
  type BetaPagesProxyEnv,
} from '../../functions/api/beta/[[path]]';

function invokeProxy(request: Request, env: BetaPagesProxyEnv = {}): Promise<Response> {
  return onRequest({ request, env } as unknown as Parameters<typeof onRequest>[0]);
}

describe('POLY-G5 Pages Proxy Function (/api/beta/[[path]])', () => {
  it('isolates /api/beta/* strictly to poly-beta-dashboard.pages.dev and localhost', async () => {
    expect(isAllowedBetaPagesHost('poly-beta-dashboard.pages.dev')).toBe(true);
    expect(isAllowedBetaPagesHost('a1b2c3.poly-beta-dashboard.pages.dev')).toBe(true);
    expect(isAllowedBetaPagesHost('localhost')).toBe(true);
    expect(isAllowedBetaPagesHost('quant.cashclaw.cc')).toBe(false);
    expect(isAllowedBetaPagesHost('algo-trader-dashboard.pages.dev')).toBe(false);

    const cashclawRes = await invokeProxy(new Request('https://quant.cashclaw.cc/api/beta/health'));
    expect(cashclawRes.status).toBe(404);
    await expect(cashclawRes.json()).resolves.toMatchObject({ code: 'BETA_HOST_ISOLATED' });
  });

  it('rejects cross-site form POSTs and missing-Origin mutations without same-origin Referer', async () => {
    const upstreamSpy = vi.fn();
    const env: BetaPagesProxyEnv = { POLY_BETA_API: { fetch: upstreamSpy } };

    // Cross-site HTML form POST with `Origin: null` and `Sec-Fetch-Site: cross-site`
    const formAttack = await invokeProxy(
      new Request('https://poly-beta-dashboard.pages.dev/api/beta/auth/login', {
        method: 'POST',
        headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'null' },
        body: '{}',
      }),
      env,
    );
    expect(formAttack.status).toBe(403);

    // Missing Origin AND missing Referer on POST -> blocked (never forges Origin!)
    const barePost = await invokeProxy(
      new Request('https://poly-beta-dashboard.pages.dev/api/beta/auth/login', {
        method: 'POST',
        body: '{}',
      }),
      env,
    );
    expect(barePost.status).toBe(403);
    expect(upstreamSpy).not.toHaveBeenCalled();

    // Missing Origin WITH valid same-origin Referer + Sec-Fetch-Site: same-origin -> permitted
    expect(
      isSameOriginBrowserMutation(
        new Request('https://poly-beta-dashboard.pages.dev/api/beta/auth/logout', {
          method: 'POST',
          headers: {
            'Sec-Fetch-Site': 'same-origin',
            Referer: 'https://poly-beta-dashboard.pages.dev/',
          },
        }),
        'https://poly-beta-dashboard.pages.dev',
      ),
    ).toBe(true);
  });

  it('dispatches via POLY_BETA_API Service Binding, signs CF-Connecting-IP, strips spoofed headers & upstream CORS', async () => {
    let capturedHeaders: Headers | undefined;
    const env: BetaPagesProxyEnv = {
      POLY_BETA_PROXY_SECRET: 'proxy-test-secret-2026',
      POLY_BETA_API: {
        async fetch(_input, init) {
          capturedHeaders = new Headers(init?.headers);
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': 'https://poly-beta-dashboard.pages.dev',
              'Access-Control-Allow-Credentials': 'true',
            },
          });
        },
      },
    };

    const res = await invokeProxy(
      new Request('https://poly-beta-dashboard.pages.dev/api/beta/auth/signup', {
        method: 'POST',
        headers: {
          Origin: 'https://poly-beta-dashboard.pages.dev',
          'Sec-Fetch-Site': 'same-origin',
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '198.51.100.42',
          'X-Poly-Beta-Client-IP': '1.2.3.4',
          'X-Forwarded-For': '1.2.3.4',
        },
        body: '{"email":"x@example.com"}',
      }),
      env,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');

    expect(capturedHeaders).toBeDefined();
    expect(capturedHeaders!.get('X-Forwarded-For')).toBeNull();
    expect(capturedHeaders!.get('X-Poly-Beta-Client-IP')).toBe('198.51.100.42');
    expect(capturedHeaders!.get('X-Poly-Beta-Proxy-Sig')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('Case 17: fails closed with 503 SERVICE_BINDING_MISSING when POLY_BETA_API binding is absent (zero workers.dev fallback)', async () => {
    const globalFetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('OUTBOUND_FALLBACK_FORBIDDEN');
    });
    try {
      const res = await invokeProxy(
        new Request('https://poly-beta-dashboard.pages.dev/api/beta/markets', {
          method: 'GET',
          headers: { Origin: 'https://poly-beta-dashboard.pages.dev' },
        }),
        {},
      );
      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toMatchObject({ code: 'SERVICE_BINDING_MISSING' });
      expect(globalFetchSpy).not.toHaveBeenCalled();

      // Even if a non-loopback POLY_BETA_API_ORIGIN is injected, reject on production host
      const resWithOrigin = await invokeProxy(
        new Request('https://poly-beta-dashboard.pages.dev/api/beta/markets', {
          method: 'GET',
        }),
        { POLY_BETA_API_ORIGIN: 'https://poly-beta-api.agencyos-openclaw.workers.dev' },
      );
      expect(resWithOrigin.status).toBe(503);
      await expect(resWithOrigin.json()).resolves.toMatchObject({ code: 'SERVICE_BINDING_MISSING' });
      expect(globalFetchSpy).not.toHaveBeenCalled();
    } finally {
      globalFetchSpy.mockRestore();
    }
  });

  it('propagates HTTP status, Set-Cookie, Cookie, CSRF header, and request body via Service Binding', async () => {
    let capturedUrl = '';
    let capturedBody = '';
    let capturedHeaders: Headers | undefined;
    const env: BetaPagesProxyEnv = {
      POLY_BETA_API: {
        async fetch(input, init) {
          capturedUrl = String(input);
          capturedHeaders = new Headers(init?.headers);
          capturedBody = init?.body ? await new Response(init.body).text() : '';
          return new Response(JSON.stringify({ ok: false, code: 'MAINTENANCE_MODE' }), {
            status: 503,
            headers: {
              'Content-Type': 'application/json',
              'Set-Cookie': '__Host-poly_beta_sid=abc; HttpOnly; Secure; SameSite=Lax; Path=/',
            },
          });
        },
      },
    };

    const res = await invokeProxy(
      new Request('https://poly-beta-dashboard.pages.dev/api/beta/strategy/control?foo=1', {
        method: 'POST',
        headers: {
          Origin: 'https://poly-beta-dashboard.pages.dev',
          'Sec-Fetch-Site': 'same-origin',
          'Content-Type': 'application/json',
          Cookie: '__Host-poly_beta_sid=existing',
          'X-CSRF-Token': 'csrf-token-123',
        },
        body: JSON.stringify({ action: 'START' }),
      }),
      env,
    );

    expect(res.status).toBe(503);
    expect(capturedUrl).toBe('https://poly-beta-api.internal/api/beta/strategy/control?foo=1');
    expect(capturedBody).toBe('{"action":"START"}');
    expect(capturedHeaders?.get('Cookie')).toBe('__Host-poly_beta_sid=existing');
    expect(capturedHeaders?.get('X-CSRF-Token')).toBe('csrf-token-123');
    expect(res.headers.get('Set-Cookie')).toContain('__Host-poly_beta_sid=abc');
    await expect(res.json()).resolves.toMatchObject({ code: 'MAINTENANCE_MODE' });
  });

  it('handles Worker unavailable, client abort/disconnect, and unexpected hostnames cleanly', async () => {
    // Worker throws / unavailable -> 502 UPSTREAM_UNAVAILABLE
    const unavailableRes = await invokeProxy(
      new Request('https://poly-beta-dashboard.pages.dev/api/beta/markets'),
      {
        POLY_BETA_API: {
          async fetch() {
            throw new Error('Worker connection reset');
          },
        },
      },
    );
    expect(unavailableRes.status).toBe(502);
    await expect(unavailableRes.json()).resolves.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });

    // Client disconnect / AbortError -> 502 without leaking stack trace
    const abortRes = await invokeProxy(
      new Request('https://poly-beta-dashboard.pages.dev/api/beta/markets'),
      {
        POLY_BETA_API: {
          async fetch() {
            throw new DOMException('Client disconnected', 'AbortError');
          },
        },
      },
    );
    expect(abortRes.status).toBe(502);
    await expect(abortRes.json()).resolves.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });

    // Unexpected alternative hostname -> 404 BETA_HOST_ISOLATED
    for (const host of ['evil.example.com', 'poly-beta-api.workers.dev', 'api.cashclaw.cc']) {
      const badHostRes = await invokeProxy(new Request(`https://${host}/api/beta/markets`));
      expect(badHostRes.status).toBe(404);
      await expect(badHostRes.json()).resolves.toMatchObject({ code: 'BETA_HOST_ISOLATED' });
    }
  });
});
