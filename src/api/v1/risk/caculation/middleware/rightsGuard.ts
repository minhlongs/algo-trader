// ──────────────────────────────────────────────────────────────────────────────
// rightsGuard.ts — Express Request augmentation for ratIdentifier
//
// Declaration merging: extends Express Request with a custom property.
// Located here (not in a separate .d.ts file) so TS picks it up automatically.
// ──────────────────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from 'express';
import type { IdentifyResult, TokenPayload } from '../types';

// Augment Express Request with our custom property
declare module 'express' {
  interface Request {
    /** Attached by RightsGuard — null when unauthenticated, { ratId, wallet } on success */
    ratIdentifier?: IdentifyResult;
  }
}

// ── Token extraction (pluggable — swap JWT/session/API-key here) ──────────────

/**
 * Extract the bearer token from the Authorization header.
 * Returns undefined if missing or not a Bearer scheme.
 */
function extractToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  return authHeader.slice(7);
}

// ── TokenGuardService — pure verification, no repo or network deps ────────────

export class TokenGuardService {
  /**
   * Verify the incoming token and return the rat + wallet identity.
   * Returns null when token is absent, malformed, or expired.
   *
   * @param token — raw bearer token string (pre-extracted)
   */
  static verify(token: string): IdentifyResult {
    try {
      const payload = decodeToken(token);
      if (!payload) return null;
      if (payload.exp * 1_000 < Date.now()) return null; // already expired
      return { ratId: payload.ratId, wallet: payload.wallet };
    } catch {
      return null;
    }
  }

  /**
   * Convenience: extract token from request then verify.
   */
  static identify(req: Request): IdentifyResult {
    const token = extractToken(req);
    if (!token) return null;
    return TokenGuardService.verify(token);
  }
}

// ── JWT decode (no external library — minimal, zero-dep) ─────────────────────
// Production: swap with your real JWT library or session verifier.
// The decode function below is intentionally loose — replace the body.

interface DecodedPayload {
  ratId: string;
  wallet: string;
  scope: string[];
  exp: number;
}

function decodeToken(token: string): DecodedPayload | null {
  // ---- Replace this stub with real JWT / HMAC / session verification ----
  // We accept tokens that look like base64url-encoded JSON for dev testing.
  // In production, verify signature against your signing key.
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1];
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    const decoded = JSON.parse(json) as DecodedPayload;
    if (!decoded.ratId || !decoded.wallet || typeof decoded.exp !== 'number') return null;
    return decoded;
  } catch {
    return null;
  }
  // ---- End stub — swap with real verification in production ----
}

// ── RightsGuard middleware ────────────────────────────────────────────────────

export async function RightsGuard(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);

  // No token → 401 (not 403 — they haven't authenticated)
  if (!token) {
    req.ratIdentifier = null;
    next();
    return;
  }

  const identity = TokenGuardService.verify(token);

  if (!identity) {
    req.ratIdentifier = null;
    next();
    return;
  }

  // Attach identity once — no additional auth checks downstream.
  req.ratIdentifier = identity;
  next();
}

// ── Response helpers ──────────────────────────────────────────────────────────

export function sendUnauthorized(res: Response): void {
  res.status(401).json({
    error: {
      code: 'UNAUTHORIZED',
      message: 'Missing or invalid Bearer token',
    },
  });
}

export function sendForbidden(res: Response, reason = 'Insufficient rat scope'): void {
  res.status(403).json({
    error: {
      code: 'FORBIDDEN',
      message: reason,
    },
  });
}
