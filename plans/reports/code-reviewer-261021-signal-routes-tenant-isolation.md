# Code Review — signal routes tenant isolation

## Verdict

**Mostly correct, NOT shippable.** The core ownership logic works in production code, but the
commit ships a **stale unit-test assertion that now fails**, and the read/manage supertest suites
it relies on for its 403 claims mock a module the handler does **not** import — so they cannot
run here (supertest needs `listen()`) *and* their tenant guard is not actually under test.
Both fixable, but the "13/13, 38/38, 100% pass" claim in the plan doc is not accurate as it stands.

**Score: 6.5 / 10**

---

## BLOCKERS

### B1. `tests/unit/platform/signal/signal-subscriber-repository-d1.test.ts:124` still asserts the OLD conflict target — suite is red

```
FAIL tests/unit/platform/signal/signal-subscriber-repository-d1.test.ts > upsert > INSERTs with ON CONFLICT update
AssertionError: expected 'INSERT INTO signal_subscriptions (id,…' to contain 'ON CONFLICT (id) DO UPDATE SET'
```

Verified by running it. The branch changed `src/platform/signal/signal-subscriber-repository-d1.ts:82`
from `ON CONFLICT (id)` to `ON CONFLICT (subscriber_id)` but never updated the assertion in the
repo's own unit suite. `git log` shows the last touch to that file is `34a59d89`, unrelated.

Full suite state on this branch (verified):
- `zz-tenant-guard-verification.test.ts` — 13/13 pass
- `src/platform/signals-api` + `tests/unit/platform/signal` — **1 failed / 74 passed**

Suggested fix:
```ts
expect(sql).toContain('ON CONFLICT (subscriber_id) DO UPDATE SET');
// and assert id is in the SET list, per the fix
expect(sql).toContain('id = EXCLUDED.id');
```
This is also the single highest-value addition to the change's own defence: the current
guard suite mocks the repo wholesale, so it proves nothing about the real SQL.

---

### B2. `vi.mock('../../../raas/subscriber-tenant-isolator')` resolves to a DIFFERENT file than the handler imports

There are **two distinct `subscriber-tenant-isolator.ts` modules with the same export**, and the
handler and the test import different ones:

- `src/platform/api/routes/signal-subscription-handlers.ts:10` imports
  `'../../../raas/subscriber-tenant-isolator'`. From `src/platform/api/routes/` that resolves to
  **`/Users/macbook/algo-trader/src/raas/subscriber-tenant-isolator`** (repo-root `src/raas`).
- `src/platform/api/routes/__tests__/signal-subscription-routes-read.test.ts:21-23` mocks the
  *same relative specifier*, but from `__tests__/` it resolves to
  **`/Users/macbook/algo-trader/src/platform/raas/subscriber-tenant-isolator`** — a different file.

Proven empirically with a socket-free probe that copied the read suite's mock block verbatim
(`guardCalled= 0`, while the real `src/raas` guard did throw a 403). So in the read suite:

- `assertTenantAccessMock` is never called — the test cannot assert the guard fired
- the guard that does run is the *real* `src/raas` module, not a controlled stub
- the pre-existing "mock a module the handler does not import is not a guard" defect is
  **still present in the same file**, just with a different symptom

Note both modules coincidentally have `assertTenantAccess`, which is why tsc and the guard test
both pass — this is exactly the shadow-module trap the commit was written to eliminate.

Suggested fix — import the alias that unambiguously names one module, matching `subscriber-pnl-routes.ts:16`:
```ts
// signal-subscription-handlers.ts
import { assertTenantAccess } from '@platform/raas/subscriber-tenant-isolator';
```
then mock `'@platform/raas/subscriber-tenant-isolator'` in the read suite and assert it:
```ts
vi.mock('@platform/raas/subscriber-tenant-isolator', () => ({
  assertTenantAccess: (...a: unknown[]) => { mocks.assertTenantAccessMock(...a); throwIfCrossTenant(a); },
}));
...
expect(mocks.assertTenantAccessMock).toHaveBeenCalledWith('tenant_abc', 'user_001', false);
```
A bare-`vi.fn()` mock is worse than nothing: it makes the suite look like it covers the guard.

