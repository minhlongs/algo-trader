# Phase 3 Signals Billing Audit — Findings

Scope: three suspected defects in the signals billing flow. Read-only investigation.
Branch `fix/signal-routes-tenant-isolation`; its four tenant-guard route changes excluded from "pre-existing" counting.
Type check: `pnpm exec tsc --noEmit` → exit 0, clean. No supertest suites run (sandbox forbids `listen()`).

## Summary

| # | Hypothesis | Verdict |
|---|---|---|
| 1 | A `SIGNALS_*` tier priced outside {29, 99, 299} that the IPN handler silently drops | **REFUTED** |
| 2 | `BASIC: 'FREE'` silently downgrades a paying customer | **CONFIRMED — but the mechanism is the opposite of the hypothesis** |
| 3 | Unauthenticated `/billing/stats` aggregates every tenant's subscription | **CONFIRMED** |

---

## Defect 1 — tier advertised but IPN refuses to grant

**Verdict: REFUTED.**

The stated precondition does not exist. Every `SIGNALS_*` key in `NOWPAYMENTS_TIERS` carries a price the handler recognises.

Full table — `src/platform/billing/nowpayments-types.ts:53-96` (re-exported through `nowpayments-service.ts:28` `export * from './nowpayments-types'`, which is what the two route files import):

| Key | price | handler maps to |
|---|---|---|
| `SIGNALS_BASIC` | 29 | BASIC |
| `SIGNALS_PRO` | 99 | PRO |
| `SIGNALS_ENTERPRISE` | 299 | ENTERPRISE |

`/billing/plans` filter `src/platform/api/routes/signal-subscription-checkout-handlers.ts:15` keeps exactly those three; the platform keys `PRO`/`ENTERPRISE`/`MASTER` are filtered out by the `SIGNALS_` prefix test, so `MASTER` at $999 is never advertised and never reaches the `sig_` IPN branch.

Checkout acceptance and dispatch agree:
- `checkoutBodySchema` accepts only `['SIGNALS_BASIC','SIGNALS_PRO','SIGNALS_ENTERPRISE']` — `src/platform/api/routes/signal-subscription-types.ts:12`.
- `handleBillingCheckout` prices the invoice from `tierConfig.price` — `signal-subscription-checkout-handlers.ts:60`.
- IPN routes `sig_`-prefixed orders to `handleSignalsIpnFinished` on `activate` — `src/platform/api/routes/webhooks/nowpayments-webhook.ts:76,81-87`.
- The alternate checkout `POST /api/v1/nowpayments/invoice` builds `license_{tier}_{ts}` — `src/platform/api/routes/nowpayments-api-routes.ts:62` — so it lands in the platform branch, not `isSignals`.

So no saleable Signals tier produces `paymentTier === null`.

**Why the premise looked plausible, and the residual gap.** The lookup is amount-keyed rather than tier-keyed (`signals-payment-handler.ts:48`), so it is positionally correct today but structurally brittle:

1. **Ambiguity is already live.** `SIGNALS_BASIC` ($29) and `SIGNALS_PRO` ($99) each have a *non-signals* twin at a similar price: `PRO` = 99 (`nowpayments-types.ts:56`) and `ENTERPRISE` = 299 (`:63`). `MASTER` = 999 has no signal twin, which is why a $999 invoice entering this handler *would* be dropped. The only discriminator is `order_id`, which already carries tier eligibility (`sig_` prefix) — the handler ignores it.
2. **The early return is confirmed to precede any write.** `signals-payment-handler.ts:49-52` returns at line 51; the first `upsert` is at line 60 (existing) or line 71 (new). No `upsert`, no `setActive`, no log beyond the warning. Money accepted, no subscription.
3. The same class of bug already fires in a sibling: with no `@` in `order_description`, `payment-handler.ts:32` buckets every Signals price into a *platform* invoice label — $29 → `'Starter'`, $99 → `'Pro'`. Invoice-label-only cosmetic impact, no entitlement effect.

