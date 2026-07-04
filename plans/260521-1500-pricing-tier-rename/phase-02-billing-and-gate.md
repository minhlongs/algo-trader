# Phase 02 — Billing services + feature gate

**Priority:** P0
**Status:** pending
**Depends on:** Phase 01

## Goal

Update billing + gate code paths to:
- Support 4 tiers (FREE/STARTER/PRO/GROWTH).
- Price PRO at $149, GROWTH at $399, STARTER at $49.
- Accept legacy `rep-` license keys as GROWTH (via `normalizeTier`).

## Files to modify

| File | Change |
|------|--------|
| `src/billing/license-service.ts` | TIER_PREFIXES: add `STARTER → rss`, rename `rep → rgw` (GROWTH). `getDefaultMaxUsage`: add STARTER=1000, GROWTH replaces ENTERPRISE=100000. Add legacy `rep-` parser branch. Call `normalizeTier` when loading from JSON. |
| `src/billing/nowpayments-service.ts` | Add `STARTER` entry ($49, env `NOWPAYMENTS_INVOICE_STARTER`). Rename `ENTERPRISE` entry → `GROWTH` ($399, env `NOWPAYMENTS_INVOICE_GROWTH`, fallback to legacy `NOWPAYMENTS_INVOICE_ENTERPRISE`). Update PRO price 99 → 149. Re-key the record by `LicenseTier`. |
| `src/middleware/feature-gate.ts` | Type `Tier = 'FREE' | 'STARTER' | 'PRO' | 'GROWTH'`. `TIER_HIERARCHY`: FREE=0, STARTER=1, PRO=2, GROWTH=3. `FEATURE_ACCESS`: change `'ENTERPRISE'` → `'GROWTH'`. |
| `src/middleware/license-validation.ts` | Replace any `ENTERPRISE` literals with `GROWTH`. Normalise input via `normalizeTier`. |
| `src/gate/raas-gate.ts` | Replace `ENTERPRISE` references. Run license tier through `normalizeTier`. |
| `src/gate/validators.ts` | Tier validation list → add STARTER/GROWTH, drop ENTERPRISE. |
| `src/gate/errors.ts` | Update tier-mismatch error messages. |
| `src/gate/config/tier-config.ts` | Add STARTER + GROWTH config rows, drop ENTERPRISE. |
| `src/billing/overage-calculator.ts` | Update tier-keyed overage prices. |
| `src/billing/revenue-analytics.ts` | Add STARTER/GROWTH to revenue rollup; remove ENTERPRISE key. |
| `src/billing/usage-metering.ts` | Update tier quotas table. |
| `src/billing/onboarding-service.ts` | Update tier list. |
| `src/metering/usage-metering-service.ts` | Quotas + overage prices for new tiers (R-26 hardcoded prices stay hardcoded for now). |

## Key snippets

### `nowpayments-service.ts` (replacement)

```typescript
export const NOWPAYMENTS_TIERS: Record<string, NowPaymentsTierConfig> = {
  STARTER: {
    tier: LicenseTier.STARTER,
    invoiceId: process.env.NOWPAYMENTS_INVOICE_STARTER || '',
    price: 49,
    currency: 'USD',
    name: 'Starter',
  },
  PRO: {
    tier: LicenseTier.PRO,
    invoiceId: process.env.NOWPAYMENTS_INVOICE_PRO || '',
    price: 149,
    currency: 'USD',
    name: 'Pro Trader',
  },
  GROWTH: {
    tier: LicenseTier.GROWTH,
    invoiceId:
      process.env.NOWPAYMENTS_INVOICE_GROWTH
      || process.env.NOWPAYMENTS_INVOICE_ENTERPRISE  // legacy env-var fallback
      || '',
    price: 399,
    currency: 'USD',
    name: 'Growth',
  },
};
```

### `license-service.ts` TIER_PREFIXES + legacy parse

```typescript
const TIER_PREFIXES: Record<LicenseTier, string> = {
  [LicenseTier.FREE]: 'free',
  [LicenseTier.STARTER]: 'rss',
  [LicenseTier.PRO]: 'rpp',
  [LicenseTier.GROWTH]: 'rgw',
};

const LEGACY_KEY_PREFIXES: Record<string, LicenseTier> = {
  rep: LicenseTier.GROWTH,  // pre-rename ENTERPRISE keys
};
```

`loadFromFile()` must call `normalizeTier(entry.tier)` for each loaded license so persisted `'ENTERPRISE'` strings resolve.

### `feature-gate.ts` (replacement core)

```typescript
type Tier = 'FREE' | 'STARTER' | 'PRO' | 'GROWTH';

const TIER_HIERARCHY: Record<Tier, number> = {
  FREE: 0,
  STARTER: 1,
  PRO: 2,
  GROWTH: 3,
};

export const FEATURE_ACCESS: Record<string, Tier> = {
  'signals.crossmarket': 'PRO',
  'signals.deltaneutral': 'PRO',
  'intelligence.semantic': 'PRO',
  'intelligence.swarm': 'GROWTH',
  'analytics.advanced': 'PRO',
  'execution.multileg': 'GROWTH',
  'vibe.controller': 'PRO',
};
```

## Implementation steps

1. Edit each file in the table above.
2. After each file edit, run `npx tsc --noEmit src/<file>` to verify it.
3. Final: full `npx tsc --noEmit` — Phase 03 files will still error; that's expected.
4. Spot-run `npm test -- src/gate/__tests__/raas-gate.test.ts` to see what tests need updating (Phase 06).

## Acceptance

- [ ] All listed files compile.
- [ ] `NOWPAYMENTS_TIERS.STARTER.price === 49`, `PRO === 149`, `GROWTH === 399`.
- [ ] `TIER_PREFIXES` has 4 entries; no `ENTERPRISE`/`rep`.
- [ ] `LEGACY_KEY_PREFIXES.rep === LicenseTier.GROWTH`.
- [ ] `feature-gate.FEATURE_ACCESS` has zero `'ENTERPRISE'` literals.
- [ ] Backward-compat: a license object `{tier: 'ENTERPRISE'}` loaded from `data/licenses.json` normalises to `LicenseTier.GROWTH` at runtime.

## Risk

- `getDefaultMaxUsage` switch statement must exhaust all enum values (TS will flag the missing branch on build → safety net).