`requireAdminKey` has the same shadow-path problem — `../middleware/require-admin-key` from
`__tests__/` is not asserted anywhere (the 503 assertions pass for a different reason, see S5).

---

## SHOULD FIX

### S1. `assertTenantAccess` returns void and signals denial by exception; the 503 for a missing admin key is misleading

`src/platform/api/routes/signal-subscription-handlers.ts:72` and `:215` call the guard inside a
`try`. Denial is a throw, mapped by `denyUnlessAuthorized` (`:30-38`) by **string-matching the
error message**: `includes('cross-tenant') || includes('no-subscriber-identity')`. Any refactor
of the isolator's wording silently converts a 403 into a 500. `subscriber-pnl-routes.ts:66-70`
already uses this exact pattern, so it is the house style — but the message contract is
implicit and untested in both places.

Suggested fix — have the isolator expose a typed denial, or check a code:
```ts
// subscriber-tenant-isolator.ts
export const TENANT_DENIED = 'TENANT_DENIED';
export class TenantAccessDeniedError extends Error {
  readonly code = 'TENANT_DENIED';
  constructor(message: string) { super(message); this.name = 'TenantAccessDeniedError'; }
}
// handlers.ts
if (err instanceof TenantAccessDeniedError) { res.status(403).json({ error: err.message }); return; }
```

---

### S2. `handleListActiveSubscriptions` requires *both* a bearer caller and an admin key — no caller can reach it non-admin, and the 503 mask

`signal-subscription-handlers.ts:46-62`: a resolved caller is required first (`:48-52`, 401), then
`requireAdminKey` (`:53-55`). Because `requireAdminKey` returns **503** when `ADMIN_API_KEY` is
unset (verified in `src/platform/api/middleware/require-admin-key.ts:5-8`) and **403** on a mismatch,
the handler can never return 200 to a non-admin. Two issues:

1. The doc comment at `:41-45` says "Non-admin callers get their own row instead of the full
   list." **That behaviour does not exist.** An admin caller gets 200; every non-admin gets 503.
   The comment describes an unimplemented branch — a trap for the next reader.
2. 503 ("Admin API not configured") is a server-config signal, not an auth signal. `admin.ts`
   uses the same helper, so it is consistent with the house style, but a non-admin with no env
   key configured cannot distinguish "you are not an admin" from "server is misconfigured".

Suggested fix — either implement the documented fallback or correct the comment:
```ts
if (!requireAdminKey(req, res)) {
  // 503 here means "you are not an admin" in practice; make that explicit
  return;
}
```
→ comment: "Admin-only. Returns every tenant's rows. Requires X-Admin-Key; a missing
ADMIN_API_KEY yields 503, a bad key yields 403."

---

### S3. `handleCancelSubscription` is O(n) over the whole tenant set and returns identical 403/404 for both "not found" and "someone else's"

`signal-subscription-handlers.ts:126-156`. `getActiveSubscriptions()` (`:135`) loads **every
active row across all tenants** into memory to `.find()` one by primary key
(`:136`), on every cancel request. The repo already has `getBySubscriberId`; adding a
`getById(id)` would make this a single indexed lookup and remove the full scan. This also matters
for the tenant-leak angle: the scan is what makes cross-tenant *discovery* possible in the first
place — an id-guessing caller gets `404` vs. the next stage, which is an existence oracle even
after the auth fix.

Also, "not found" and "not yours" collapse to the same 404 at `:137-140` before any admin check,
so an admin cancelling an already-cancelled row gets the generic message. Minor, but worth a
distinct message.

