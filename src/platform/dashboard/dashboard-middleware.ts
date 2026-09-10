/**
 * Dashboard HTTP middleware
 * Auth verification (JWT Bearer), admin role checks, CORS with origin allowlist
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyJwt } from '../middleware/auth-middleware';
import type { Role } from'../../users/subscription-tier';
import { sendJson } from './dashboard-utils';

/** Allowed CORS origins — never reflect arbitrary origin header */
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'https://cashclaw.cc',
  'https://www.cashclaw.cc',
];

/** Apply CORS headers using strict origin allowlist */
export function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers['origin'];
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
}

/** Security headers for dashboard HTML responses */
export function applySecurityHeaders(res: ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // CSP: restrict sources to same-origin + CDN for Chart.js
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' wss: ws:; frame-ancestors 'none'"
  );
}

export type AuthPayload = { sub: string; email: string; role: Role };

/**
 * Verify JWT from Authorization: Bearer <token> header.
 * Returns payload on success, true when no JWT_SECRET (single-operator mode), false on failure.
 */
export function authenticateRequest(
  req: IncomingMessage,
  res: ServerResponse,
  jwtSecret: string,
): AuthPayload | true | false {
  if (!jwtSecret) return true;
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    sendJson(res, 401, { error: 'Unauthorized', message: 'Missing Authorization: Bearer <token>' });
    return false;
  }
  const payload = verifyJwt(authHeader.slice(7), jwtSecret);
  if (!payload) {
    sendJson(res, 401, { error: 'Unauthorized', message: 'Invalid or expired token' });
    return false;
  }
  return { sub: payload.sub, email: payload.email, role: (payload.role ?? 'user') as Role };
}

/** Returns true if authenticated user has admin role (or JWT_SECRET is unset) */
export function requireAdmin(
  req: IncomingMessage,
  res: ServerResponse,
  jwtSecret: string,
): boolean {
  const auth = authenticateRequest(req, res, jwtSecret);
  if (auth === false) return false;
  if (auth === true) return true; // single-operator mode — allow all
  if (auth.role !== 'admin') {
    sendJson(res, 403, { error: 'Forbidden', message: 'Admin access required' });
    return false;
  }
  return true;
}
