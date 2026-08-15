# WebSocket Message Replay + Centralized Logging — Completion Report

**Date:** 2026-08-14  
**Status:** Complete  
**Files changed:** 8 new/modified  

---

## Summary

Implemented sequence-number-based WebSocket message replay and centralized structured logging infrastructure for algo-trader.

---

## 1. WebSocket Message Replay with Sequence Numbers

### New files

| File | Lines | Purpose |
|------|-------|---------|
| `src/platform/websocket/message-replay.ts` | 193 | Redis-backed ring buffer using sorted sets (score = seq). TTL auto-pruning, cap at 1000 msgs/channel. |
| `src/platform/websocket/sequence-manager.ts` | 103 | Atomic per-channel sequence numbers via Redis INCR. Timestamp fallback when Redis unavailable. |
| `src/platform/websocket/index.ts` | 7 | Module barrel export. |

### Modified files

| File | Changes |
|------|---------|
| `src/platform/api/ws-adapter-redis.ts` | Added `seq` to all published messages. Added `reconnect` message type handler. Added `handleReconnect()` method that replays missed messages or sends `snapshot_required`. Tracks `lastSeqs` per client. |
| `src/ui/shared/ws-client.js` | Added `lastSeqs` tracking, dedup set, `sendReconnect()` on open, `replay_start`/`replay_end`/`snapshot_required` event handling, jitter on reconnect backoff, `getLastSeq()`/`forceReconnect()` exports. |

### Protocol

```
Client connects → server sends { type: 'connected' }
Client sends    → { type: 'reconnect', lastSeqs: { trades: 42, signals: 100 } }
Server checks   → isReplayable(channel, lastSeq)
  If yes:       → { type: 'replay_start' } ... messages ... { type: 'replay_end' }
  If no:        → { type: 'snapshot_required', channel }
```

### Storage model

```
ws:seq:{channel}          → Redis key, INCR counter
ws:replay:{channel}       → Redis sorted set, score=seq, TTL=300s
```

---

## 2. Centralized Logging

### New files

| File | Lines | Purpose |
|------|-------|---------|
| `src/platform/logging/log-aggregator.ts` | 265 | `LogAggregator` class with structured JSON logging, 5 log levels, trace IDs, buffer + batch flush, 3 backends (Stdout, File, Http). `ChildLogger` for scoped context. |
| `src/platform/logging/index.ts` | 16 | Module barrel export. |

### Modified files

| File | Changes |
|------|---------|
| `src/shared/utils/logger.ts` | Added `setAggregator()` bridge. Logger now reads `LOG_LEVEL` from env. Added `extractContext()` and `extractError()` helpers. When aggregator is set, all log calls route to both console and aggregator. |

### Backend options

- **StdoutBackend** — JSON lines to stdout (default)
- **FileBackend** — Rotating file writer, configurable max size
- **HttpBackend** — Batch POST to HTTP endpoint (Loki push API, etc.)

### Log entry format

```json
{
  "level": "error",
  "message": "Failed to connect",
  "timestamp": "2026-08-14T12:00:00.000Z",
  "service": "algo-trader",
  "traceId": "m1a2b3c-x7y8z9",
  "context": { "channel": "trades", "attempt": 3 },
  "error": { "name": "Error", "message": "ECONNREFUSED", "stack": "..." }
}
```

---

## 3. Docker Compose + Loki Stack

### Modified files

| File | Changes |
|------|---------|
| `docker-compose.prod.yml` | Added `loki`, `promtail`, `nats-exporter`, `postgres-exporter` services. Added `loki-data` volume. Added `LOG_BACKEND`/`LOG_LEVEL` env vars to app service. |

### New config files

| File | Purpose |
|------|---------|
| `config/loki-config.yml` | Loki server config — TSDB storage, 7-day retention, inmemory ring |
| `config/promtail-config.yml` | Log shipper — reads Docker container logs, relabels by container name/compose service, parses JSON from structured logger |

---

## TypeScript Compilation

All new and modified files compile cleanly (`npx tsc --noEmit`). The 67 pre-existing errors in the codebase (polymarket strategy registry type mismatches, env-schema, app.ts) are unrelated to this change.

---

## Architecture Decisions

1. **Redis sorted sets for replay buffer** — O(log N) range queries, natural TTL support, capped with ZREMRANGEBYRANK
2. **Separate Redis keys per channel** — avoids contention, allows per-channel cleanup
3. **Snapshot fallback for large gaps** — prevents sending thousands of replay messages; client does full reload instead
4. **Aggregator bridge pattern** — existing `logger` calls now transparently route to aggregator without changing 90+ call sites
5. **Promtail for container log shipping** — zero-config Docker SD, parses structured JSON from our logger

---

## Unresolved Questions

1. **Snapshot data source**: The `snapshot_required` event tells the client to reload, but the actual snapshot data provider (HTTP endpoint or initial WS payload) is not implemented yet. Depends on how the dashboard fetches initial state.
2. **Replay buffer TTL tuning**: 300s (5 min) default may be too short for slow-reconnecting clients on mobile. Consider making it configurable via env var.
3. **Loki storage sizing**: At high message rates, Loki TSDB storage could grow. The 7-day `reject_old_samples_max_age` limits query window but storage is unbounded on disk. Consider adding `max_cache_size` to Loki config.
4. **Promtail log routing**: Currently all container logs go to Loki. May want to add pipeline stages to filter or route logs by severity (e.g., only `error`+ to alert channel).