**Impact today: none.** No customer-reachable path reaches the null branch. No test asserts the desired unrecognised-amount behaviour; the suite covers 29/99/299 plus an unrecognised `7` (`webhooks/handlers/__tests__/signals-payment-handler.test.ts:75,83,95,114`).

**Smallest correct fix** (only worth doing if hardening is in scope; nothing is broken): key the lookup off the tier encoded in `order_id` instead of the float amount, keep the amount check as a cross-check, and have the null branch record the payment for reconciliation rather than only logging. Since this is refuted as a defect, no fix is prescribed.

---

## Defect 2 — tier mapping silently downgrades a paying customer

**Verdict: CONFIRMED that `'FREE'` is a valid `TierKey` and is what gets stored — but the mechanism is the opposite of the hypothesis. The feed gate does not read the stored tier, so nothing is refused; what breaks instead is delivery quality, and the real blocker sits upstream in `resolveSubscriberId`.**

### Part A — the type/column question (hypothesis direction: correct)

`'FREE'` is a valid `TierKey`:
- `TierKey = keyof typeof TIER_SIGNAL_CONFIG` — `src/desk/signal/signal-types.ts:50`; the object spans `FREE | PRO | ENTERPRISE` (`:32-48`).
- `SignalSubscription.tier` — `signal-types.ts:25` — same union.
- `PAYMENT_TO_SIGNAL_TIER` is typed `Record<string, 'FREE' | 'PRO' | 'ENTERPRISE'>` — `signals-payment-handler.ts:42` — so the write type-checks. This is why `tsc` stays clean: the downgrade is *type-legal by construction*, not a suppressed cast.

**The DB CHECK that would have caught this is dead code.** `src/db/migrations/033-create-signal-subscriber-tables.ts:20` declares `tier VARCHAR(32) NOT NULL CHECK (tier IN ('FREE','PRO','ENTERPRISE'))` — which would have *accepted* `'FREE'` anyway. And 033 is not wired into the runner: `src/db/migration-runner.ts:8-14` imports 001, 002, 019, 020, 025, 026, 030 and never 033. No `import` anywhere references `create-signal-subscriber-tables`.

The live table is created at runtime by the repository with **no CHECK and a wider column** — `src/platform/signal/signal-subscriber-repository-d1.ts:47-55`: `tier VARCHAR(32) NOT NULL`. So `'FREE'` (and `'SIGNALS_PRO'`, had it been passed) writes without error.

`filterSignalsForTier` with `FREE` — `src/desk/signal/signal-tier-filter.ts:36-45`: latest-per-market daily digest, `sseEnabled: false`, `minConfidence: 0.7`, 24h window (`signal-types.ts:33-37`). A paying Basic customer's push collapses to one digest message per market per day.

### Part B — where it actually bites (hypothesis direction: wrong)

The feed gate does **not** read the stored tier. `requireSignalTier` and `resolveSubscriberId` both derive tier from the *license*, not the subscription row:
- `requireSignalTier` reads `req.license` and requires `SIGNAL_TIERS.includes(currentTier)` — `src/platform/middleware/feature-gate.ts:125-152`.
- `resolveSubscriberId` maps `LicenseTier` → `ENTERPRISE` / `PRO` / **`FREE`** with no `SIGNALS_*` case — `src/platform/middleware/signal-tier-resolver.ts:46-51`.
- `GET /feed` returns `tier: identity.tier`, license-derived — `src/platform/api/routes/signal-feed-api-routes.ts:42,52,63`.
- `handleGetSubscriptionStatus` reports `tier: identity.tier` and only reads `subscription?.active` for `subscribed` — `src/platform/mcp/signal-mcp-tools.ts:112-116`. The stored `tier` is never consulted.

So `requireSignalTier('SIGNALS_BASIC')` never consults the `'FREE'` row, and `filterSignalsForTier` never sees it on the feed path. The stated impact ("refused the feed they paid for") does **not** occur on that mechanism.

