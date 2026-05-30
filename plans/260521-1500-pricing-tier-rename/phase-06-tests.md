# Phase 06 — Tests

**Priority:** P0 (gate to ship)
**Status:** pending
**Depends on:** Phase 02 + 03

## Goal

All existing tests pass after the rename. Add one new test for the legacy-alias path.

## Files to modify

| File | Change |
|------|--------|
| `src/gate/__tests__/raas-gate.test.ts` | Replace `'ENTERPRISE'` literals with `'GROWTH'`. Add legacy-key test: assert `rep-`-prefixed key resolves to GROWTH. |
| `src/signal/__tests__/signal-tier-filter.test.ts` | Update tier expectations: 4 tiers instead of 3. |
| `src/signal/__tests__/telegram-signal-pusher.test.ts` | Update tier-routing expectations. |
| `src/audit/__tests__/audit-log-service.test.ts` | Update any `tier: 'ENTERPRISE'` test fixtures. |

## New test

Add to `src/types/__tests__/license-normalize.test.ts` (create file):

```typescript
import { describe, it, expect } from 'vitest';
import { LicenseTier, normalizeTier } from '../license';

describe('normalizeTier', () => {
  it('maps legacy ENTERPRISE → GROWTH', () => {
    expect(normalizeTier('ENTERPRISE')).toBe(LicenseTier.GROWTH);
  });
  it('handles lowercase legacy enterprise', () => {
    expect(normalizeTier('enterprise')).toBe(LicenseTier.GROWTH);
  });
  it('passes through current enum values', () => {
    expect(normalizeTier('PRO')).toBe(LicenseTier.PRO);
    expect(normalizeTier('STARTER')).toBe(LicenseTier.STARTER);
    expect(normalizeTier('GROWTH')).toBe(LicenseTier.GROWTH);
    expect(normalizeTier('FREE')).toBe(LicenseTier.FREE);
  });
  it('defaults undefined/null/empty to FREE', () => {
    expect(normalizeTier(undefined)).toBe(LicenseTier.FREE);
    expect(normalizeTier(null)).toBe(LicenseTier.FREE);
    expect(normalizeTier('')).toBe(LicenseTier.FREE);
  });
  it('defaults unknown strings to FREE (no throw)', () => {
    expect(normalizeTier('PLATINUM')).toBe(LicenseTier.FREE);
  });
});
```

Add to `src/billing/__tests__/license-key-legacy.test.ts` (create file if missing — verify dir first):

```typescript
import { describe, it, expect } from 'vitest';
import { LicenseService } from '../license-service';
import { LicenseTier } from '../../types/license';

describe('LicenseService legacy key parsing', () => {
  it('resolves rep- prefix key to GROWTH tier on read', () => {
    // Simulate persisted license with old prefix + old tier string
    const svc = LicenseService.getInstance();
    // Implementation detail: add helper method or test via getLicenseByKey
    // (Skip if the service doesn't expose key parsing publicly — covered by raas-gate test.)
  });
});
```

(If `LicenseService` doesn't expose key parsing publicly, drop the second test — `raas-gate.test.ts` legacy-key assertion covers it.)

## Implementation steps

1. Run `npm test 2>&1 | tee /tmp/test-output.txt` — capture full failure list.
2. Sweep failures: replace `ENTERPRISE` literals with appropriate new tier.
3. Add new test files above.
4. Re-run `npm test` until green.
5. Run `npm run build` — must be 0 errors.

## Acceptance

- [ ] `npm test` exits 0.
- [ ] New `normalizeTier` test suite passes.
- [ ] Legacy `rep-` key test passes (via `raas-gate.test.ts` or dedicated file).
- [ ] `npm run build` exits 0.
- [ ] `grep -rn "ENTERPRISE" src/` returns ONLY:
  - `src/types/license.ts` (in the LEGACY_TIER_ALIASES map)
  - test files asserting the legacy mapping
  - no other matches

## Risk

- A test may depend on `LicenseTier.ENTERPRISE` as a TS enum member — that will be a hard compile error, easy to find and fix.
- Snapshot tests with `'ENTERPRISE'` string in JSON may need snapshot updates: `npx vitest -u`.
