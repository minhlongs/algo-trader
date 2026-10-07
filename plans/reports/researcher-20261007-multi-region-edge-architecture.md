# Research: Cloudflare Workers Multi-Region Edge Deployment Architecture

## Executive Summary & Architecture Context
- **Target System**: Algo-Trader Edge Proxy & Trading Desk on Cloudflare Workers (V8 Isolates).
- **Core Objective**: Sub-50ms p95 latency across 3 global trading hubs (`us-east`, `eu-central`, `ap-southeast`), zero-cold-start execution, resilient data layer distribution (KV, D1, DO), and elimination of hot-path routing bottlenecks under KISS/YAGNI/DRY.

## 1. Requirements & Core Topology
- **3-Region Hub Distribution**:
  - `us-east` (IAD/EWR): Primary coordinator, D1 primary write database, US strategy shards.
  - `eu-central` (FRA/LHR): European market execution, GDPR-compliant DO shards (`jurisdiction: "eu"`).
  - `ap-southeast` (SIN/NRT): Asian trading desk, low-latency colocation for APAC exchange feeds.
- **Geo-Routing Strategy**:
  - Primary dispatch uses `request.cf.country` and `request.cf.colo` (IATA airport codes) mapped via constant lookup table (<0.1ms compute).
  - Smart Placement (`[placement] mode = "smart"` in `wrangler.toml`): Cloudflare auto-routes compute near backend data services when subrequests dominate; for pure edge trading, explicit regional worker routing + DO location hints (`wnam`, `weur`, `apac`) override placement.
- **Failover Hierarchy**:
  - Client Edge PoP -> Preferred Regional Worker -> Secondary Adjacent Region (e.g. EU -> US -> APAC) -> VPS Origin Fallback.

## 2. Data Layer Distribution & Consistency
- **Cloudflare KV (Global Cache)**:
  - Read-at-edge (<5ms latency across 300+ PoPs) with asynchronous global eventual consistency (60s replication SLA).
  - Use case: Auth session tokens, tier rate limits, user roles, static market schemas, IPN deduplication keys.
- **Cloudflare D1 (Read Replication & Sessions)**:
  - Single-primary writes (in `us-east`) + auto-distributed edge Read Replicas (`read_replication = true`).
  - Read-Your-Writes consistency: Enforce D1 Sessions API (`withSession(token)`) using `X-D1-Bookmark` header for post-mutation reads (subscription upgrades, coupon redemptions).
- **Durable Objects Sharding (12-Shard Ring)**:
  - Consistent hash ring distributes strategies across 12 shards (`SHARD_0`..`SHARD_11`) with 100 virtual nodes each.
  - Cross-region placement: Instantiate DOs with location hints (`env.SHARD_N.get(id, { locationHint: 'wnam' | 'weur' | 'apac' })`) colocating DO state with target exchange gateways.

## 3. Edge Routing Pipeline & Hot-Path Defect
- **CRITICAL DEFECT IDENTIFIED (`src/platform/workers/edge-proxy.ts:93`)**:
  - *Finding*: `edge-proxy.ts` executes in-band `await getRegionHealth(env)` on every `/api/*` request, making 3 cross-region HTTP fetches before routing. This injects 150-500ms overhead and risks 5s timeout cascades on origin degradation.
  - *Fix*: Decouple health checks to background 30s cron trigger (`scheduled`) + regional KV health cache (`region:health:status`). Edge fetch reads KV/memory cache in <1ms.
- **`/api/health/region` Contract**:
  - Returns `{ region: string, status: "healthy" | "degraded", latencyP95: number, errorRate: number, timestamp: string }`.
- **VPS Origin Fallback & Circuit Breaker**:
  - `VPS_ORIGIN` handles legacy endpoints not yet ported to worker isolates; edge circuit breaker trips after 3 consecutive 5xx failures with 60s recovery grace period.
- **CORS & Security Headers**:
  - Standardized propagation: Strict HSTS (max-age 31536000), CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and preflight 204 responses.