**Where it does bite:** the delivery loop reads the row directly.
- `signalPublisher.publish` → `store.getSubscriptions()` → `telegramSignalPusher.enqueue(signal, sub)` — `src/desk/signal/signal-publisher.ts:87-90`.
- `enqueue` reads `sub.tier as TierKey`, then `TIER_SIGNAL_CONFIG[tier].minConfidence` and `THROTTLE_MS[tier]` — `src/desk/signal/telegram-signal-pusher.ts:56-60`.
- The store maps straight from the row — `src/desk/signal/signal-store-d1.ts:87`.
- `TIER_RANK: Record<TierKey, number>` has no `SIGNALS_*` entry — `platform/mcp/signal-mcp-auth.ts:30-32` — so a signal tier written into this column would also silently rank 0.

**Concrete user-visible impact for a paying Signals Basic customer:** priced and delivered at the FREE tier. `TIER_SIGNAL_CONFIG.FREE` gives `sseEnabled: false`, `minConfidence: 0.7`, 24h throttle (`signal-types.ts:33-37`, `telegram-signal-pusher.ts:13`). They are not refused the feed on that path (refusal happens at the license layer — Part C); they get a degraded digest product.

### Part C — the actual blocker the hypothesis missed

`PAYMENT_TO_SIGNAL_TIER` maps *delivery* tiers, but the *gate* wants `SIGNALS_*`. Neither is ever granted:
- `PAYMENT_TO_SIGNAL_TIER` — `signals-payment-handler.ts:42-46` — keys `BASIC|PRO|ENTERPRISE`, writes `FREE|PRO|ENTERPRISE`.
- `handleSignalsIpnFinished` writes only the subscription row. Its sibling `handleIpnPaymentSuccess` records the payment and emails an invoice; it touches no license — `webhooks/handlers/payment-handler.ts:14-41`.
- `LicenseService`/`LicenseTier` have no `SIGNALS_*` member (`src/shared/types/license.ts:6`).
- `resolveSubscriberId` therefore yields `tier: 'FREE'` for every signal customer — `signal-tier-resolver.ts:46-51`.

Net: **a Signals Basic customer who just paid passes the IPN, then gets HTTP 403 from `requireSignalTier('SIGNALS_BASIC')` on `GET /api/v1/signals/feed`** — `signal-feed-api-routes.ts:35,73` — and equally on `POST /billing/checkout` (`signal-subscription-routes.ts:70-74`), so they cannot even re-enter checkout. `POST /subscriptions` writes `tier` straight from `identity.tier` (`signal-subscription-handlers.ts:100-107`), stamping `'FREE'` too.

The two enums are not just differently-named — `TIER_HIERARCHY` places signal tiers *below* FREE at 0.01–0.03 (`feature-gate.ts:30-40`), while `TIER_RANK` in the resolver has no signal tiers at all (`signal-tier-resolver.ts:20-24`). This domain was never unified across `@/seed/config/tiers`, the signal delivery tiers, and `LicenseTier`.

**Smallest correct fix** (this is the one that matters): give a Signals customer a gate-recognisable signal tier. Concretely, (a) add the `SIGNALS_*` members to `LicenseTier` and have the signals IPN branch grant them, and (b) extend `resolveSubscriberId`'s `LicenseTier` → `TierKey` mapping with the `SIGNALS_*` cases. Separately, map `BASIC` to a Basic *delivery* tier rather than `'FREE'` so push quality matches the $29 SKU. Better still, replace both price/delivery tables with one tier-keyed lookup — `SIGNALS_BASIC → {gate: 'SIGNALS_BASIC', delivery: 'PRO', price: 29}` — which also closes defect 1's brittleness.

---

## Defect 3 — unauthenticated endpoint aggregating every tenant's subscription

**Verdict: CONFIRMED.**

