# Risks & Gaps

**Severity scale:** HIGH (blocks safe production / data loss) · MEDIUM (operational pain) · LOW (cleanup).
**Confidence labels:** Confirmed (code-cited) · Inferred · Needs-verification.

---

## Critical (HIGH)

### R-01 · OrderExecutor is mocked but reachable from real strategy code
- **Where:** `src/execution/order-executor.ts:130-151`
- **Symptom:** `placeOrder()` returns synthetic 100% fills regardless of venue connectivity.
- **Impact:** Anything calling it gets fake "filled" outcomes; downstream `recordTradeOutcome()` thinks a position exists when none was sent.
- **Confidence:** Confirmed.
- **Action:** Either gate by env flag with prod-fail-loud, or replace with real CLOB submission path.

### R-02 · Better-Auth insecure secret fallback
- **Where:** `src/auth/auth-server.ts:35`
- **Symptom:** Falls back to literal `'dev-only-insecure-secret-change-me'` if both `BETTER_AUTH_SECRET` and `JWT_SECRET` unset.
- **Impact:** Any deployment without env var would have forgeable sessions.
- **Confidence:** Confirmed.
- **Action:** Fail-fast on missing secret in production env.

### R-03 · Qwen paper-only gate is a string-match, not type-enforced
- **Where:** `src/paper-trading-orchestrator.ts:39-44`
- **Symptom:** Determines paper-only path by substring matching on signal source label.
- **Impact:** A renamed signal source could bypass the safety and reach real execution.
- **Confidence:** Confirmed.
- **Action:** Replace with typed discriminator (`isPaper: true`) or tagged-union in signal schema.

### R-04 · Ephemeral billing state lost on PM2 restart
- **Where:** `src/billing/payment-service.ts`, `license-service.ts`, `subscription-service.ts`, `dunning-service.ts`
- **Symptom:** All four services back state with in-memory `Map` (license + subscription also file-mirrored).
- **Impact:** PaymentService loses all payment records on restart; dunning state inconsistent across the four maps.
- **Confidence:** Confirmed.
- **Action:** Migrate to PostgreSQL with transaction-boundaries.

### R-05 · No automatic license middleware on Express → default ALLOW
- **Where:** `src/api/server.ts` mounts helmet/cors/json/metrics/rate-limit only; `requireTier()`/`requireFeature()` are factories called per route.
- **Symptom:** Unprotected routes return data without checking the license.
- **Impact:** Any route that forgets `requireTier()` is effectively FREE.
- **Confidence:** Confirmed.
- **Action:** Mount a default-deny middleware that requires a tier annotation per route.

---

## High operational (MEDIUM)

### R-06 · Polymarket CLOB v1 + v2 both live in code & deps
- **Where:** `package.json` (5.8.0 + 0.2.6); `src/polymarket/clob-client.ts` (v1) + `clob-v2-adapter.ts` (v2).
- **Symptom:** Unclear which is canonical; risk of state drift / accidental double-submit.
- **Confidence:** Confirmed.
- **Action:** Document selection logic or pin to one.

### R-07 · 45+ near-duplicate Polymarket strategies, no shared base class
- **Where:** `src/strategies/*` (48 files), registry in `src/wiring/strategy-wiring.ts:72-101`.
- **Symptom:** Bug fixes & risk improvements not propagated uniformly.
- **Confidence:** Inferred from headcount + naming.
- **Action:** Introduce `BasePolymarketStrategy` abstraction.

### R-08 · M1 Max → D1 sync is SPOF
- **Where:** `scripts/sync-sqlite-to-d1.ts` triggered by launchd on one machine.
- **Symptom:** If M1 down/offline, dashboard stats go stale; no failover.
- **Confidence:** Confirmed.
- **Action:** Replicate or run a cloud copy.

### R-09 · NOWPayments IPN lacks replay/idempotency protection
- **Where:** `src/api/routes/webhooks/nowpayments-webhook.ts`, `src/billing/nowpayments-service.ts`.
- **Symptom:** HMAC verifies but no order_id deduplication.
- **Impact:** A retried/replayed IPN could re-activate or double-process.
- **Confidence:** Confirmed.
- **Action:** Store `payment_id` set with TTL; reject duplicates.

### R-10 · README pricing ≠ code pricing
- **README:** Starter $49 / Pro $149 / Growth $399.
- **Code:** PRO $99 / ENTERPRISE $299 (`src/billing/nowpayments-service.ts:57,62`).
- **Confidence:** Confirmed.
- **Action:** Pick one source of truth; update the other.

