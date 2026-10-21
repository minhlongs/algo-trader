# Track E — Telegram tier list: real keys + real prices

**Date:** 2026-10-21
**Files owned:** `src/platform/telegram/handlers/wave5-routes.ts`,
`tests/unit/platform/telegram/wave5-command-handler.test.ts`
**Status:** Complete — implementation + tests green.

---

## What changed

### 1. `src/platform/telegram/handlers/wave5-routes.ts`

`formatWave5Subscribe()` no longer advertises the unmappable `BASIC` / `PREMIUM`
tiers, and no longer shows zero prices.

- Added `import { NOWPAYMENTS_TIERS, type NowPaymentsTierConfig } from '../../billing/nowpayments-types'`.
- Added three module-level helpers, all above the existing `Wave5Telemetry` interface:
  - `SIGNALS_TIER_KEYS` — ordered keys `SIGNALS_BASIC`, `SIGNALS_PRO`, `SIGNALS_ENTERPRISE`.
  - `SIGNALS_TIER_FEATURES` — feature copy kept keyed by tier key (the copy itself is not price-bearing, so
    it stays as literals; only *name* and *price* are derived).
  - `resolveSignalsTier(key)` — hasOwnProperty-guarded lookup; returns `undefined` for an unknown key.
  - `formatSignalsTierBlocks()` — `flatMap`s the ordered keys into numbered, priced blocks; a tier that
    cannot be resolved is dropped rather than listed.
- Tier headings became `` `*${index + 1}. ${tier.name}* — $${tier.price}/mo` ``.
- Added one bilingual selector line (`*[EN]* Choose your signals plan / *[VN]* Chọn gói tín hiệu phù hợp với bạn:`)
  so the list still carries the EN/VN paired format the rest of the file uses.
- **Unchanged by design:** `/link <license-key>` CTA, `https://cashclaw.cc`, the USDT TRC20 + NOWPayments
  sentence, the `.join('\n')` array style, and the exported signature `formatWave5Subscribe(): string`.

Both prices and names now come from the pricing module, so a price change requires no edit here.

### 2. `tests/unit/platform/telegram/wave5-command-handler.test.ts`

Replaced the `it('formats subscription tiers with BASIC, PREMIUM, MASTER options')` block. New title:
`'formats subscription tiers with the real signals tiers and their prices'`. Assertions:

1. **Real tier names** — for each of the three signals keys, `expect(tier).toBeDefined()` (fails loudly if the
   key leaves the pricing table) then `expect(text).toContain(tier.name)`.
2. **Each real price** — `expect(text).toContain(`$${tier.price}`)`, derived from `NOWPAYMENTS_TIERS[key].price`
   rather than hardcoded, so the test tracks the source.
3. **No unmappable tier key** — a new local helper `hasBareLabel(text, label)` uses
   `(?<![A-Z_])LABEL(?![A-Z_])` so the legitimate `SIGNALS_BASIC` key cannot mask a bare `BASIC`:
   - `expect(hasBareLabel(text, 'BASIC')).toBe(false)`
   - `expect(hasBareLabel(text, 'PREMIUM')).toBe(false)`
   Verified in both directions — matches `*1. BASIC*` (old text), does not match `1. Signals Basic` (new text).
4. **Surface preserved** — `NOWPayments`, `USDT TRC20`, `Gói Dịch Vụ`, `Tín hiệu`, `/link <license-key>`,
   `https://cashclaw.cc`.

No other test in that file was weakened or removed; the `handleWave5SubscribeRoute` route test still asserts
`stringContaining('Subscription')` and passes unchanged.

---

## New rendered output

```
💎 *Subscription Tiers / Các Gói Dịch Vụ*

*[EN]* Choose your signals plan / *[VN]* Chọn gói tín hiệu phù hợp với bạn:

*1. Signals Basic* — $29/mo
• Daily Signals / Tín hiệu hàng ngày: 5
• Strategy Swarm: Haiku engine
• Quota: 10,000 API calls/day

*2. Signals Pro* — $99/mo
• Unlimited Signals / Tín hiệu không giới hạn
• Strategy Swarm: Sonnet + Haiku engine
• Quota: 100,000 API calls/day

*3. Signals Enterprise* — $299/mo
• Full Autonomy Swarm (Opus + Sonnet + Haiku)
• Dedicated Webhook & Custom Capital Allocator
• Unlimited API calls & 24/7 Priority Support

💳 Upgrade now: `/link <license-key>` or visit https://cashclaw.cc
Hỗ trợ thanh toán USDT TRC20 qua NOWPayments.
```

---

## Verification

```bash
cd /Users/macbook/algo-trader
npx tsc --noEmit                              # 0 errors, clean
npx vitest run tests/unit/platform/telegram/  # 6 files passed / 115 tests passed
```

Per-test isolation of the updated case:
`npx vitest run tests/unit/platform/telegram/wave5-command-handler.test.ts --no-cache` → 115 passed.

Rules check on both owned files: no `:any`, no `console.log`, 166 LOC (source) / 189 LOC (test) — both
inside the 200-LOC governance ceiling.

---

## Cross-track interaction (important)

Track D's `tests/unit/billing-price-source-consistency.test.ts` imports `formatWave5Subscribe` and parses
its **bold headings** to assert no unmappable tier key is advertised. Two notes:

1. **A stale Vitest transform cache** made Track D report `no tier keys found to check` against my new
   Title-Case headings. `rm -rf node_modules/.vite node_modules/.vitest` resolves it — the extraction
   works on the real output (`1. Signals Basic` → `signals basic` → `SIGNALS_BASIC`). Worth flagging to
   whoever runs the full suite: **clear the cache before trusting a Track D failure.**
2. Before my change that Track D test was **already failing** with `Telegram subscribe advertises "BASIC"`
   — this was the D3 defect itself. My change is what makes that assertion pass.

### Remaining failure in Track D's file — NOT mine

`PRICING_TIERS carries the intended platform price for every advertised tier` →
`AssertionError: PRICING_TIERS is missing STARTER`.

- Confirmed present on a **clean baseline** (my changes stashed) — pre-existing, not a regression.
- Root cause: `src/platform/billing/pricing-tiers.ts` has no `STARTER` entry
  (`git diff --stat` on that file is empty — no track has edited it yet).
- Fix belongs to **Track A, Phase A step 1** ("the canonical table gains STARTER at $49"). Once that lands,
  this test goes green with no further change from me.

---

## Report-only finding (out of scope, untouched)

`src/platform/telegram/auto-support-handlers.ts:87` contains a `*CashClaw Pricing*` message advertising
`Starter — $49/mo`, `Pro — $149/mo`, `Elite — $499/mo` with no product-line qualifier. `Elite` is not a
tier key in `LicenseTier`, `PRICING_TIERS`, or `NOWPAYMENTS_TIERS`, and `Pro $149` disagrees with the
canonical `Pro $99`. It is a different customer-facing surface from the one in my scope, so per
instructions I am reporting it and leaving it unchanged. Track A or a follow-up should own it.

---

## Unresolved questions

- `Auto-support-handlers` pricing surface: is `Elite` a real sellable tier or dead copy that should be
  retired? Needs the user's call on the product line before anyone edits it.
- Confirm with Track A that `STARTER` at $49 is the value they land, so the platform and signals lines
  never collide in the served payload.
