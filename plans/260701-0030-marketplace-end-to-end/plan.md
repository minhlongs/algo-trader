# Phase 3: Marketplace End-to-End

**Status:** planning → phase-01 in_progress
**Start:** 2026-07-01 00:30
**Goal:** Marketplace từ "code complete" → "production complete" (listing → subscribe → pay → execute → revenue)

---

## Scout Findings (3 subagents, 2026-07-01)

### What Exists
- 27 route handlers trên 9 route files, tier-gated đầy đủ
- 5 services (Marketplace, Subscription, Dispute, Revenue, Vetting)
- 8 repositories với raw SQL, 8 DB tables với FKs đầy đủ
- Revenue math 20/80, vetting worker, notification service
- 14 unit test files (repo + service level)

### What's Missing (6 critical gaps)
1. **No payment integration** — subscribe không trigger payment; priceUsdMonthly luôn = 0
2. **No execution bridge** — subscribe xong strategy không chạy cho subscriber; marketplace không import desk
3. **No frontend** — dashboard marketplace page là static hardcoded
4. **No billing integration** — platform billing (NOWPayments) và marketplace billing hoàn toàn tách biệt
5. **No API client** — zero consumer của marketplace endpoints
6. **No route-level integration tests** — chỉ có unit tests cho repo + service

---

## Phase Plan

| # | Phase | Priority | Est. Files |
|---|-------|----------|------------|
| 01 | Payment flow — NOWPayments webhook → subscription activation | P0 (blocker) | 4 files |
| 02 | Execution bridge — subscription → RaaS executor per tenant | P0 (blocker) | 5 files |
| 03 | Marketplace frontend — browse, subscribe, manage, review | P1 | 8 files |
| 04 | Revenue reconciliation — billing ↔ marketplace payout cycle | P1 | 3 files |
| 05 | Route-level integration tests + end-to-end validation | P2 | 5 files |

---

## Dependencies
- Phase 01 → Phase 02 (execution needs active subscription)
- Phase 01 → Phase 03 (frontend needs payment to work)
- Phase 02 → Phase 03 (frontend needs execution status)
- Phase 04 depends on Phase 01 (revenue needs payment data)
- Phase 05 runs after all phases

## Quality Gates
- `npm run typecheck` → 0 errors
- `npm test` → all tests pass
- `npm run lint` → 0 errors, ≤100 warnings
- Manual smoke test: browse → subscribe → pay → strategy executes → revenue recorded