### R-11 · `com.cashclaw.alphaear.plist` template path
- **Where:** `~/Library/LaunchAgents/com.cashclaw.alphaear.plist` (or repo template) — contains `/Users/you/` placeholder.
- **Impact:** Sidecar won't start on a fresh M1; AlphaEar API + signals silently disabled.
- **Confidence:** Inferred from explore-05.
- **Action:** Generate plist via script that substitutes `$HOME`.

### R-12 · License + Payment + Subscription + Dunning not transactional
- **Confidence:** Confirmed.
- **Action:** Move to PG with serializable txn boundaries.

### R-13 · License key entropy weak
- **Format:** `raas-{tier}-{8}-{8}` — predictable prefix.
- **Confidence:** Confirmed.
- **Action:** Use 16+ random bytes (base32) after tier prefix.

### R-14 · No subscription expiry cron
- **Symptom:** `currentPeriodEnd` set but never auto-expires.
- **Action:** Add daily expiry job.

### R-15 · NATS_TOKEN in plaintext docker-compose env
- **Confidence:** Confirmed.
- **Action:** Move to Docker secret / external vault.

### R-16 · WebSocket service on :3001 unknown
- **Vite dev proxy routes `/ws` → `ws://localhost:3001` but no service in `src/` visibly listens.**
- **Confidence:** Needs-verification.
- **Action:** Locate or document the listener.

### R-17 · Express + Fastify hybrid
- License/usage middlewares exist as Fastify plugins but the live server is Express — not mounted.
- **Confidence:** Confirmed.
- **Action:** Standardize on one framework.

### R-18 · `kronos-fair-value.ts` bypasses AlphaEar singleton
- Second Kronos consumer path; will drift from main client.
- **Confidence:** Confirmed.
- **Action:** Route through AlphaEar service.

---

## Cleanup (LOW)

### R-19 · CORS hardcoded `https://cashclaw.cc` in edge-proxy
- `_getCorsOrigin()` placeholder exists but unused.

### R-20 · `src/ui/` design tokens orphaned
- Dashboard uses Tailwind directly. Either archive or wire into Vite.

### R-21 · `phase10_cosmic/daoGovernance` stub
- Empty index file. Archive or finish.

### R-22 · `GruStrategy.ts` deprecated but present
- Not in registry. Delete or mark `@deprecated`.

### R-23 · `polymarket-ws-feed.ts` legacy duplicate
- Superseded by `polymarket-websocket-feed.ts`. Delete.

### R-24 · Audit JSONL mode 644 + unencrypted
- User-readable; full trade history leaks if user account compromised.

### R-25 · PM2 logs unbounded
- No rotation config in `ecosystem.config.cjs`.

### R-26 · Overage prices hardcoded
- `src/metering/usage-metering-service.ts:37-41`.

### R-27 · Hardcoded whale threshold $1000 USDC
- `src/feeds/whale-activity-feed.ts`.

### R-28 · CF KV stores auth tokens without app-level encryption
- Edge cache + tenant config readable from CF dashboard.

---

## Open questions (Needs-verification)

1. Is `VPS_ORIGIN` set in production (worker proxying) or unset (auth-only standalone)?
2. Are all three LLM ports (11435/11436/11437) always hot or lazy-loaded?
3. Is PostgreSQL actually used in prod, or SQLite + D1 only?
4. Are CF Pages Functions authenticated, or is the dashboard read-only-public?
5. NATS_TOKEN rotation mechanism?
6. D1 sync schema-conflict handling?
7. Status of `docker/docker-compose.cashclaw.yaml` — active variant or archived?
8. Are CEX cross-exchange arbs actually live (creds present in prod)?
9. Is feed-aggregator auto-registration or manual?
10. Telegram rate limits — 1s/message tested under volume?
11. Is there a unified backtest orchestrator across 35 arb + 48 strategies?
12. Where do `/api/auth/*` server-side endpoints live (worker handles all, or app.ts too)?
13. Why does `/api/stats` live on CF Pages instead of main backend?
14. Are i18n locale files beyond `en.json` present?
15. Are PM2 logs rotated externally (logrotate)?

---

## Confidence summary

| Domain | Confidence |
|--------|-----------|
| Structure & file inventory | HIGH |
| Trading pipeline composition | HIGH |
| Billing/auth code paths | HIGH |
| Edge proxy + CF topology | HIGH |
| Runtime behavior in production | MEDIUM (no live probe) |
| Whether unused modules are truly dead | MEDIUM (no run-trace) |
| LLM model selection logic | MEDIUM |
