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

/** Ordinal ranking for tier comparison */
const TIER_RANK: Record<TierKey, number> = {
  ENTERPRISE: 3,
  PRO: 2,
  FREE: 0,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _gate: any = null;
function getGate() {
  if (!_gate) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = require('../gate/raas-gate') as any;
    _gate = (mod.default ?? mod)?.getInstance?.() ?? null;
  }
  return _gate;
}

export function __setGate(gate: any | null) {
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