### Evidence

Route registration — `src/platform/api/routes/signal-subscription-routes.ts:75`:
```ts
signalSubscriptionRouter.get('/billing/stats', handleBillingStats);
```
No middleware. Contrast the same file: `POST /billing/checkout` carries `requireSignalTier('SIGNALS_BASIC')` (`:70-74`).

Handler — `src/platform/api/routes/signal-subscription-checkout-handlers.ts:86-100`:
- `:88` `signalSubscriberRepo.getActiveSubscriptions()` — repo runs `SELECT * FROM signal_subscriptions WHERE active = TRUE` with no tenant predicate — `src/platform/signal/signal-subscriber-repository-d1.ts:100-104`.
- `:95` `res.json({ data: breakdown })` — per-tier **counts across all tenants**.

The handler takes `_req` but never reads it — no bearer token, no `X-Admin-Key`, no tenant filter.

### No global auth layer rescues it

Mounted at `/api/v1/signals` — `src/platform/api/server-routes-core.ts:67`. Middleware runs before routes (`server.ts:59-60`, `:63-65` → `:67-78`), and both global middlewares pass anonymous through:
- `authMiddleware` — `src/platform/middleware/auth-middleware.ts:79-107` — calls `next()` when no `JWT_SECRET` (`:82-85`) and when no/invalid bearer (`:104-107`, comment at `:105`: "Identity resolution must never block a request"). It only ever *attaches* `req.user`/`req.claims`; it never rejects.
- `apiKeyLicenseMiddleware` — `src/platform/middleware/api-key-license.ts:22-27` — explicitly "continue as anonymous; requireTier will reject later". It reads `x-api-key`, not `Authorization`, and leaves `req.license` unset here.
- No `/api` path-level auth: `app.use('/api', limiter)` is rate-limiting only — `server-middleware.ts:61-62`.

So `req.license` is unset and `req.user` undefined for an anonymous caller.

### The repo's own guard pattern is applied to the sibling route but not this one

`handleListActiveSubscriptions` guards the *same* data with both caller identity and `requireAdminKey`:
```ts
signal-subscription-handlers.ts:47-56  // getCallerIdentity → 401; requireAdminKey → 403
```
`requireAdminKey` checks `X-Admin-Key` against `process.env.ADMIN_API_KEY` — `src/platform/api/middleware/require-admin-key.ts:5-16`.

So on this one router, `GET /subscriptions/active` is admin-gated while `GET /billing/stats` returns the same rows unauthenticated. The repo already has the correct guard; it is simply not applied here.

### Is the dashboard internal or customer-facing?

**Internal, by every signal in the repo.** References to `billing/stats` are exactly four places, none of them a client:

| Where | What |
|---|---|
| `src/platform/api/routes/signal-subscription-routes.ts:10` | Header comment "tier breakdown for dashboard" |
| `src/platform/api/routes/signal-subscription-routes.ts:75` | The route itself |
| `docs/openapi-signals-api.json:436-467` | Documented as `getBillingStats`, "Get tier breakdown for billing dashboard", `200` only + `500`. **No `security` requirement, no `401`/`403` response declared** |
| `src/platform/api/routes/__tests__/signal-subscription-routes-read.test.ts:104-122` | Two tests, neither sets `Authorization` — asserting the unauthenticated behaviour as intended |

Searched for callers across `dashboard/`, `src/ui`, `dashboard/functions`, `dashboard/index.html`, docs, and the whole repo (ts/tsx/js/jsx/html/md/json/svelte/vue/py/sh): **no client of any kind calls it.** No `fetch('/billing/stats')`, no dashboard component, no Functions handler, no MCP tool. The Worker route table and `src/index.ts` reference neither `billing/stats` nor the signals router.

Sibling contrast on the *same* router: `GET /billing/plans` (`:69`) is intentionally public — a pricing-page feed of the three public SKUs (`signal-subscription-checkout-handlers.ts:13-23`) — but it returns only static config, no tenant data.

