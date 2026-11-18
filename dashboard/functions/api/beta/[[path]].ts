interface Env {
  POLY_BETA_API_ORIGIN?: string;
}

const DEFAULT_API_ORIGIN = 'https://poly-beta-api.agencyos-openclaw.workers.dev';
const ALLOWED_METHODS = new Set(['GET', 'POST', 'DELETE', 'OPTIONS']);
const ALLOWED_REQUEST_HEADERS = new Set([
  'accept',
  'content-type',
  'idempotency-key',
  'x-csrf-token',
]);

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function jsonError(status: number, error: string, code: string): Response {
  return Response.json({ error, code }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const responseHeaders = corsHeaders(origin);

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

    responseHeaders.set('Access-Control-Allow-Origin', url.origin);
    responseHeaders.set('Access-Control-Allow-Headers', [...ALLOWED_REQUEST_HEADERS].join(', '));
    return new Response(null, { status: 204, headers: responseHeaders });
  }

  if (!ALLOWED_METHODS.has(request.method)) {
    return jsonError(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  }
  if (origin && origin !== url.origin) {
    return jsonError(403, 'Forbidden origin', 'ORIGIN_DENIED');
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
  upstreamHeaders.delete('Host');
  upstreamHeaders.delete('Origin');
  upstreamHeaders.delete('Sec-Fetch-Site');
  upstreamHeaders.delete('Sec-Fetch-Mode');
  upstreamHeaders.delete('Sec-Fetch-Dest');
  upstreamHeaders.set('Origin', url.origin);
  upstreamHeaders.set('Sec-Fetch-Site', 'same-origin');

  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers: upstreamHeaders,
    ...(request.method === 'GET' ? {} : { body: request.body }),
    redirect: 'manual',
  });

  const headers = new Headers(upstreamResponse.headers);
  headers.delete('Access-Control-Allow-Origin');
  headers.delete('Access-Control-Allow-Credentials');
  headers.delete('Access-Control-Allow-Methods');
  headers.delete('Access-Control-Allow-Headers');
  headers.set('Cache-Control', 'no-store');
  for (const [key, value] of responseHeaders) headers.set(key, value);

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
};