Suggested fix:
```ts
// repository
async getById(id: string): Promise<SignalSubscription | undefined> { /* WHERE id = $1 */ }
```
```ts
const target = await signalSubscriberRepo.getById(id);
if (!target) { res.status(404).json({ error: 'Subscription not found' }); return; }
if (target.subscriberId !== caller.subscriberId && !requireAdminKey(req, res)) return;
await signalSubscriberRepo.setActive(target.subscriberId, false);
res.json({ message: 'Subscription cancelled' });
```

---

### S4. `handleGetTenantSubscription` takes `tenantId` from the path unvalidated

`signal-subscription-handlers.ts:71`: `req.params.tenantId as string` with no zod/`validateTenantId`
check. The read suite already has a `validateTenantIdMock` (`read.test.ts:14`) wired to
`../../../shared/tenant` that is **never asserted or even exercised** by the handler — the mock
exists for a check that was never written. `credentials-routes.ts:43-45` shows the intended
pattern. Empty/garbage paths reach `assertTenantAccess` and produce a 403 with a confusing
`cross-tenant access denied - token=x requested=` message rather than a 400.

Suggested fix:
```ts
const tenantId = String(req.params.tenantId ?? '');
if (!validateTenantId(tenantId)) { res.status(400).json({ error: 'Invalid tenantId' }); return; }
```
Same for `subscriberId` at `:209` (only a truthy/blank check today).

---

### S5. Tests that would still pass if the fix were reverted

The brief asks for this explicitly. Assessment of the six new test cases:

| Test | Would it pass reverted? |
|---|---|
| `zz-tenant-guard-verification.test.ts` — all 13 | **No, genuinely fails.** Correct suite (see below). |
| `read.test.ts` "403 when the caller reads another tenant" | **Passes either way.** Mock path resolves to the wrong file (B2); 403 comes from real `src/raas`. It does test real behaviour by accident, but it does not test *this* guard and it would also pass if `assertTenantAccess` were deleted. |
| `read.test.ts` "403 when reading another tenant usage" | Same as above. |
| `read.test.ts` "503 when X-Admin-Key is absent" | **Passes on revert for the wrong reason.** Pre-fix this route had no caller check and no admin check, so it would have returned 200. So it does discriminate — but only because `ADMIN_API_KEY` is unset in the vitest env (verified: no `ADMIN_API_KEY` in `.env`, and `vitest.config.ts` loads no dotenv), making every failure a 503. A real missing-key test would `vi.stubEnv` and assert 403. |
| `manage.test.ts` "cancels on subscriber_id, not the row's primary key" | **Yes, would pass on revert.** It asserts `expect(setActive).toHaveBeenCalledWith('user_001', false)`. Reverting to `sub.id` yields `toHaveBeenCalledWith('sub_001', false)`, so this one *does* discriminate. Keep. |
| `manage.test.ts` "503 when the target belongs to another tenant" | **Passes on revert.** `requireAdminKey` is not mocked; without `ADMIN_API_KEY` set it always returns false → 503, regardless of ownership. The `expect(setActive).not.toHaveBeenCalled()` assertion is the only real signal, and it holds on revert only because the throw path is absent — worth re-checking with the env key stubbed. |

The one genuinely strong addition is `zz-tenant-guard-verification.test.ts` — its `setActive`
mock reproduces the real `WHERE subscriber_id` semantics (`:17-22`), which is exactly the
contract the commit says the first draft got wrong. That test is the change's best artefact.

Suggested fix for S5 — make the supertest suites deterministic rather than env-dependent:
```ts
beforeEach(() => { vi.stubEnv('ADMIN_API_KEY', 'test-admin-key'); });
afterEach(() => { vi.unstubAllEnvs(); });
// then non-admin assertions are 403, not 503, and the 503 case is its own test
```

---

### S6. `signal-subscription-handlers.ts` is now 233 lines, over the 200-line rule; it grew from 134

