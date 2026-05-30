# Project: Algo-Trader RaaS Performance Optimization and Stress Testing

## Architecture
The Algo-Trader RaaS Platform consists of the following components:
1. **API Server (REST + WebSocket Gateway)**: Express application serving REST routes for trading analytics, auth, PnL, and managing WebSocket connections using `RedisWSAdapter`.
2. **PostgreSQL Database**: Connection pool (`postgres-client.ts`) for storing and querying trade history (`TradeRepository`).
3. **Redis Cluster (6-node)**: ioredis Cluster client configuration (`cluster-config.ts`) with 3 masters + 3 replicas, providing distributed caching and pub/sub.
4. **Dashboard**: React + TypeScript frontend dashboard, fetching REST endpoints and connecting to the `/ws` WebSocket endpoint, displaying signal Bento Grid and candlestick charts.
5. **k6 Load Tester**: Automatic load/stress tester simulating 5000+ VUs on API Gateway and WS connections.

## Code Layout
- `src/db/`: PostgreSQL connection client, migration runner, and TradeRepository.
- `src/redis/`: Redis cluster configuration, pub/sub client, and cache managers.
- `src/api/`: Express HTTP server, routes, and `ws-adapter-redis.ts` websocket gateway.
- `dashboard/`: React + TypeScript frontend code, Vite configs, components, and pages.
- `tests/`: Integration, unit, and load tests.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | PostgreSQL Query and Index Optimization | Analyze slow queries in `TradeRepository`, run migrations with composite indexes, and optimize query latency. | none | DONE |
| M2 | Redis Cluster Load Rebalancing | Tune Redis Cluster options, scale reads to replicas (`scaleReads: 'slave'`), optimize connection pool, and ensure auto-failover resilience. | none | DONE |
| M3 | WebSocket Message Compression | Integrate `permessage-deflate` on WebSocket server and client, configuring thresholds and memory budgets to reduce bandwidth. | none | DONE |
| M4 | Bento Grid Dashboard Rendering Polish | Implement React performance optimization (memoization, virtualization, throttling, canvas rendering) for candlestick chart and Bento Grid. | none | DONE |
| M5 | k6 Load Test Scripting & Execution | Develop and execute a k6 load script simulating 5000+ VUs accessing API and WebSocket endpoints concurrently. | M1, M2, M3 | DONE |
| M6 | Acceptance Verification & Testing | Verify p95 latency < 100ms under load, run all 1500+ backend tests, 35 frontend tests, and profile memory leaks on M1 Max. | M4, M5 | PLANNED |

## Interface Contracts
### WebSocket Client ↔ WS Adapter
- Endpoint: `/ws`
- Connection: WebSocket connection with support for optional `permessage-deflate` extension.
- Incoming messages:
  - `{ type: "subscribe", channel: string }`
  - `{ type: "unsubscribe", channel: string }`
  - `{ type: "ping" }`
- Outgoing messages:
  - `{ type: "connected", clientId: string, channels: string[], timestamp: number }`
  - `{ type: "subscribed", channel: string, timestamp: number }`
  - `{ type: "unsubscribed", channel: string, timestamp: number }`
  - `{ type: "pong", timestamp: number }`
  - `{ type: "trade" | "signal" | "order" | "market-data", channel: string, payload: any }`
