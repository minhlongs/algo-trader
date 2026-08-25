# DEPENDENCY_AUDIT — runtime dependency posture

> Increment S11 · audited 2026-08-26 · counts read from `package.json` (34 runtime deps, 26 devDeps).
> Upstream Vibe-Trading is Python; this repo is TypeScript/Node. No upstream Python deps were adopted.

## Runtime dependency groups (from `package.json`)

| Group | Packages | Role |
|---|---|---|
| HTTP/API | `express`, `fastify`, `hono`, `@hono/node-server`, `cors`, `helmet` | API surface (`src/app.ts`, `src/api/routes/`) |
| MCP | `@modelcontextprotocol/sdk` | research + signal MCP servers (`src/platform/mcp/`) |
| Validation | `zod` | boundary schemas incl. `src/desk/data/candle-contracts.ts` |
| DB | `pg`, `pg-query-stream`, `ioredis`, `bullmq` | Postgres (`src/desk/db/postgres-client.ts`), queues |
| Messaging | `nats`, `ws`, `grammy`, `twilio`, `@sendgrid/mail` | event bus, websockets, Telegram, SMS, email |
| Trading | `ccxt`, `@polymarket/clob-client`, `@polymarket/clob-client-v2`, `ethers` | CEX + prediction-market + on-chain execution |
| ML | `@tensorflow/tfjs`, `ollama`, `javascript-lp-solver` | model inference, optimization |
| Observability | `@sentry/node`, `prom-client`, `@opentelemetry/*` | errors, metrics, traces |
| Auth | `better-auth` | auth (`src/platform/auth/`) |
| Config | `dotenv`, `commander` | env loading, CLI (`src/desk/cli/cashclaw-cli.ts`) |

## What was NOT added from upstream

Upstream's Python stack (akshare, tushare, baostock, yfinance, alphavantage, quantlib-py, etc.) was deliberately not ported. Rationale per `MIGRATION_LOG.json` deferred list:

- **40+ data loaders** — only Binance/CCXT needed; each loader adds secret surface + maintenance.
- **Multi-asset engines** — repo is crypto + prediction markets only.
- **LLM provider routing** (`agent/src/providers/`) — research pipeline is deterministic TS, zero LLM-in-the-loop.

## Supply-chain controls

- **Secret scan** (CI Gate 2): `scripts/ci-gate-secret-scan.mjs` — 0 matches required.
- **Banned imports** (Gate 8 ratchet): `quality-baseline.json` enforces `bannedImports ≤ 0` (e.g. `@/lib/auth` legacy paths).
- **Lockfile integrity** (Gate 4): lockfile checked in CI.
- **No new `any` / no new `console.log`**: ratchet floors in `quality-baseline.json`, enforced by `scripts/check-quality-baseline.mjs`.

## Secrets posture

All credentials (exchange keys, DB URL, API tokens) live in environment config only — never in code or commits. Encryption boundary documented in `src/forest/rate-limit/docs/encryption-boundary.md`. See `SECURITY_MODEL.md` §4.

## Upgrade / risk notes

- `@tensorflow/tfjs` pinned exact (`4.22.0`) — heavy native dep; isolate usage.
- `ethers` v6 and `ccxt` are high-churn; pin and re-audit on bump.
- MCP SDK `@modelcontextprotocol/sdk` supports `readOnlyHint` annotations (used in S11, `src/platform/mcp/research-mcp-server.ts`).

## See also

- `SECURITY_MODEL.md` — secret + execution controls
- `MIGRATION_PLAN.md` — deferred upstream surface
- `MODULE_MAPPING.md` rows 3, 25 — rejected upstream modules
