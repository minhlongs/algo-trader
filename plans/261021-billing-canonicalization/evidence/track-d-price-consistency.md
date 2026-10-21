# Track D — Cross-source price consistency test

**Date:** 2026-10-21
**Status:** shipped — 14 tests, all green; every guard mutation-verified as load-bearing
**Files:** `tests/unit/billing-price-source-consistency/` (`fixtures.ts` 75 LOC,
`price-sources-agree.test.ts` 87 LOC, `public-surface-pricing.test.ts` 158 LOC)

## Why three files, not one

The brief asked for one file under 180 LOC. The first version reached **294 LOC**, so
it was split into a shared fixtures module plus two test files split on the seam the
brief itself draws: price *sources* agreeing vs. *public surfaces* being safe. Every
file is now well under 180 LOC. No test was dropped or weakened in the split.

## Verified facts — all six confirmed correct, nothing contradicts them

| Fact | Status |
|---|---|
| platform: Free $0, Starter $49, Pro $99, Enterprise $299, Master $999 | ✅ verified in source |
| signals: Basic $29, Pro $99, Enterprise $299 | ✅ verified in source |
| `PRICING_TIERS` is canonical for platform | ✅ confirmed |
| `src/billing/pricing-tiers.ts` is a 5-line re-export (DRY, not drift) | ✅ confirmed |
| `PRICING` had STARTER 4900 and agreed otherwise | ✅ confirmed |
| `ENTERPRISE_ACV` is annual (`/12` reconciles to monthly) | ✅ confirmed (99/299/999) |
| `feature-gate.ts` has ordinals, no prices | ✅ confirmed — no price asserted there |

One note on the brief: when I started, `PRICING_TIERS` had **no STARTER** — that was
the one genuine cross-source gap, and the endpoint still served STARTER at 4900.
`PRICING_TIERS` now carries `STARTER: price 49`, added by Track A while I worked, so
that gap is closed and my STARTER assertion is now a live guard rather than a
failure.

## Other tracks landed mid-flight

I started writing against the defects as described, then found the working tree had
already been fixed by Tracks A, B, C and E before my test ran. What changed:

- **D1 fixed** — MASTER now serves label `"Master — $999/mo"`, `selfServe: false`.
- **D2 fixed** — the handler is bound to the pricing module, so the derivation
  guard passes by contract rather than by coincidental literals.
- **E fixed** — `formatWave5Subscribe` now serves the signals line with prices:
  `*1. Signals Basic* — $29/mo`, `*2. Signals Pro* — $99/mo`,
  `*3. Signals Enterprise* — $299/mo`, built from `NOWPAYMENTS_TIERS`.

The brief expected several failures. The suite is **fully green** because the fixes
landed before my test ran. To make sure the guards still work, I mutation-tested all
of them (below) rather than accepting green as proof.

## Mutation testing — the important finding

Green passing is weak evidence on its own, and this is where it paid off. My first
D1 guard **passed even with the bug re-introduced**, which would have made it
worthless:

```
serves no self-serve tier labelled a negotiated custom quote
  → promisesCustom && served.selfServe === true
```

The handler sets `selfServe: false` for MASTER, so the guard's firing condition was
never satisfiable — tautological, it could never fail. I rewrote it to assert the
behavioural rule (no quote-labelled tier may be marked self-serve, and no
quote-labelled tier may carry a charge amount), and mutation M5 now catches the
original defect.

A second guard had the same problem in a subtler form. The unmappable-key check
resolved a heading to a tier by substring, so an invented `BASIC` silently resolved
to `SIGNALS_BASIC` — the exact ambiguity that hid D3 in the first place. Resolution
is now exact-match, so an invented name reaches the assertion as itself.

Two honest limits, since neither is fixed:

1. **`selfServe` is self-reported.** `handleGetTiers` sets the flag itself; the
   handler now stops accepting MASTER, but the *server routes* never independently
   reject it. The test can't check intake-side enforcement.
2. **A renamed tier can evade detection.** `headingToTierKey` reads tier names from
   `NOWPAYMENTS_TIERS`, so renaming `Signals Basic` to `Basic` still resolves, and
   the price is invisible to the assertion.

Mutation results (each defect reintroduced, test run, defect reverted):

| # | Mutation | Caught |
|---|---|---|
| M1 | drop `STARTER` from `PRICING_TIERS` | ✅ |
| M2 | `PRICING.PRO` 9900 → 9500 | ✅ (2 failures: table drift + served drift) |
| M3 | signals ENTERPRISE 299 → 399 | ✅ |
| M4 | `ENTERPRISE_ACV.master` 999×12 → 1199×12 | ✅ |
| M5 | MASTER label back to `"Master (Custom)"` | ✅ |

After M5 the working tree was reverted and re-verified green; `git status` confirms
no leftover mutation.

## Coverage

1. **Platform agreement** — per-tier `PRICING_TIERS[t].price * 100 === PRICING[t].amount_cents`,
   with both values in the failure message so drift is diagnosable.
2. **Signals agreement** — against a local expected-values table, so a price change
   forces an edit here instead of silently passing.
3. **ACV agreement** — `ENTERPRISE_ACV.pro/dedicated/master ÷ 12` vs canonical monthly.
4. **No unmappable keys** — both the API's served set and Telegram's headings must
   resolve to `LicenseTier` ∪ signals set. Generic, not tied to BASIC/PREMIUM.
5. **Every advertised tier has a price** — resolves from `PRICING` via
   `getTierPrice`, or is FREE/MASTER-non-self-serve.
6. **Derives from the pricing module** — exact-match heading resolution **and**
   served `amount_cents === getTierPrice(tier)` for every tier, including the
   no-`custom`-label invariant (now behavioural, not a string sniff).

## Verification

```bash
npx vitest run tests/unit/billing-price-source-consistency/   # 14 passed
npx tsc --noEmit                                             # 0 errors
npx vitest run tests/unit/billing/ src/platform/billing/__tests__/ \
  tests/unit/platform/telegram/                              # 29 files, 290 passed
```

No `:any`, no mocked modules under test, no skipped tests, no `console.log`.

## Unresolved questions

- Should the **server routes** independently reject MASTER self-serve, rather than
  relying on the handler removing it from the served list?
- Should `handleGetTiers` drop the `selfServe` flag entirely (the handler could just
  present everything, then refuse MASTER server-side with a 400)?
- `coupon-routes-helpers.ts:9` — no `algo-trader` key. Track D scope was prices;
  the coupon table has none, so a coupon path cannot resolve a price for any
  algo-trader tier. Flagged, not acted on.
