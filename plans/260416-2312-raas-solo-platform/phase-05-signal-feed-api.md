# Phase 05 — Signal Feed API (REST + Telegram Delivery)

**File ownership:** `src/signal/**`, `src/api/routes/signal-feed-routes.ts`, `src/api/routes/signal-subscription-routes.ts`, `src/db/migrations/014_signal_*.sql`

## Context Links

- PDF digest: `plans/reports/researcher-260416-2312-deepseek-solo-platform.md`
- Scout reuse: `plans/reports/scout-260416-2312-raas-reuse-surface.md` (BUILD-NEW #3)
- Existing: `src/telegram/*` (Telegram infra), `src/gate/raas-gate.ts` (tier gate)

## Overview

- Priority: P1
- Status: pending
- Brief: Public-facing signal feed API. Subscribers poll REST or subscribe to Telegram channel for signals. Tier-gated: Starter=daily digest, Pro=hourly, Elite=realtime.

## Key Insights

- Signals = strategy outputs filtered by confidence + size
- Reuse existing `src/telegram/*` bot infrastructure
- Tier gate via `src/gate/raas-gate.ts.canAccessFeature('signal.realtime')`
- Delivery latency = product differentiator between tiers

## Requirements

**Functional:**
- `GET /api/v1/signals?since=<ts>` paginated REST (auth required, tier-gated)
- `GET /api/v1/signals/stream` SSE for Elite tier
- Telegram bot: `/subscribe`, `/unsubscribe`, push on new signal
- Signal schema: `{id, ts, market, side, size, confidence, strategy, ttl}`
- Dedup: signal_id = sha256(strategy+market+side+bucket-ts)

**Non-functional:**
- REST P95 < 100ms
- SSE delivery < 2s from signal generation
- Telegram push < 5s
- 1000 concurrent SSE connections per Worker

## Architecture

```
strategy engine ──> signal-publisher ──> D1 (signals table)
                                    └──> telegram-pusher
                                    └──> sse-broadcaster
                                    └──> rest-cache-warmer
```

## Related Code Files

**Create:**
- `src/signal/signal-publisher.ts` (~150 LOC)
- `src/signal/signal-dedup-guard.ts` (~100 LOC)
- `src/signal/signal-tier-filter.ts` (~120 LOC)
- `src/signal/signal-ttl-enforcer.ts` (~80 LOC)
- `src/signal/telegram-signal-pusher.ts` (~150 LOC)
- `src/signal/sse-signal-broadcaster.ts` (~150 LOC)
- `src/signal/signal-rest-cache.ts` (~120 LOC)
- `src/signal/index.ts` (~40 LOC barrel)
- `src/api/routes/signal-feed-routes.ts` (~180 LOC)
- `src/api/routes/signal-subscription-routes.ts` (~150 LOC)
- `src/signal/__tests__/signal-publisher.test.ts`
- `src/signal/__tests__/signal-dedup-guard.test.ts`
- `src/signal/__tests__/signal-tier-filter.test.ts`
- `src/db/migrations/014_signal_feed.sql`

**Modify:**
- `src/api/server.ts` — register new routes
- `src/trading-pipeline.ts` — emit signal-publisher hook after strategy output

## Implementation Steps

1. Migration `014_signal_feed.sql` (tables: `signals`, `signal_subscriptions`, `signal_delivery_log`)
2. Build `signal-publisher.ts` (ingest strategy output, write to D1)
3. Build `signal-dedup-guard.ts` (reject duplicate signal_ids within TTL)
4. Build `signal-tier-filter.ts` (filter visible signals by tier)
5. Build `signal-ttl-enforcer.ts` (expire stale signals in D1)
6. Build `signal-rest-cache.ts` (KV-backed cache layer)
7. Build `sse-signal-broadcaster.ts` (in-Worker pub/sub via Durable Object or KV)
8. Build `telegram-signal-pusher.ts` (reuse telegram bot client)
9. Build REST routes: feed + subscription mgmt
10. Wire publisher into `trading-pipeline.ts` (hook, not replace)
11. Unit tests: dedup, tier filter, TTL expiry
12. Integration: publish 10 signals → Starter sees none realtime, Elite sees all via SSE

## Todo List

- [ ] Migration 014 applied
- [ ] `signal-publisher.ts` + test
- [ ] `signal-dedup-guard.ts` + test
- [ ] `signal-tier-filter.ts` + test (all 3 tiers)
- [ ] `signal-ttl-enforcer.ts` + test
- [ ] `signal-rest-cache.ts` + test
- [ ] `sse-signal-broadcaster.ts` + test
- [ ] `telegram-signal-pusher.ts` + test
- [ ] `signal-feed-routes.ts` + test (auth, pagination)
- [ ] `signal-subscription-routes.ts` + test
- [ ] `trading-pipeline.ts` publisher hook
- [ ] E2E: Elite subscriber SSE receives realtime signal < 2s

## Success Criteria

- `bun test src/signal src/api/routes/signal-*` green
- Tier enforcement: Starter REST returns daily digest only
- Telegram bot `/subscribe` round-trips and pushes on new signal
- SSE stream survives Worker restart (client reconnects)
- No `any` / `@ts-ignore`

## Risk Assessment

- **R1:** SSE on CF Workers needs Durable Objects for fan-out → use DO or fall back to polling for MVP
- **R2:** Telegram rate limits (30 msg/sec channel) → queue + batch
- **R3:** Signal spam → enforce min-confidence threshold per tier
- **R4:** Race between publisher and dedup → use D1 UNIQUE on signal_id

## Security Considerations

- Auth via existing Better Auth session OR API key
- Rate limit per subscriber via `src/gate/validators.ts`
- Signal content flows through IronClaw (Phase 03) — no PII leakage

## Next Steps

- Phase 07 enterprise tier gets dedicated signal channel + SLA
- Post-MVP: webhook delivery, custom filters per subscriber
