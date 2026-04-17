# Phase 03 — Signal Ingest Endpoint + M1 Max Daemon

## Context Links

- File: `/Users/macbookprom1/algo-trader/src/signal/signal-publisher.ts`
- File: `/Users/macbookprom1/algo-trader/src/signal/signal-types.ts`
- File: `/Users/macbookprom1/algo-trader/src/api/routes/signal-subscription-routes.ts`
- File: `/Users/macbookprom1/algo-trader/src/api/server.ts`
- Depends: Phase 01 (Qwen MLX live), Phase 02 (qwenChat routing)

## Overview

**Priority:** P1
**Status:** complete (PR #109, commit f79d2b8)
**Effort:** 4h
**Description:** (1) Add HMAC-authenticated `POST /api/v1/signals/ingest` route to algo-trader that calls existing `SignalPublisher.publish()`. (2) Build Python daemon on M1 Max that runs Qwen-based signal generation loop and HTTP POSTs to this endpoint. Zero new fan-out machinery — reuse existing SSE + Telegram + D1 path.

## Key Insights

- **Chose Option B over A/C:** Daemon pushes outbound → no inbound hole in M1 Max firewall, no CF Tunnel on hot path, fire-and-forget resilient.
- **Reuse SSE broadcaster (UNRESOLVED Q1 resolved):** adding new WebSocket channel violates KISS. Existing SSE handles ENTERPRISE tier at sub-ms latency. Qwen signals flow through same pipe with `strategy='qwen-m1max-v1'` tag → clients filter if desired.
- **HMAC, not JWT:** simpler, symmetric secret, no expiry drama. Secret in CF Worker env `QWEN_INGEST_HMAC_SECRET` + M1 Max daemon env. Replay protection via 60s timestamp window.
- **Rate limit:** 60 req/min on ingest route. Daemon posts ≤1/min typical.

## Requirements

**Functional:**
- `POST /api/v1/signals/ingest` accepts JSON `{market, side, size, confidence, strategy, ttl, ts}` + headers `X-Signature` (HMAC-SHA256 over raw body) + `X-Timestamp`
- Rejects if timestamp >60s stale or signature mismatch (401)
- On valid: calls `signalPublisher.publish(input)` (existing), returns 202 with `{id}`
- Daemon on M1 Max generates signal every ≥60s, posts to production URL
- Daemon respects `KILL_SWITCH_QWEN` env — exits cleanly if set

**Non-functional:**
- Idempotent (relies on existing `signal-dedup-guard`)
- Daemon auto-restart via launchd on crash
- Structured logs (JSON) for daemon → `~/.local/logs/qwen-signal-daemon.log`

## Architecture

```
M1 Max
├─ qwen-signal-daemon.py (NEW)
│   ├─ loop every 60s
│   ├─ fetch market snapshot (reuse existing data feed via HTTP)
│   ├─ Qwen MLX @ :11437 → reasoning → {market, side, confidence, ttl}
│   ├─ HMAC sign (body, ts) with QWEN_INGEST_HMAC_SECRET
│   └─ POST https://algo-trader.pages.dev/api/v1/signals/ingest
│
algo-trader Worker
├─ signal-ingest-route.ts (NEW)
│   ├─ HMAC verify
│   ├─ timestamp window check
│   ├─ rate limit (express-rate-limit, per-IP)
│   ├─ zod validate body
│   └─ SignalPublisher.publish(body) [EXISTING]
└─ [existing fan-out: D1 + SSE + Telegram]
```

## Related Code Files

**Create (algo-trader repo):**
- `src/api/routes/signal-ingest-route.ts` (~120 LOC) — HMAC-protected ingest handler
- `src/api/routes/__tests__/signal-ingest-route.test.ts` (~100 LOC) — HMAC valid/invalid, stale ts, malformed body
- `src/utils/hmac-verifier.ts` (~40 LOC) — shared HMAC verification (timing-safe compare)
- `src/utils/__tests__/hmac-verifier.test.ts` (~50 LOC)

**Modify:**
- `src/api/server.ts` — register `signalIngestRouter` under `/api/v1/signals`
- `.env.example` — document `QWEN_INGEST_HMAC_SECRET`

**Create (M1 Max only, not in algo-trader repo):**
- `~/mekong-daemons/qwen-signal-daemon.py` (~180 LOC)
- `~/mekong-daemons/requirements.txt` (httpx, mlx-lm already present)
- `~/Library/LaunchAgents/com.mekong.qwen-signal-daemon.plist`

**Do NOT modify:**
- `signal-publisher.ts` (reuse as-is)
- `sse-signal-broadcaster.ts` (reuse as-is — answers UNRESOLVED Q1)
- `telegram-signal-pusher.ts` (reuse as-is)

## Implementation Steps

1. **`src/utils/hmac-verifier.ts`**: export `verifyHmacSha256(body: string, signature: string, secret: string, ts: number, maxSkewMs: number): boolean` using Node `crypto.timingSafeEqual`.
2. **`src/api/routes/signal-ingest-route.ts`**:
   - Router with POST `/ingest`
   - Middleware order: rate-limit → HMAC verify → zod body parse → publisher.publish()
   - Inject `SignalPublisher` via factory to match existing DI style
   - Reject if `strategy` prefix not in allow-list `['qwen-m1max-v1', 'deepseek-m1max-v1']`
3. **`src/api/server.ts`**: `app.use('/api/v1/signals', signalIngestRouter)`
4. **Test** (`signal-ingest-route.test.ts`): supertest cases — valid HMAC passes, bad sig 401, stale ts 401, malformed body 400, unauthorized strategy 403, rate limit 429
5. **Test** (`hmac-verifier.test.ts`): timing-safe compare, ts window, malformed header
6. **Daemon** (`~/mekong-daemons/qwen-signal-daemon.py` on M1 Max):
   - Load model snapshot once per cycle (reuse market data fetch — pull from existing `/api/v1/market/snapshot` via HTTP)
   - Build prompt (market context + strategy instructions)
   - Call Qwen via `httpx.post(":11437/v1/chat/completions")`
   - Parse JSON output → normalize to RawSignalInput shape
   - HMAC sign + POST to production ingest URL
   - Backoff on 5xx (3 retries, 1s/2s/4s)
   - Exit on `os.environ.get("KILL_SWITCH_QWEN")`
7. **launchd plist** (M1 Max): auto-start, restart on crash, log to `~/.local/logs/qwen-signal-daemon.log`
8. Local smoke test: set `QWEN_INGEST_HMAC_SECRET=devtest` in both, curl simulate one signal end-to-end; confirm row in D1 local dev.
9. Commit: `feat(signal): HMAC-authed ingest endpoint + M1 Max Qwen daemon`

## Todo List

- [x] `hmac-verifier.ts` + tests (100% coverage)
- [x] `signal-ingest-route.ts` + tests (12 cases)
- [x] `server.ts` wiring
- [x] `.env.example` updated
- [x] Daemon `.py` created (scripts/qwen-signal-daemon/) — install on M1 Max post-merge
- [x] launchd plist created — install on M1 Max post-merge
- [ ] End-to-end smoke: Qwen → HMAC → CF Worker → D1 → SSE client sees signal (post-merge, M1 Max)
- [x] `npm run typecheck` green (0 errors)
- [x] All new + existing tests green (12 new + 810 existing pass)

## Success Criteria

- Daemon runs 1 hour on M1 Max, posts ≥1 valid signal
- Curl forging bad HMAC returns 401
- Signal with `strategy='qwen-m1max-v1'` appears in D1 `signals` table
- SSE client connected to production receives the signal live
- Zero regressions in 211 existing tests

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| HMAC secret leaked in git | Low | `.env.example` uses placeholder; real secret only in CF env + M1 Max env |
| Daemon spams on crash loop | Medium | launchd `ThrottleInterval=60` + KeepAlive |
| Qwen hallucinates malformed JSON | High | zod validation at ingest; reject invalid; log + metric |
| Network flaky M1 Max ↔ CF | Medium | 3-retry backoff; daemon-side buffer (in-memory queue, cap 100) |
| Replay attack | Low | 60s ts window + nonce (signal id already computed server-side via dedup guard) |

## Security Considerations

- HMAC secret rotation: document quarterly rotation in `docs/system-architecture.md`
- Never log signature or body at INFO level (DEBUG only, with secret redaction)
- Daemon has NO live-trade authority — only pushes signals. Trade execution still gated by Phase 04.
- Route under `/api/v1/signals/ingest` — NOT publicly listed, add `X-Robots-Tag: noindex`

## Next Steps

- Phase 04 depends on this: paper-gate integration observes `strategy='qwen-m1max-v1'` rows.
- Phase 05 tests will exercise full end-to-end.
