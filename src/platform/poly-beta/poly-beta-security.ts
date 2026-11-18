/**
 * POLY-G5 Public Beta — WebCrypto Password Hashing, Session Cookie, CSRF,
 * Rate Limiting, Security Headers & Origin Validation.
 */

import {
  DEV_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  type PolyBetaEnv,
} from './poly-beta-types';

const PBKDF2_ITERATIONS = 100_000;

export const BETA_SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Cache-Control': 'no-store',
};

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) return new Uint8Array(0);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

export function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function randomHexToken(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return toHex(bytes);
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return toHex(digest);
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return toHex(sig);
}

export async function hashUserPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return { hash: toHex(bits), salt: toHex(salt) };
}

export async function verifyUserPassword(
  password: string,
  expectedHash: string,
  saltHex: string,
): Promise<boolean> {
  const salt = fromHex(saltHex);
  if (salt.length !== 16) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return timingSafeHexEqual(toHex(bits), expectedHash);
}

export function parseAllowedOrigins(env: PolyBetaEnv): string[] {
  const raw = env.ALLOWED_ORIGINS || 'https://poly-beta-dashboard.pages.dev';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isOriginPermitted(origin: string | null, env: PolyBetaEnv): boolean {
  if (!origin) return true;
  const allowed = parseAllowedOrigins(env);
  if (allowed.includes(origin)) return true;
  // Allow preview subdomains on the dedicated `poly-beta-dashboard.pages.dev` project only
  if (/^https:\/\/[a-z0-9-]+\.poly-beta-dashboard\.pages\.dev$/i.test(origin)) return true;
  return false;
}

export function buildCorsHeaders(request: Request, env: PolyBetaEnv): Record<string, string> {
  const origin = request.headers.get('Origin');
  const allowed = parseAllowedOrigins(env);
  const resolvedOrigin = origin && isOriginPermitted(origin, env) ? origin : allowed[0] ?? 'null';
  return {
    'Access-Control-Allow-Origin': resolvedOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Idempotency-Key',
    Vary: 'Origin',
  };
}

export function betaJsonResponse(
  request: Request,
  env: PolyBetaEnv,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...BETA_SECURITY_HEADERS,
      ...buildCorsHeaders(request, env),
      ...extraHeaders,
    },
  });
}

export function buildSessionSetCookie(rawToken: string, isHttps: boolean): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1_000);
  if (isHttps) {
    return `${SESSION_COOKIE_NAME}=${rawToken}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None`;
  }
  return `${DEV_SESSION_COOKIE_NAME}=${rawToken}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`;
}

export function buildSessionClearCookie(isHttps: boolean): string {
  if (isHttps) {
    return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`;
  }
  return `${DEV_SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

export function extractSessionTokenFromCookie(
  cookieHeader: string | null,
  isHttps: boolean,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    const allowedName = isHttps
      ? name === SESSION_COOKIE_NAME
      : name === SESSION_COOKIE_NAME || name === DEV_SESSION_COOKIE_NAME;
    if (allowedName && val.length >= 32) {
      return val;
    }
  }
  return null;
}

export { checkRateLimit } from './poly-beta-rate-limiter';
