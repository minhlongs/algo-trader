# Context — Environmental Setup

## Application Setup
- **REST Port**: 3000 (Express server)
- **Websocket Port**: 3000 (ws server at `/ws` path)
- **Dashboard Port**: 5173 (Vite development) / serves static dist on Port 3001 in production
- **API URLs**: http://localhost:3000

## Database & Caching
- **PostgreSQL**: host=`localhost`, port=`5432`, database=`algo_trader`
- **Redis Cluster**: 6 nodes, ports 7000 to 7005 on localhost (`127.0.0.1`)

## Verification Targets
- **p95 Latency**: < 100ms under 5000 concurrent VUs
- **Test Suites**:
  - Backend: 1500+ unit and integration tests (using `vitest`)
  - Frontend: 35 tests (using `vitest` / playwright)
- **Memory Leak check**: Apple Silicon M1 Max, continuous stress run for 5 minutes.
