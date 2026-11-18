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
});
