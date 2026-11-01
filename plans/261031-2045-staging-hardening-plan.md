# Plan: SaaS/Paper Staging Hardening (Three Remaining Closure Gaps)

**Branch:** `fix/saas-paper-staging-hardening`
**Base Commit:** `4410d37edebe783a65f5041a1810bb1526c2eef7`
**Target:** Local isolated staging / drill verification without production mutation

---

## 1. Concrete Outcomes
1. **Target Binding Guard across all deploy entrypoints:**
   - Resolve explicit target environment (`staging`) in Wrangler config and environment variables.
   - Cross-check worker name, routes (`routes = []`), D1 ID != prod D1, KV ID != prod KV, hostname != prod.
   - Enforce `--env staging` on wrangler commands (`secret put`, `deploy`, `d1 migrations`).
   - If configuration points to production or default un-scoped target, ABORT with 0 secret uploads, 0 migrations, 0 deploys.
   - Audit and protect ALL deployment scripts (`deploy-cf-worker-with-sha-verification.sh`, `deploy-production.sh`, `deploy-region.sh`, `deploy-multi-region.sh`).
2. **Schema & Binding Health Contract (Subscriptions + Paper Ledger + Persistence):**
   - Check D1 binding: if missing, fail readiness immediately (HTTP 503).
   - Check real tables AND critical columns:
     - `subscriptions`: `id`, `user_id`, `status`, `tier`, `created_at`
     - `paper_trades_v3`: `id`, `market_id`, `side`, `size_usd`, `entry_price`, `status`, `strategy`, `created_at`
     - `coupons`: `code`, `tier_lock`, `expires_at`
     - `payment_logs`: `id`, `payment_id`, `created_at`
   - Sanitize error responses via `sanitizeError` / `JSON_HEADERS`, returning HTTP 503 for schema/query errors.
   - Distinguish `/health` liveness (HTTP 200) vs `/ready` or readiness payload (HTTP 503 if D1 degraded).
3. **Local Isolated Drill Execution:**
   - Seed synthetic paper trades + subscriptions in an isolated SQLite database (`staging-drill-a.db`).
   - Run backup drill (`sqlite3 .backup`) to `staging-drill-b.db`.
   - Restore and verify 100% record match and invariant assertions (sum of size_usd, record count, hashes).
   - Drill migration upgrade & rollback on isolated DB.
   - Drill kill switch (`QWEN_KILL=1` / `isKillSwitchActive()`) mid-paper-trading tick to prove 0 new trades opened.
   - Measure and record actual recovery & execution times.

---

## 2. Acceptance Criteria
- [ ] 0 calls to secret upload/migration/deploy if staging target mismatch or missing.
- [ ] Health/readiness returns HTTP 503 if any required D1 table or column is missing.
- [ ] Isolated drill passes with exact measured metrics for backup/restore, rollback, and kill switch.
- [ ] `npx vitest` and `npx tsc --noEmit` pass with 100% green.
- [ ] No production deploy, no live trading, no external comments, stop at worktree.
