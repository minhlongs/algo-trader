# Brainstorm: Next Phase — Wire Dead Routes + Test Coverage + Server Polish

**Date:** 2026-07-01 | **Mode:** --deep --parallel | **Flags:** none
**Context:** Phases 39-52 complete — Polymarket live trading stack, 32 strategies, dual backtesting, 2,712 tests. 95% platform completion.

---

## Problem Statement

Deep scout revealed 3 hidden gaps from the desk/platform architecture separation (2026-06-30):

1. **9 orphaned API routes** — fully coded, tier-gated endpoints never imported into `server.ts`. Live features are dead code.
2. **30 untested route files + 35 untested Polymarket strategies** — largest test coverage gap in the codebase.
3. **7 broken npm scripts + incomplete CLI migration** — scripts point to removed files, CLI lost 25+ commands during separation.

These are not new features — they're connection gaps from the architecture migration.

---

## Scout Evidence

### Orphaned Routes (dead code)
| File | Key Endpoints | Tier |
|------|--------------|------|
| `backtest.ts` | `POST /submit`, `GET /results` | PRO |
| `signal-feed-routes.ts` | `GET /stream`, `GET /`, `GET /:id` | PRO |
| `signal-subscription-routes.ts` | `POST /subscribe`, `/unsubscribe` | PRO |
| `referral-routes.ts` | 9 endpoints (stats, code, click, commission, payout, validate) | ENTERPRISE |
| `admin-dna-routes.ts` | `GET /status`, `POST /start/stop/config` | ADMIN |
| `admin-dna.ts` | DNA status endpoints | ADMIN |
| `credentials-routes.ts` | `POST /` | FREE |
| `personalization-routes.ts` | `GET /config`, `GET /ab-config`, `POST /events` | FREE |
| `webhooks/webhook-resilience.ts` | `GET /dead-letter`, `POST /retry` | ADMIN |

### Broken npm scripts
| Script | Missing Target |
|--------|---------------|
| `sop:run`, `sop:dev` | `src/agi-sops/index.js` (dir removed) |
| `disk:check` | `scripts/disk-monitor.ts` |
| `sync-dunning-kv` | `src/jobs/dunning-kv-sync.ts` |
| `audit` | `src/audit/index.ts` (dir removed) |
| `chaos-test` | `src/testing/chaos/index.ts` (dir removed) |
| `build:cached` | `scripts/build-with-cache.sh` |

### Test Gaps
- 30 platform route files untested
- ~35 Polymarket strategy implementations untested (only base class tested)
- 13 execution helper files untested
- Backtesting gamma provider untested

---

## Approach: 3-Phase Execution Sequence

### Phase 53: Wire Dead Routes
**Goal:** Register all 9 orphaned route files in `server.ts`. Verify each endpoint responds correctly.

**Steps:**
1. Wire `backtest.ts` → mount at `/api/v1/backtest`
2. Wire `signal-feed-routes.ts` + `signal-subscription-routes.ts` → mount at `/api/v1/signals`
3. Wire `referral-routes.ts` → mount at `/api/v1/referrals`
4. Wire `admin-dna-routes.ts` + `admin-dna.ts` → mount at `/api/admin/dna`
5. Wire `credentials-routes.ts` → mount at `/api/v1/credentials`
6. Wire `personalization-routes.ts` → mount at `/api/v1/personalization`
7. Wire `webhooks/webhook-resilience.ts` → mount at `/api/webhooks/resilience`
8. Verify: build + existing tests pass, no import errors
9. Smoke test each wired route returns non-404

**Scope:** IN — wiring + verification. OUT — adding new features or modifying route logic.

### Phase 54: Server Polish & Dead Code Cleanup
**Goal:** Fix or remove 7 broken npm scripts, delete stale `.bak` file, audit remaining gaps.

**Steps:**
1. Remove broken scripts from `package.json` (targets no longer exist)
2. Delete `admin-dna-routes.ts.bak`
3. Audit whether `src/desk/cli/` needs legacy command ports — list top 3 missing commands
4. Verify: `pnpm build` + `pnpm test` pass

**Scope:** IN — script cleanup, stale file removal. OUT — full CLI restoration (defer to later sprint).

### Phase 55: Test Coverage Sprint — Routes
**Goal:** Add integration tests for newly-wired routes + priority untested platform routes.

**Steps:**
1. `backtest.ts` — test POST /submit, GET /results
2. `signal-feed-routes.ts` — test GET /stream
3. `referral-routes.ts` — test POST /generate-code, GET /stats
4. `admin-dna-routes.ts` — test GET /status
5. `credentials-routes.ts` — test POST /
6. `personalization-routes.ts` — test GET /config
7. Priority existing-but-untested routes: `admin-marketplace-strategy-vetting`, `marketplace-strategy-listings`, `marketplace-strategy-management`
8. Verify: all new tests pass, no regressions

**Scope:** IN — route-level integration tests (mocked services). OUT — Polymarket strategy unit tests (deferred).

---

## Execution Order

```
Phase 53 (Wire Routes) → Phase 54 (Server Polish, parallel-safe) → Phase 55 (Test Coverage, depends on 53)
```

Phase 53 must come first — tests in Phase 55 need wired routes. Phase 54 can run in parallel with 53 (they touch different files: `server.ts` vs `package.json`).

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Wired route breaks existing tests | Low | Routes are self-contained, no shared state |
| Orphaned route has bit-rotted imports | Medium | Fix imports before wiring (post-separation paths may be stale) |
| Broken npm script removal breaks CI | Low | Check `.github/workflows/` for script references first |
| Route tests require complex mocking | Medium | Follow existing pattern from `marketplace-strategy-insights-routes.test.ts` |

---

## Success Criteria

1. All 9 orphaned routes return from `server.ts` (verified via import chain, not just HTTP)
2. Zero broken npm scripts remain in `package.json`
3. `admin-dna-routes.ts.bak` deleted
4. 8+ new route test files added
5. Build: 0 TypeScript errors
6. Test suite: all existing 2,712 tests pass + new tests pass
7. No regressions

---

## Non-Negotiable Constraints

- Bounded-context import rules: desk imports shared only, platform imports shared + desk
- Tier gating preserved on all wired routes (routes already have `requireTier()` calls)
- No changes to route business logic — wiring only
- Zero `:any` types, zero `console.log`

---

_Generated by brainstorm agent. Ready for /ck:plan handoff._
