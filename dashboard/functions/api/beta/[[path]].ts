interface ServiceFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface BetaPagesProxyEnv {
  POLY_BETA_API?: ServiceFetcher;
  POLY_BETA_API_ORIGIN?: string;
  POLY_BETA_PROXY_SECRET?: string;
}

const DEFAULT_API_ORIGIN = 'https://poly-beta-api.agencyos-openclaw.workers.dev';
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'DELETE', 'OPTIONS']);
const ALLOWED_REQUEST_HEADERS = new Set([
  'accept',
  'content-type',
  'idempotency-key',
  'x-csrf-token',
]);

export function isAllowedBetaPagesHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  return (
    h === 'poly-beta-dashboard.pages.dev' ||
    /^[a-z0-9-]+\.poly-beta-dashboard\.pages\.dev$/.test(h) ||
    h === 'localhost' ||
    h === '127.0.0.1'
  );
}

export function isSameOriginBrowserMutation(request: Request, expectedOrigin: string): boolean {
  const secFetchSite = request.headers.get('Sec-Fetch-Site')?.trim().toLowerCase();
  if (secFetchSite && secFetchSite !== 'same-origin') {
    return false;
  }
  const origin = request.headers.get('Origin')?.trim();
  if (origin) {
    return origin === expectedOrigin;
  }
  const referer = request.headers.get('Referer')?.trim();
  if (!referer) return false;
  try {
    return new URL(referer).origin === expectedOrigin;
  } catch {
    return false;
  }
}

async function signForwardedClientIp(secret: string, clientIp: string, tsRaw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${clientIp}:${tsRaw}`));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function jsonError(status: number, error: string, code: string): Response {
  return Response.json(
    { error, code },
    { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
  );
}

export const onRequest: PagesFunction<BetaPagesProxyEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  if (!isAllowedBetaPagesHost(url.hostname)) {
    return jsonError(404, 'Not found on this host', 'BETA_HOST_ISOLATED');
  }

  if (!ALLOWED_METHODS.has(request.method)) {
    return jsonError(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  }

  const origin = request.headers.get('Origin')?.trim() ?? null;
  if (request.method === 'OPTIONS') {
    const requestedMethod = request.headers.get('Access-Control-Request-Method')?.toUpperCase();
    const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') ?? '')
      .split(',')
      .map((header) => header.trim().toLowerCase())
      .filter(Boolean);

    if (
      !origin ||
      origin !== url.origin ||
      !requestedMethod ||
      !ALLOWED_METHODS.has(requestedMethod) ||
      requestedHeaders.some((header) => !ALLOWED_REQUEST_HEADERS.has(header))
    ) {
      return jsonError(403, 'Forbidden origin', 'ORIGIN_DENIED');
    }

    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': url.origin,
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': [...ALLOWED_REQUEST_HEADERS].join(', '),
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      },
    });
  }

  if (origin && origin !== url.origin) {
    return jsonError(403, 'Forbidden origin', 'ORIGIN_DENIED');
  }

  const isMutating = request.method !== 'GET' && request.method !== 'HEAD';
  if (isMutating && !isSameOriginBrowserMutation(request, url.origin)) {
    return jsonError(403, 'Forbidden mutation source', 'ORIGIN_DENIED');
  }

  const upstreamOrigin = env.POLY_BETA_API_ORIGIN || DEFAULT_API_ORIGIN;
  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(url.pathname + url.search, upstreamOrigin);
    if (upstreamUrl.origin !== new URL(upstreamOrigin).origin) {
      return jsonError(500, 'Proxy configuration error', 'PROXY_CONFIG_ERROR');
    }
  } catch {
    return jsonError(500, 'Proxy configuration error', 'PROXY_CONFIG_ERROR');
  }

  const upstreamHeaders = new Headers(request.headers);
  for (const h of [
    'Host',
    'Origin',
    'Sec-Fetch-Site',
    'Sec-Fetch-Mode',
    'Sec-Fetch-Dest',
    'X-Forwarded-For',
    'X-Poly-Beta-Client-IP',
    'X-Poly-Beta-Proxy-Ts',
    'X-Poly-Beta-Proxy-Sig',
  ]) {
    upstreamHeaders.delete(h);
  }
  upstreamHeaders.set('Origin', url.origin);
  upstreamHeaders.set('Sec-Fetch-Site', 'same-origin');

  const clientIp = request.headers.get('CF-Connecting-IP')?.trim();
  const proxySecret = env.POLY_BETA_PROXY_SECRET?.trim();
  if (clientIp && proxySecret) {
    const tsRaw = String(Date.now());
    const sig = await signForwardedClientIp(proxySecret, clientIp, tsRaw);
    upstreamHeaders.set('X-Poly-Beta-Client-IP', clientIp);
    upstreamHeaders.set('X-Poly-Beta-Proxy-Ts', tsRaw);
    upstreamHeaders.set('X-Poly-Beta-Proxy-Sig', sig);
  }

  const reqInit: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers: upstreamHeaders,
    ...(isMutating && request.body ? { body: request.body, duplex: 'half' } : {}),
    redirect: 'manual',
  };

  let upstreamResponse: Response;
  try {
    upstreamResponse = env.POLY_BETA_API
      ? await env.POLY_BETA_API.fetch(upstreamUrl.toString(), reqInit)
      : await fetch(upstreamUrl.toString(), reqInit);
  } catch {
    return jsonError(502, 'Upstream API unavailable', 'UPSTREAM_UNAVAILABLE');
  }

  const headers = new Headers(upstreamResponse.headers);
  headers.delete('Access-Control-Allow-Origin');
  headers.delete('Access-Control-Allow-Credentials');
  headers.delete('Access-Control-Allow-Methods');
  headers.delete('Access-Control-Allow-Headers');
  headers.delete('Access-Control-Max-Age');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
};
