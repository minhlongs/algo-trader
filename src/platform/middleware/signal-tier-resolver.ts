// Extend Express Request with subscriber property (set by requireSignalTier middleware)
declare module 'express' {
  interface Request {
    subscriber?: { subscriberId: string; tier: string };
  }
}

import type { Request, Response, NextFunction } from 'express';
import type { License } from '../../shared/types/license';
import { LicenseTier } from '../../shared/types/license';
import type { TierKey } from '../../desk/signal/signal-types';
import RaasGate from '../../desk/gate/raas-gate';

/** Minimal gate interface — matches RaasGate's public contract for lazy loading */
interface RaaSGateLike {
  validateApiKey(apiKey: string): License | undefined;
}

/** Ordinal ranking for tier comparison */
const TIER_RANK: Record<TierKey, number> = {
  ENTERPRISE: 3,
  PRO: 2,
  FREE: 0,
};

let _gate: RaaSGateLike | null = null;
function getGate(): RaaSGateLike | null {
  if (!_gate) {
    _gate = RaasGate.getInstance();
  }
  return _gate;
}

export function __setGate(gate: RaaSGateLike | null): void {
  _gate = gate;
}

export function resolveSubscriberId(req: Request): { subscriberId: string; tier: TierKey } | null {
  const auth = (req.headers.authorization || '').trim();
  const apiKey = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!apiKey) return null;

  const license: License | undefined = getGate()?.validateApiKey(apiKey);
  if (!license) return null;

  const tier: TierKey =
    license.tier === LicenseTier.ENTERPRISE
      ? 'ENTERPRISE'
      : license.tier === LicenseTier.PRO
        ? 'PRO'
        : 'FREE';

  return { subscriberId: license.userId ?? license.id, tier };
}

export function requireSignalTier(minTier: TierKey) {
  return (req: Request, res: Response, next: NextFunction) => {
    const identity = resolveSubscriberId(req);
    if (!identity) {
      return res.status(403).json({ error: 'Valid API key required' });
    }
    if ((TIER_RANK[identity.tier] ?? -1) < (TIER_RANK[minTier] ?? -1)) {
      return res.status(403).json({
        error: `${identity.tier} tier cannot access ${minTier} features`,
        upgrade: 'https://cashclaw.cc/pricing',
      });
    }
    req.subscriber = identity;
    next();
  };
}
