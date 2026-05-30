# BRIEFING — 2026-05-30T00:20:00-07:00

## Mission
Verify all acceptance criteria for the Algo-Trader RaaS performance optimization project, including E2E stress testing, memory profiling, and running full unit/integration test suites.

## 🔒 My Identity
- Archetype: teamwork_preview_worker
- Roles: implementer, qa, specialist
- Working directory: /Users/macbook/algo-trader/.agents/teamwork_preview_worker_verification
- Original parent: fae0d5e9-2837-4ae7-9b5b-a6197e0b53c6
- Milestone: Performance Verification

## 🔒 Key Constraints
- Start backend database-backed application server in background.
- Run k6 load test at tests/load/raas-gateway-load-test.js with 5000 VUs for 5 minutes.
- Profile Node.js API server process memory usage (RSS, Heap) at regular intervals (0m, 1m, 2m, 3m, 4m, 5m).
- Extract and verify p95 latency is under 100ms.
- Run all 1500+ backend and 35 frontend tests and ensure 100% pass rate.
- Terminate the backend server processes.
- Output handoff.md detailing all commands, test outcomes, load test summary, and memory profiling.

## Current Parent
- Conversation ID: fae0d5e9-2837-4ae7-9b5b-a6197e0b53c6
- Updated: not yet

## Task Summary
- **What to build**: E2E stress testing verification suite, profiling monitor, and test execution.
- **Success criteria**: Stable memory profile (no leaks), p95 latency < 100ms, and 100% pass rate on unit/integration tests.
- **Interface contracts**: /Users/macbook/algo-trader/.agents/orchestrator/PROJECT.md
- **Code layout**: /Users/macbook/algo-trader/

## Key Decisions Made
- Run verification flow directly on the application codebase.

## Artifact Index
- /Users/macbook/algo-trader/.agents/teamwork_preview_worker_verification/original_prompt.md — Original prompt
- /Users/macbook/algo-trader/.agents/teamwork_preview_worker_verification/handoff.md — Handoff report
- /Users/macbook/algo-trader/.agents/teamwork_preview_worker_verification/progress.md — Progress report
