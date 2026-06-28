## 2026-05-29T23:54:39Z
**Context**: We are optimizing the performance of the Algo-Trader RaaS platform.
**Identity**:
- Type: teamwork_preview_explorer
- Working Directory: /Users/macbook/algo-trader/.agents/teamwork_preview_explorer_db_opt
- Scope: /Users/macbook/algo-trader/.agents/orchestrator/PROJECT.md

**Objective**:
Analyze the PostgreSQL database schema (`src/db/schema.sql`, `src/db/migrations/`), connection pools (`src/db/postgres-client.ts`), and queries in `src/db/trade-repository.ts` and `src/db/pnl-service.ts`. Identify query performance bottlenecks and recommend indexing (e.g., composite/partial indexes) and schema optimization strategies. Do NOT modify any source code files directly.

**Output Requirements**:
Write a detailed report to `/Users/macbook/algo-trader/.agents/teamwork_preview_explorer_db_opt/analysis.md` detailing:
1. Current database query flow and schema layout.
2. Bottlenecks under load (5000+ VUs).
3. Recommended optimizations (indexes, configuration, or query structure).
4. SQL statements for database migrations to apply the indexes.

**Completion Criteria**:
Handoff report is written to the specified location. Send a message to the orchestrator (conversation ID: fae0d5e9-2837-4ae7-9b5b-a6197e0b53c6) when done.