`wc -l` = 233. The rule in `AGENTS.md` / `CLAUDE.md` says split above 200. Growth is 99 lines, of
which ~60 are the new `getCallerIdentity`/`denyUnlessAuthorized`/self-cancel handler. A clean
split: move `getCallerIdentity` + `denyUnlessAuthorized` into
`signal-subscription-handler-auth-helpers.ts`, and `handleCancelCurrentSubscription` stays — that
lands the file at ~195. Optional, but the rule is explicit and the file will grow again.

---

### S7. Remaining routes on this router that take a tenant/subscriber id and do NOT check ownership

Audited every route registered in `signal-subscription-routes.ts`:

| Route | ID source | Ownership check? |
|---|---|---|
| `GET /subscriptions/active` | — | admin key (new) |
| `GET /subscriptions/:tenantId` | path | `assertTenantAccess` (new) |
| `POST /subscriptions` (x2) | resolver | n/a — always writes caller's own row |
| `DELETE /subscriptions/:id/unsubscribe` | path | owner-or-admin (new) |
| `GET /subscription` | resolver | n/a — caller's own row |
| `DELETE /subscription` | resolver | n/a — caller's own row (new) |
| `DELETE /subscriptions/:id` | path | owner-or-admin (new) |
| `GET /usage/:subscriberId` | path | `assertTenantAccess` (new) |
| `GET /billing/plans` | — | public pricing, fine |
| `POST /billing/checkout` | resolver | n/a |
| **`GET /billing/stats`** | — | **NO AUTH AT ALL** |

**`GET /billing/stats` (`signal-subscription-routes.ts:75`, handler at
`signal-subscription-checkout-handlers.ts:86-99`) has zero authentication and returns a tier
breakdown derived from `getActiveSubscriptions()` — the same cross-tenant aggregate the commit
just locked down on `/subscriptions/active`.** It is a count-by-tier, not per-subscriber rows, so it
is a metadata leak rather than a direct data leak, but it is inconsistent with the change's own
standard and the pre-existing tests (`read.test.ts:104-122`) exercise it with no credentials and
assert 200.

Also on the same mount (`/api/v1/signals`): `src/platform/api/routes/signal-feed-api-routes.ts`
requires a valid key on both `/feed` and `/feed/:id` — no issue there.

Suggested fix for `/billing/stats`, matching the sibling route's treatment:
```ts
export async function handleBillingStats(req: Request, res: Response): Promise<void> {
  if (!getCallerIdentity(req) || !requireAdminKey(req, res)) return;
  // ...
}
```

---

## NITS

### N1. `getCallerIdentity` is a one-property wrapper
`signal-subscription-handlers.ts:20-24` returns `{ subscriberId }` from an object that already has
that field. `resolveSubscriberId` could be used directly with a null check. Harmless; the wrapper
does give a single place to add claims later.

### N2. `denyUnlessAuthorized` context strings double as user-facing error text
`:37` interpolates `context` into the response body: `Failed to fetch subscription`. Fine, but the
same string is also the log prefix at `:36`, so a context change rewrites both log keys and API
text. Two literals would be clearer.

### N3. Duplicate router shadow (pre-existing, out of scope)
`src/api/routes/signal-subscription-routes.ts` is a 128-line legacy router exporting a second
`signalSubscriptionRouter` at in-memory `Map` semantics. It is unmounted (only
`src/platform/api/routes/signal-subscription-routes.ts` is imported by `server-routes-core.ts:22`),
so it is dead code, but it is a trap for the same class of mistake as B2. Worth a deletion
follow-up, not this branch.

### N4. `upsert` writes `id = EXCLUDED.id` unconditionally
This regenerates the row's `id` on every update path where a caller passes a fresh UUID. In
`handleCreateSubscription` (`:100`) `existing?.id ?? randomUUID()` correctly preserves it, and
`signals-payment-handler.ts:60` reuses `existing.id` too, so the live paths are safe. Keep the
guard in mind for any new caller.

---

## Constraint Compliance

