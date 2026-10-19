/**
 * Pure validation, response, and CORS helpers for CashClaw auth handlers.
 */

import { SECURITY_HEADERS } from './edge-proxy-constants';

export interface AuthEnv {
  CACHE: KVNamespace;
  JWT_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  ADMIN_API_KEY?: string;
}

export interface StoredUser {
  id: string;
  email: string;
  hash: string;
  salt: string;
  tier: string;
  role: 'admin' | 'user';
  tenantId: string;
  apiKey: string;
  createdAt: string;
}

export const BASE_CORS = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export function getCorsHeaders(env: AuthEnv, origin?: string | null): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS || 'https://cashclaw.cc').split(',').map((s) => s.trim());
  const match = origin && allowed.includes(origin) ? origin : allowed[0];
  return { ...BASE_CORS, 'Access-Control-Allow-Origin': match };
}

export function json(data: unknown, status = 200, env?: AuthEnv, origin?: string | null): Response {
  const headers = env
    ? { ...getCorsHeaders(env, origin), ...SECURITY_HEADERS }
    : { ...BASE_CORS, 'Access-Control-Allow-Origin': 'https://cashclaw.cc', ...SECURITY_HEADERS };
  return new Response(JSON.stringify(data), { status, headers });
}

export function getSecret(env: AuthEnv): string {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET env var is required — refusing to use insecure fallback');
  }
  return env.JWT_SECRET;
}

export function validateSignupInput(email?: string, password?: string): Response | null {
  if (!email || !password) return json({ error: 'Email and password required' }, 400);
  if (password.length < 12) return json({ error: 'Password must be at least 12 characters' }, 400);
  if (!/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return json({ error: 'Password must contain uppercase, number, and special character' }, 400);
  }
  return null;
}

export function isAdminRequest(request: Request, env: AuthEnv): boolean {
  const apiKey = request.headers.get('x-api-key');
  const adminKey = env.ADMIN_API_KEY;
  return Boolean(apiKey && adminKey && apiKey === adminKey);
}

export function corsPreflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: { ...BASE_CORS, 'Access-Control-Allow-Origin': 'https://cashclaw.cc' },
  });
}

export function notImplementedResponse(path: string): Response {
  return json(
    {
      error: `${path} — chưa triển khai trên CF-Only`,
      hint: 'This endpoint has not been migrated to the CF-only Worker yet',
    },
    501,
  );
}
