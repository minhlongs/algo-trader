# ADR 002: Tier Gating Strategy

**Date:** 2026-06-30  
**Status:** Accepted  
**Deciders:** Solo operator

## Context

The RaaS platform exposes 31+ API route files serving three subscriber tiers:
- **FREE** — basic signal browsing, marketplace viewing
- **PRO** — backtesting, signal feeds, AI audit, strategy publishing
- **ENTERPRISE** — admin controls, revenue analytics, audit logs, license management

Without systematic tier gating, any authenticated subscriber could access any endpoint regardless of their subscription level.

## Decision

Apply tier gating on ALL platform API routes using a middleware pattern:

**Express routes** — `requireTier('TIER')` middleware function:
```typescript
// feature-gate.ts
const TIER_HIERARCHY: Record<Tier, number> = { FREE: 0, PRO: 1, ENTERPRISE: 2 };

export function requireTier(minTier: Tier) {
  return (req, res, next) => {
    const license = req.license; // set by upstream raas-gate
    if (!license) return res.status(401).json({ error: 'No license' });
    if (TIER_HIERARCHY[license.tier] < TIER_HIERARCHY[minTier]) {
      return res.status(403).json({ error: 'Insufficient tier', required: minTier });
    }
    next();
  };
}
```

**Fastify routes** — inline guard pattern (preHandler broke type inference):
```typescript
function requireTierGate(request, reply, minTier) {
  const userTier = request.getLicenseTier();
  if (!userTier) { reply.code(401).send(...); return false; }
  if (TIER_ORDER[userTier] < TIER_ORDER[minTier]) {
    reply.code(403).send(...); return false;
  }
  return true;
}
```

**Admin routes excluded** — routes using `requireAdminKey` (X-Admin-Key header) skip tier gating since admin auth is separate from subscriber licenses.

## Tier Assignments

| Tier | Routes |
|------|--------|
| FREE | signals, trades, pnl, marketplace strategy/review/subscription, analytics, credentials, personalization, coupons, onboarding |
| PRO | backtest, signal feed/ingest/subscription, xai, ai-audit, api-key, subscriber-pnl, marketplace dispute |
| ENTERPRISE | admin, revenue, referral, enterprise-inquiry, admin-marketplace, audit, license |

## Consequences

- All 103+ endpoints are tier-gated
- 401 Unauthorized for missing license, 403 Forbidden for insufficient tier
- Admin routes use separate auth (X-Admin-Key), not subscriber tokens
- Fastify routes use inline guards (type-safe alternative to preHandler)
