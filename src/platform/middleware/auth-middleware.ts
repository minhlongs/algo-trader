/**
 * Global identity-resolution middleware.
 *
 * Resolves the authenticated caller from `Authorization: Bearer <jwt>`
 * and attaches `req.claims` + `req.user` BEFORE audit and rate-limit
 * middleware run, so those layers see real tier/tenant context instead of
 * falling back to the FREE/anonymous default.
 *
 * Contract:
 * - NEVER rejects a request — authorization is enforced per-route
 *   (assertTenantAccess, requireAdminKey, tier gates).
 * - Missing/invalid token → request continues as anonymous (FREE tier).
 * - No JWT_SECRET configured → single-operator mode, anonymous identity.
 *
 * JWT format: HS256, payload `{ sub, email, role, tenantId, tier }`.
 * Self-contained HMAC verification — no dependency on workers-scoped utils.
 */
import type { Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Claims attached to authenticated requests (CashClaw JWT format). */
export interface AuthClaims {
  sub?: string;
  email?: string;
  role?: string;
  tenantId?: string;
  tier?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      claims?: AuthClaims;
      user?: {
        id: string;
        tenantId?: string;
        tier?: string;
        role?: string;
      };
    }
  }
}

// ─── JWT verification (HS256, self-contained) ────────────────────────────────

function b64urlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

/** Verify an HS256 JWT against a secret; returns payload or null. */
export function verifyJwt(token: string, secret: string): AuthClaims | null {
  try {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;

    const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    const provided = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (provided.length !== expectedBuf.length || !timingSafeEqual(provided, expectedBuf)) {
      return null;
    }

    const payload = JSON.parse(b64urlDecode(body)) as Record<string, unknown>;
    if (typeof payload.exp === 'number' && payload.exp < Date.now() / 1000) return null;

    const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
    return {
      sub: str(payload.sub),
      email: str(payload.email),
      role: str(payload.role),
      tenantId: str(payload.tenantId),
      tier: str(payload.tier),
    };
  } catch {
    return null;
  }
}

// ─── Middleware ──────────────────────────────────────────────────────────────

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const claims = verifyJwt(authHeader.slice(7).trim(), secret);
      if (claims) {
        req.claims = claims;
        // req.user requires an id (canonical type from marketplace helpers).
        // No sub → keep req.user undefined; routes fall back to anonymous.
        if (claims.sub) {
          req.user = {
            id: claims.sub,
            tenantId: claims.tenantId ?? claims.sub,
            tier: claims.tier?.toUpperCase() ?? 'FREE',
            role: claims.role,
          };
        }
      }
    }
  } catch {
    // Identity resolution must never block a request; routes enforce authz.
  }
  next();
}
