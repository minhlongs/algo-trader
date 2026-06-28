## 2026-05-30T07:10:22Z

**Context**: Develop and validate the k6 load testing script simulating 5000+ virtual users (VUs) for the Algo-Trader RaaS platform.
**Identity**:
- Type: teamwork_preview_worker
- Working Directory: /Users/macbook/algo-trader/.agents/teamwork_preview_worker_k6_test
- Scope: /Users/macbook/algo-trader/.agents/orchestrator/PROJECT.md

**Objective**:
Develop the k6 load testing script:
1. Create the directory `tests/load/` if it does not exist.
2. Develop the k6 load testing script at `tests/load/raas-gateway-load-test.js`:
   - It should target REST endpoints: `/api/health`, `/api/status`, `/api/portfolio`, `/api/trades` (passing limit and offset pagination parameters), and `/api/pnl`.
   - It should connect to the `/ws` WebSocket endpoint, subscribe to `signals`, `pnl`, `trades`, and `price_update` channels, receive real-time ticker messages, send periodic ping messages, and close connections cleanly.
   - It should use k6 scenario stages to ramp up, run a steady load, and ramp down. Design the options to support up to 5000+ VUs (configurable via environment variables like `VUS` and `DURATION`).
3. Run a short validation run (e.g. 10 VUs for 10 seconds) of the k6 script against a locally running instance of the API server (you can build the project and launch the server in the background using `node dist/index.js` or `pnpm run api:serve`, run the test, and then terminate it).
4. Verify that the k6 script executes without errors and successfully records latencies and error rates.

**MANDATORY INTEGRITY WARNING**:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

**Output Requirements**:
Write a detailed handoff report to `/Users/macbook/algo-trader/.agents/teamwork_preview_worker_k6_test/handoff.md` detailing:
1. The path and content of the developed k6 script.
2. The verification steps taken, including commands used to build/run the server and k6.
3. The baseline metrics collected (VUs run, requests/sec, REST response latency p95, WS connection success rate, etc.).

**Completion Criteria**:
The k6 script is fully functional and validated without errors. Handoff report is written to the specified path and a message is sent back to orchestrator (conversation ID: fae0d5e9-2837-4ae7-9b5b-a6197e0b53c6).
