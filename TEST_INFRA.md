# E2E Test Infra: Multi-Engine Autonomous Desk Runner (`desk:auto`)

## Test Philosophy
- Opaque-box, requirement-driven testing based on `ORIGINAL_REQUEST.md`.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial + Real-World Workload + Adversarial Hardening.
- Pass/Fail Semantics: 100% test pass rate, 0 TypeScript errors (`npm run typecheck`), 0 ESLint warnings (`npm run lint`), strict coverage >= 80%.

## Feature Inventory
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
|---|---------|---------------------|:------:|:------:|:------:|:------:|:------:|
| 1 | CLI `desk:auto` Options & Validation | ORIGINAL_REQUEST R1.1, R1.2 | 5 | 5 | ✓ | ✓ | ✓ |
| 2 | CLI `desk:status` Real-time Inspection | ORIGINAL_REQUEST R1.3 | 5 | 5 | ✓ | ✓ | ✓ |
| 3 | Market Data Multiplexer & Mid Prices | ORIGINAL_REQUEST R3.1, R3.2 | 5 | 5 | ✓ | ✓ | ✓ |
| 4 | Feed Freshness Watchdog & Dead-Man Switch | ORIGINAL_REQUEST R3.3 | 5 | 5 | ✓ | ✓ | ✓ |
| 5 | Concurrent 4-Engine Supervisor | ORIGINAL_REQUEST R2.1 | 5 | 5 | ✓ | ✓ | ✓ |
| 6 | Master Daemon Tick Loop & Priority Ingestion | ORIGINAL_REQUEST R2.2 | 5 | 5 | ✓ | ✓ | ✓ |
| 7 | Fail-Closed Signal Intercept (<= 100ms) | ORIGINAL_REQUEST R2.3 | 5 | 5 | ✓ | ✓ | ✓ |
| 8 | Isolated Prometheus Metrics Exporter | ORIGINAL_REQUEST R4.2 | 5 | 5 | ✓ | ✓ | ✓ |
| 9 | HTTP Status Server (/health, /status, etc.) | ORIGINAL_REQUEST R4.1 | 5 | 5 | ✓ | ✓ | ✓ |
| 10 | Zero Accounting Drift Verification (< 10^-4) | ORIGINAL_REQUEST R4.3 | 5 | 5 | ✓ | ✓ | ✓ |

## Test Architecture
- **Runner**: Vitest via `npx vitest run tests/desk/daemon/`
- **Mocking Strategy**: In-memory mock exchanges and feed timers for deterministic latency, tick, and signal delivery. Zero external network calls in unit/integration tests.
- **Port Allocation**: Dynamic ephemeral port (`port: 0`) in tests to guarantee zero port collisions.
- **Directories**:
  - `tests/desk/daemon/tier1-feature-coverage.test.ts`
  - `tests/desk/daemon/tier2-boundary-conditions.test.ts`
  - `tests/desk/daemon/tier3-cross-feature.test.ts`
  - `tests/desk/daemon/tier4-real-world-workload.test.ts`
  - `tests/desk/daemon/tier5-adversarial-hardening.test.ts`

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Target Behavior |
|---|----------|--------------------|-----------------|
| 1 | Full Paper Day Trading Session | F1, F3, F5, F6, F8, F9, F10 | Starts in PAPER mode, streams 4-engine signals, executes via SOR, tracks zero drift, exposes metrics |
| 2 | Feed Blackout & Dead-Man Tripwire | F4, F6, F7, F8, F9 | Sudden stall of WebSocket feed trips watchdog > 5,000ms -> halts trading <= 100ms |
| 3 | Operator Graceful Termination | F1, F6, F7, F8, F9 | Terminal operator sends `SIGINT` -> daemon cancels open orders, closes HTTP server, exits code 0 |
| 4 | Rapid Multi-Engine Arbitrage & Volatility Spike | F3, F5, F6, F10 | High-velocity signals from Arbitrage and MARL -> processed in priority order with zero drift |
| 5 | HTTP Status & Prometheus Telemetry Query | F1, F2, F8, F9 | Monitoring system polls `/metrics` and `/status` continuously during live engine transitions |

## Coverage Thresholds
- Tier 1: $\ge 5$ test cases per feature (50 tests minimum)
- Tier 2: $\ge 5$ boundary/corner cases per feature (50 tests minimum)
- Tier 3: Pairwise combinations across major features (15 tests minimum)
- Tier 4: $\ge 5$ realistic multi-engine application scenarios
- Tier 5: Adversarial hardening and chaos testing (10 tests minimum)
- Overall Target: $\ge 130$ tests in `tests/desk/daemon/` with 100% pass rate
