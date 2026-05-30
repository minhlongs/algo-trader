# Plan — Performance Optimization and Stress Testing

This plan decomposes the performance tuning and load testing tasks into sequential milestones, allocating specialised subagents for exploration, implementation, review, and verification.

## Strategy & Workflow
We will use the **Project Pattern**:
- **Milestones**: M1 through M6.
- **Iteration Loop**: For each milestone, we will spawn:
  1. `teamwork_preview_explorer` (analysis, index scan, or trace)
  2. `teamwork_preview_worker` (implement optimizations, run tests)
  3. `teamwork_preview_reviewer` (correctness, edge cases, performance)
  4. `teamwork_preview_auditor` (forensic integrity verification)
- **Exit Gate**: All criteria met, clean audit, no regression.

## Phase Breakdown

### Phase 1: PostgreSQL & Redis Cluster Tuning (R1)
- **M1 (PostgreSQL)**: Profile slow queries in `TradeRepository` under high concurrent reads/writes. Deploy database index optimizations via composite/partial indexes.
- **M2 (Redis Cluster)**: Tune ioredis cluster config, configure connection pools, enable replica reads (`scaleReads: 'slave'`), and write error retry/failover logic.

### Phase 2: Network & Rendering Optimization (R2)
- **M3 (WebSocket Compression)**: Add `permessage-deflate` to ws adapter and dashboard client. Tune compression levels to balance CPU usage vs network latency.
- **M4 (Dashboard Render Polish)**: Use React virtualization, memoization (`useMemo`, `useCallback`), custom throttling/debounce, and optimize canvas-based rendering for charts to prevent UI lagging.

### Phase 3: Stress Testing & E2E Validation (R3)
- **M5 (k6 Scripting & Baseline)**: Write and verify k6 script for API and WS endpoints, run baseline tests up to 5000+ VUs.
- **M6 (Final Acceptance Gates)**: Run continuous 5-minute stress test, trace memory leaks, ensure p95 latency < 100ms, and verify all 1500+ backend and 35 frontend tests pass 100%.
