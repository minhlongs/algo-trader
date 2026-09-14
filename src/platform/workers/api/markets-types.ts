import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

export type Env = {
  CACHE: KVNamespace;
  SUBSCRIBERS?: D1Database;
  JWT_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  NOWPAYMENTS_IPN_SECRET?: string;
  ENVIRONMENT?: string;
  VPS_ORIGIN?: string;
  REGION_ROUTING_ENABLED?: string;
  ADMIN_API_KEY?: string;
};

// Loose DO access — envoy pattern avoids cross-module struct TS errors
export type EnvAny = Env & Record<string, unknown>;

export function corsHeaders(env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS || 'https://cashclaw.cc').split(',').map((s: string) => s.trim());
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export function isAdmin(request: Request, env: Env): boolean {
  const apiKey = request.headers.get('x-api-key');
  const adminKey = (env as EnvAny).ADMIN_API_KEY;
  return !!(apiKey && adminKey && apiKey === adminKey);
}

export function jsonH(env: Env): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': (env.ALLOWED_ORIGINS || 'https://cashclaw.cc').split(',')[0],
  };
}

export function unauthorized(env: Env): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized — x-api-key required' }), {
    status: 401,
    headers: jsonH(env),
  });
}

export function methodNotAllowed(env: Env): Response {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: jsonH(env),
  });
}