| Constraint | Result |
|---|---|
| No `console.log` | PASS — zero across all six changed files |
| Zero `:any` / `as any` | PASS in changed files (`signal-subscriber-repository-d1.ts:72,103` use `as unknown as`, pre-existing, not in this diff) |
| Files under 200 lines | **FAIL** — `signal-subscription-handlers.ts` 233 (S6); others 75 / 133 / 153 pass |
| Zod validation on inputs | **PARTIAL** — body covered by `subscribeBodySchema`; `tenantId`/`subscriberId` path params unvalidated (S4) |
| `tsc --noEmit` | PASS (exit 0, background run) |
| Test suites | **FAIL** — B1 repo suite red; B2 mock path wrong |

---

## On the change's own claims

Verified against source:

1. ✅ **Both tenant reads verify ownership before the repo call.** `:72` and `:215` precede the
   data access. Correct.
2. ✅ **`/subscriptions/active` was unauthenticated and is now gated.** `git show main:...` confirms
   the handler was `async handleListActiveSubscriptions(_req, res)` with no auth. Now 401 without
   a key and admin-key-gated. Claims accurate. See S2 for the misleading comment.
3. ✅ **`DELETE /subscriptions/:id` now checks ownership.** Pre-fix it scanned all active rows and
   called `setActive(id, false)` for any id. Now owner-or-admin.
4. ✅ **`DELETE /subscription` alias added, registered at `:60` before `:62`.** Correct order —
   the literal path wins over `/subscriptions/:id`.
5. ✅ **`setActive` matches `subscriber_id`.** Confirmed in the repo: `UPDATE ... WHERE subscriber_id = $3`.
   Both call sites now pass `subscriberId` (`:150`, `:175`). Accurate.
6. ⚠️ **`ON CONFLICT` change is directionally right but the commit's justification is WRONG.**
   The commit says "`subscriber_id` is the table's PRIMARY KEY". It is not.
   `src/db/migrations/033-create-signal-subscriber-tables.ts:16` declares
   `id TEXT PRIMARY KEY` and creates a **non-unique** index on `subscriber_id` —
   `src/platform/signal/signal-subscriber-repository-d1.ts:47-56` has the same shape (I confirmed it
   via its own unit test: `expect(sql.some(s => s.includes('CREATE INDEX IF NOT EXISTS idx_signal_subs_subscriber')))`,
   which would have said UNIQUE INDEX otherwise). So:
   - **Old** `ON CONFLICT (id)` was correct on its own terms and **never threw on re-subscribe** —
     a re-subscribe from the same caller generates a fresh `randomUUID()` (`:100`), so it inserts a
     second row rather than conflicting on `id`. The bug was a **duplicate-row bug**, not an exception.
   - **New** `ON CONFLICT (subscriber_id)` matches `src/platform/signals-api/subscription-repository-d1.ts:63`
     and its `ensureTable` creates `CREATE UNIQUE INDEX idx_subs_subscriber`
     (`:47`), so that sibling repo *is* backed by a unique index. This repo is not.
   - **Consequence: the fix only works if a unique index exists on `signal_subscriptions.subscriber_id)`.
     Under migration 033's non-unique index, `ON CONFLICT (subscriber_id)` raises
     `there is no unique or exclusion constraint matching the ON CONFLICT specification`** — i.e.
     the new code can fail where the old code silently duplicated.

   I could not confirm the live schema against production from this sandbox (`psql` blocked: host
   `postgres` does not resolve, and local socket connect is `EPERM`), so the deployed state of
   that index is **unresolved**. The safe fix, which is correct under either schema:
   ```ts
   await query('CREATE UNIQUE INDEX IF NOT EXISTS idx_signal_subs_subscriber_unique ON signal_subscriptions (subscriber_id)');
   ```
   added to `ensureTable()` alongside the existing index statements, **plus a data-cleanup
   migration** that collapses any duplicate rows the old `ON CONFLICT (id)` path already created:
   ```sql
   DELETE FROM signal_subscriptions a USING signal_subscriptions b
   WHERE a.ctid < b.ctid AND a.subscriber_id = b.subscriber_id;
   ```
   Also: the plan doc at
   `plans/260704-0941-signals-api-marketplace/phase-02-api-endpoints.md` repeats the "primary key"
   claim and the "re-subscribe threw" claim. Both should be corrected to "non-unique index; old
   path inserted duplicate rows".

