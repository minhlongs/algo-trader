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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../gate/raas-gate') as { default?: { getInstance?(): RaaSGateLike } };
    // Resolve the singleton — module may export as default or named
    const exporter = (mod.default ?? mod) as { getInstance?(): RaaSGateLike };
    _gate = exporter.getInstance?.() ?? null;
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
