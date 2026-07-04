# Phase 1: HTTP/2 Connection Pooling

**Priority:** High (foundation optimization)
**Status:** Ready
**Group:** A

## Context

Polymarket adapter hiện tại dùng HTTP/1.1 với new connection per request. Cần giảm latency 50-150ms qua HTTP/2 multiplexing + DNS caching.

## Target Files

- `src/execution/polymarket-adapter.ts` (modify)
- `src/execution/http2-connection-pool.ts` (new)

## Architecture

```
Http2ConnectionPool (singleton)
  ├─ keepAlive: true, keepAliveInitialDelay: 30s
  ├─ noDelay: true (disable Nagle)
  ├─ DNS cache với TTL-aware refresh (refresh 30s before expiry)
  └─ Max connections: 10 (configurable via POLY_MAX_CONNECTIONS)

PolymarketAdapter (refactor)
  ├─ Inject Http2ConnectionPool
  ├─ Reuse sessions for all API calls
  ├─ Pre-warm with PING frames
  └─ Circuit breaker cho connection failures
```

## Implementation Steps

1. **Create `http2-connection-pool.ts`:**
   ```typescript
   export class Http2ConnectionPool {
     private sessions: Map<string, ClientHttp2Session> = new Map();
     getSession(url: string): Promise<ClientHttp2Session>;
     releaseSession(url: string, session: ClientHttp2Session): void;
     warmConnections(): Promise<void>;
     dnsCache: Map<string, {addr: string, expires: number}> = new Map();
   }
   ```

2. **Modify `polymarket-adapter.ts`:**
   - Replace `fetch()` / `axios` với pool sessions
   - Use `session.request()` với multiplexed streams
   - Add metrics: `polymarket_http2_reuse_total`, `polymarket_http2_new_total`
   - Handle session errors with auto-reconnect

3. **DNS caching:**
   - Cache DNS lookups với TTL tracking
   - Background refresh before expiry
   - Avoid ~20-50ms initial lookup latency

4. **Testing:**
   - Unit tests: pool session management, DNS cache expiry
   - Integration test: 100 requests measure p50/p99 latency vs baseline
   - Load test: 1000 concurrent requests, verify no connection exhaustion

5. **Metrics:**
   - `polymarket_http2_connections_active` gauge
   - `polymarket_http2_requests_total` counter (label: reused=true/false)
   - `polymarket_latency_ms` histogram (before/after)
   - `polymarket_dns_cache_hits_total` counter

## Acceptance Criteria

- [ ] p50 latency ≥30% improvement (target: <50ms vs baseline ~70ms)
- [ ] Zero connection leaks (all sessions properly closed)
- [ ] Auto-reconnect on session close/error
- [ ] DNS cache hit rate ≥80% after warmup
- [ ] All existing Polymarket adapter tests still pass
- [ ] No new lint/type errors

## Risks

- Polymarket API có hỗ trợ HTTP/2? (Kiểm tra trong researcher phase — assume yes, fallback to HTTP/1.1 pool nếu cần)
- Connection limits trên Cloudflare (Polymarket dùng CF?) — respect 10 connection limit per origin

## Related

- Phase 2 (Kelly) — độc lập
- Phase 3 (Scanner) — độc lập
- No shared files → parallel execution safe