---

## Recommended Actions

1. **B1** — update the stale `ON CONFLICT (id)` assertion to `(subscriber_id)`; `pnpm exec vitest run tests/unit/platform/signal/signal-subscriber-repository-d1.test.ts` must go green. This is the cheapest, highest-value fix.
2. **B2** — switch the handler to `@platform/raas/subscriber-tenant-isolator`, fix the mock path, and assert the mock is called. Removing the shadow `src/raas/` import is what makes the read suite actually cover the guard.
3. **Claim 6 correctness** — add the unique index to `ensureTable()` (or write a migration adding the constraint), dedupe existing rows, and correct the plan doc's "primary key / would throw" narrative. Until this is settled, the ON CONFLICT change trades a silent duplicate for a loud error.
4. **S7** — decide on `/billing/stats`: gate it with the admin key, or document it as intentionally public. Do not leave a route at a lower standard than its sibling on the same router.
5. **S5 / S4** — stub `ADMIN_API_KEY` in the supertest suites and add `validateTenantId` on the path params the handler already reads unvalidated.
6. **S6** — extract the two auth helpers to keep the file under 200.
7. **Run the three supertest suites in an environment where local `listen()` is allowed.** They are
   untested by this change and two of them are the ones carrying several of its 403/503 claims.
   Since B1 and B2 both live in that path, expect edits there.

---

## Metrics

- LOC: 391 insertions, 29 deletions across 7 files; source 126 / tests 197 / docs 77
- Type coverage: tsc clean; **0 `:any` / `as any`** in the diff
- Test coverage: `zz-tenant-guard-verification.test.ts` 13/13 pass;
  `src/platform/signals-api` + `tests/unit/platform/signal` **74/75 (1 fail)**;
  `src/platform/api/routes/__tests__/` — **0/3 runnable in this sandbox** (supertest needs `listen()`)
- New guard suite quality: strong on `setActive` semantics, no-op on the isolator (mocks the wrong module)
- ESLint suppressions added: 0 (verified — none in the diff)

---

## Unresolved Questions

1. **What does production's `signal_subscriptions` look like today?** Specifically, does
   `subscriber_id` have a unique index? `ON CONFLICT (subscriber_id)` is a runtime error without
   one, and migration 033 creates a non-unique index. I could not reach the database from this
   sandbox (`psql` host resolution and socket both blocked). This is the question that decides
   whether claim 6 is a fix or a regression.
2. **Have duplicate `signal_subscriptions` rows already accumulated** from the old
   `ON CONFLICT (id)` path (same `subscriber_id`, different `id`)? If yes, the unique-index fix
   cannot be applied until they are collapsed, and `getBySubscriberId` has been returning
   `rows[0]` arbitrarily in the meantime.
3. **`GET /billing/stats` — intentional public, or an oversight?** It leaks the same aggregate the
   commit just gated on `/subscriptions/active`. I need a product decision before changing it, per
   the rule against reversing user decisions without asking.
4. **Should `ADMIN_API_KEY` be present in the vitest environment?** Currently absent, which makes
   every non-admin assertion resolve to 503 and hides 403-vs-503 distinctions. Either stub it per
   suite (my recommendation) or add it to `vitest.config.ts` — tell me which you prefer, as it
   changes ~4 tests outside this branch's files.
5. **Is `src/raas/` still a live code path?** `signal-subscription-handlers.ts` is the only file
   importing from it now. If that shadow tree is vestigial, deleting it removes the whole class of
   B2-style mistake — but that is a repo-wide decision, not this branch's.