### Can an unauthenticated caller read other tenants' aggregate counts?

**Yes.** Unauthenticated `GET /api/v1/signals/billing/stats` returns `{"data":{"FREE":n,"PRO":n,"ENTERPRISE":n}}` built from every active row. A bare `curl` with no `Authorization`, no `X-Admin-Key`, no `X-Api-Key` gets a 200.

Aggregate counts are low-severity disclosure (no subscriber IDs, chat IDs, or amounts cross the wire — `signal-subscription-checkout-handlers.ts:90-95` emits only tier keys and counts). But it is unauthenticated competitor intelligence: exact tier distribution and paying-customer volume, readable repeatedly through the rate limiter. It is also inconsistent with the isolation work this branch just completed, and it makes the OpenAPI contract wrong — the spec advertises no auth because there is none.

**Smallest correct fix:** apply the same guard the adjacent route already uses — `getCallerIdentity(req)` for a 401, then `requireAdminKey(req, res)` for a 403 — mirroring `handleListActiveSubscriptions` at `signal-subscription-handlers.ts:47-56`. No new middleware needed; reuse `src/platform/api/middleware/require-admin-key.ts`. Keep the response shape unchanged so the existing 200-path tests still pass. Then declare `401`/`403` in `docs/openapi-signals-api.json:436-467`.

---

## Positive Observations

- The IPN handler is idempotent-friendly and cancels correctly: `handleSignalsIpnCancelled` re-reads the row before `setActive(false)` — `signals-payment-handler.ts:99-101`.
- IPN webhooks are signature-verified before dispatch: `nowpayments-webhook.ts:57-64` rejects a missing or invalid `x-nowpayments-sig`.
- Marketplace payment handling is genuinely idempotent (`marketplace-payment-handler.ts:30-39`) — the signals handler lacks an equivalent `payment_id` check, since its `ON CONFLICT` targets `subscriber_id`. Worth noting, not raised as a defect here.
- `GET /subscriptions/active` demonstrates exactly the right pattern — caller identity **plus** admin key on an endpoint that reads every tenant's rows.
- Rate limiting and strict CSP are applied globally (`server-middleware.ts:53,61-62`).

## Metrics

- Type check: `pnpm exec tsc --noEmit` → **0 errors** (both defects are type-legal by construction; neither is a suppressed cast)
- Files read in full: 12; type-legal-but-wrong paths found: 2 (defects 2, 3)
- Lint on changed files: not run (read-only mandate)

## Unresolved Questions

1. **Is a paid Signals customer supposed to be gate-recognisable?** Defect 2 Part C means every signals purchaser is 403'd at `requireSignalTier('SIGNALS_BASIC')` until a `SIGNALS_*` license tier exists. If signals are intended as an *add-on* carried alongside a platform license rather than a standalone tier, the gate needs an add-on check instead of a `LicenseTier` member — a product decision, not a code one.
2. **What should Signals Basic's delivery tier be?** `BASIC → 'FREE'` is almost certainly wrong for a $29 SKU, but whether it should be a real `BASIC` delivery tier (needs adding to `TIER_SIGNAL_CONFIG` and `THROTTLE_MS`) or map onto existing `PRO` is a pricing/packaging call.
3. **Should `/billing/stats` stay internal, or become customer-visible?** No caller exists either way. If it is meant for a future dashboard, the guard is the same; only the authz subject changes (admin key vs. own-tenant-only).
4. **Dead migration 033 or dead runtime `ensureTable`?** `033-create-signal-subscriber-tables.ts` with its `CHECK` is unreferenced and unrun, while the repository creates the same table without the `CHECK` and with a wider `tier VARCHAR(32)`. Two competing schemas for one table; which should win is a schema-ownership decision. Flagged because the `CHECK` would not have caught defect 2's `'FREE'` value anyway — only a migration to the real signal-tier vocabulary would.
