# Phase 01 — Type system + legacy alias parser

**Priority:** P0 (blocks all other phases)
**Status:** pending

## Goal

Replace `LicenseTier.ENTERPRISE` with `STARTER` + `GROWTH` in the enum, add new key prefixes, and introduce a single `normalizeTier()` helper that maps legacy values (`'ENTERPRISE'`, `'rep-'` keys) to GROWTH.

## Files to modify

- `src/types/license.ts` — enum + add `normalizeTier()` exported helper

## Changes

### `src/types/license.ts`

```typescript
export enum LicenseTier {
  FREE = 'FREE',
  STARTER = 'STARTER',
  PRO = 'PRO',
  GROWTH = 'GROWTH',
}

// Legacy aliases — strings that may appear in persisted state, IPN payloads,
// or old license keys. ENTERPRISE → GROWTH (renamed 2026-05-21, R-10).
const LEGACY_TIER_ALIASES: Record<string, LicenseTier> = {
  ENTERPRISE: LicenseTier.GROWTH,
  enterprise: LicenseTier.GROWTH,
};

/**
 * Normalise a tier string (from JSON store, KV, webhook payload, or env)
 * to the current LicenseTier enum value. Accepts legacy strings.
 */
export function normalizeTier(value: string | LicenseTier | undefined | null): LicenseTier {
  if (!value) return LicenseTier.FREE;
  const upper = String(value).toUpperCase();
  if (upper in LicenseTier) return LicenseTier[upper as keyof typeof LicenseTier];
  return LEGACY_TIER_ALIASES[upper] ?? LicenseTier.FREE;
}
```

`License`, `CreateLicenseInput`, `LicenseFilters`, `LicenseAnalytics.byTier` all keep `LicenseTier` references — they automatically pick up the new enum values.

## Implementation steps

1. Edit `src/types/license.ts`:
   - Replace enum body.
   - Add `LEGACY_TIER_ALIASES` const.
   - Add `normalizeTier()` exported function.
2. Run `npx tsc --noEmit` — expect many errors in Phase 02 / 03 / 06 files; that's the to-do list for those phases. Errors in `src/types/` itself must be 0.

## Acceptance

- [ ] `LicenseTier.ENTERPRISE` no longer exists.
- [ ] `LicenseTier.STARTER` and `LicenseTier.GROWTH` exist.
- [ ] `normalizeTier('ENTERPRISE')` returns `LicenseTier.GROWTH`.
- [ ] `normalizeTier('enterprise')` returns `LicenseTier.GROWTH`.
- [ ] `normalizeTier('PRO')` returns `LicenseTier.PRO`.
- [ ] `normalizeTier(undefined)` returns `LicenseTier.FREE`.
- [ ] `src/types/license.ts` compiles cleanly (`tsc --noEmit` against just that file).

## Risk

- Removing `ENTERPRISE` from enum breaks all downstream code at compile time — intentional. Compile errors form the work-queue for Phase 02-06.