## 4. Latency Bounds, Zero-Cold-Start & Connection Pooling
- **Performance Benchmarks & SLAs**:
  - Edge Cache / KV Read: p95 < 10ms (Local PoP).
  - D1 Read Replica Query: p95 < 25ms.
  - DO Strategy Execution: p95 < 15ms (local region) / <85ms (cross-region).
  - End-to-End API Response: p95 < 50ms, p99 < 100ms.
- **Zero-Cold-Start Architecture**:
  - V8 Isolates eliminate JVM/Node container boot overhead (<5ms isolate startup vs 300-1500ms container start).
  - 5-minute scheduled cron ping (`*/5 * * * *`) prevents worker isolate eviction across high-traffic PoPs.
- **Connection Pooling (`connection-pool.ts`)**:
  - Persistent TLS/HTTPS connection pooling to upstream exchanges and LLMs (Polymarket, OpenAI, Binance), saving ~120ms per external handshake.

## 5. Trade-off Matrix
| Dimension | Pure Edge (Workers + D1 + DO) | Hybrid (Edge Proxy + Regional VPS) | Centralized VPS (Single Origin) |
| :--- | :--- | :--- | :--- |
| **P95 Latency** | **<50ms** (Global) | 80-150ms | 250-450ms (cross-continent) |
| **Write Consistency** | Eventual (D1 replicas / KV) | Strong (Postgres ACID) | **Strongest** (Single DB lock) |
| **Availability / SPOF** | **99.99%** (No single point) | High (Edge absorbs failures) | Low (Single host failure) |
| **Operational Overhead**| **Low** (Zero server patching) | Medium (Docker + Wrangler) | High (Multi-server maintenance) |
| **Infra Cost at Scale** | **Low-Medium** (Pay-per-request)| Medium (Edge + 3x VPS) | High (Oversized VPS instances) |

## 6. Adoption Risks & Ranked Recommendations
- **Rank 1: Remove In-Band Health Probes from Edge Hot Path** (*Severity: Critical*):
  - In-band `getRegionHealth()` degrades throughput and breaks <50ms SLA. Store health state in KV updated via background cron.
- **Rank 2: Implement D1 Session Bookmarks for Read Replicas** (*Severity: High*):
  - Risk of dirty reads post-checkout without `withSession()` bookmarks on replicated D1 read nodes.
- **Rank 3: Bind DO Location Hints across 12 Strategy Shards** (*Severity: High*):
  - Colocate `SHARD_0`..`SHARD_3` in `wnam`, `SHARD_4`..`SHARD_7` in `weur`, `SHARD_8`..`SHARD_11` in `apac` to eliminate cross-ocean DO hops.
- **Rank 4: Configure Smart Placement with Local Overrides** (*Severity: Medium*):
  - Enable `[placement] mode = "smart"` in `wrangler.toml` for DB-heavy routes, preserving edge-first execution for market ticks.

## 7. Sources Consulted
- [Cloudflare Workers Smart Placement Documentation](https://developers.cloudflare.com/workers/configuration/smart-placement/)
- [Cloudflare D1 Read Replication & Sessions API](https://developers.cloudflare.com/d1/learning/read-replication/)
- [Cloudflare Durable Objects Location Hints & Jurisdictions](https://developers.cloudflare.com/durable-objects/reference/data-location/)
- [Cloudflare Workers KV Architecture & Latency Profile](https://developers.cloudflare.com/kv/)
- Internal Repo: `edge-proxy.ts`, `edge-proxy-regions.ts`, `latency-monitor.ts`, `load-test-multi-region.ts`

## 8. Limitations & Unresolved Questions
- *Limitations*: WebSocket failover during active trading socket reconnection was not simulated under network split conditions.
- *Unresolved Questions*:
  - Does Cloudflare D1 write replication lag to `ap-southeast` exceed 150ms under peak burst write loads?
  - Should strategy state persistence sync synchronously to DO storage or asynchronously to D1 ledger?
