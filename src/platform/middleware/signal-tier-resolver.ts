// Extend Express Request with subscriber property (set by requireSignalTier middleware)
declare module 'express' {
  interface Request {
    subscriber?: { subscriberId: string; tier: string };
  }
}
/**
 * Shared signal-tier resolution helpers.
 *
 * Extracted from inline copies in signals-api-routes.ts and
 * signal-subscription-routes.ts so that all signal routers use
 * one canonical auth + tier check.
 *
 * Tier mapping: platform LicenseTier -> signals-visible TierKey.
 * ENTERPRISE => ENTERPRISE, PRO => PRO, everything else => FREE.
 */

import type { Request, Response, NextFunction } from 'express';
import type { License } from '../../shared/types/license';
import { LicenseTier } from '../../shared/types/license';
import RaasGate from '../../desk/gate/raas-gate';
import type { TierKey } from '../../desk/signal/signal-types';

/** Ordinal ranking for tier comparison — higher = more privileged. */
const TIER_RANK: Record<TierKey, number> = {
  FREE: 0,
  PRO: 1,
  ENTERPRISE: 2,
};

// ---------------------------------------------------------------------------
// Injectable gate — tests call setGate() to inject a mock instance
// ---------------------------------------------------------------------------
type GateApi = { validateApiKey: (key: string) => License | null };
let _gate: GateApi | null = null;

/** Internal: get the gate (instance or injected mock). */
function getGateInstance(): GateApi {
  if (_gate) return _gate;
  return RaasGate.getInstance() as unknown as GateApi;
}

/**
 * Inject a mock gate for tests. Pass null to reset to the real singleton.
 * Production code never calls this.
 */
export function __setGate(gate: GateApi | null): void {
  _gate = gate;
}

/** Map platform LicenseTier to signals-visible TierKey. */
function mapLicenseTier(license: License): TierKey {
  if (license.tier === LicenseTier.ENTERPRISE) return 'ENTERPRISE';
  if (license.tier === LicenseTier.PRO) return 'PRO';
  return 'FREE';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract subscriber identity and signals tier from the Bearer token header.
 *
 * Returns null when the header is missing, not a Bearer token,
 * or the API key is rejected by RaasGate.
 */
export function resolveSubscriberId(req: Request): { subscriberId: string; tier: TierKey } | null {
  const authHeader = req.headers.authorization ?? '';
  const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!apiKey) return null;

  const license = getGateInstance().validateApiKey(apiKey);
  if (!license) return null;

  const tier = mapLicenseTier(license);
  const subscriberId = license.userId ?? license.id;
  return { subscriberId, tier };
}

/**
 * Express middleware factory: enforce minimum signals tier.
 *
 * Reads the Bearer token from the request, resolves the subscriber
 * via RaasGate, and checks the mapped signals tier against `minTier`.
 *
 * On success: attaches `req.subscriber = { subscriberId, tier }` and calls next().
 * On failure: sends 403 JSON and does NOT call next().
 */
export function requireSignalTier(minTier: TierKey) {
  const required = TIER_RANK[minTier];

  return (req: Request, res: Response, next: NextFunction): void => {
    const identity = resolveSubscriberId(req);
    if (!identity) {
      res.status(403).json({ error: 'Insufficient tier' });
      return;
    }

    const userRank = TIER_RANK[identity.tier] ?? 0;
    if (userRank < required) {
      res.status(403).json({ error: 'Insufficient tier' });
      return;
    }

    req.subscriber = identity;
    next();
  };
}
