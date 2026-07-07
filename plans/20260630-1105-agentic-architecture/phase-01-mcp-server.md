---
priority: P0
status: pending
title: "Phase 1: MCP Server"
estimated_days: 2
---

# Phase 1: MCP Server

## Overview

JSON-RPC 2.0 + SSE endpoint at `/api/mcp/signals` for external integrations (CLI tools, dashboards, trading bots). CF Worker layer on top of the existing Express API.

## Architecture

```text
Client → /api/mcp/signals → MCPRouter → RaasGate (auth) → Service registry → handlers
                                                    → SSE: sseBroadcaster (reused)
```

## Key Findings from Research

- SSE streaming already exists in `src/desk/signal/sse-signal-broadcaster.ts` — reuse for real-time signals
- Auth via `RaasGate` + `license-service.ts` — API key → License → Tier
- Zod validation pattern in all route files
- Logger utility at `src/shared/utils/logger.ts`

## Files to Create

- `src/api/routes/mcp-routes.ts` (new) — Router with JSON-RPC 2.0 handlers
- `src/platform/workers/mcp-edge-proxy.ts` (new) — CF Worker wrapping the SSE bridge

## Files to Modify

- `src/platform/api/server.ts` — Mount mcpRouter at `/api/mcp`
- `wrangler.toml` — Add MCP route + KV binding for SSE connection tracking

## Files to Read (for patterns)

- `src/api/routes/signal-feed-routes.ts` — Zod validation, tier resolution, SSE stream (350 lines pattern)
- `src/intelligence/signal-consensus-swarm.ts` — Consensus tool interface

## Tool Registry (from research)

```ts
const MCP_TOOLS = {
  get_signals:       { auth: "API key" },
  subscribe:         { auth: "tier-gated (PRO+)" },
  check_track_record:{ auth: "public" },
  get_consensus:     { auth: "tier-gated" },
  list_strategies:   { auth: "public" },
  get_performance:   { auth: "public" },
};
```

## Implementation Steps

1. Create `MCPToolRegistry` class mapping tool names → handler functions
2. Implement `handleJsonRpcRequest()` — parse, route, respond with `jsonrpc: "2.0"`
3. Add SSE streaming for `get_signals` using existing `sseBroadcaster.subscribe(res)`
4. Reuse `resolveTier()` from `signal-feed-routes.ts` for auth
5. Add Zod schemas for each tool's input params
6. Mount `mcpRouter` in `server.ts` after signal routes
7. CF Worker: proxy `/api/mcp/signals` to origin (same origin for simplicity; SSE just passes through)
8. Write unit tests: 1 per tool + 1 for error cases (invalid JSON-RPC, bad auth, unknown method)

## Acceptance Criteria

- [ ] `POST /api/mcp/signals` with valid JSON-RPC body returns correct response
- [ ] `GET /api/mcp/signals` SSE stream opens for PRO+ tier
- [ ] Unauthenticated request → 401
- [ ] Unknown method → `{ jsonrpc: "2.0", error: { code: -32601 } }`
- [ ] All 6 tools callable
- [ ] Tests: ≥ 5 test cases, all pass

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SSE auth revocation mid-session | Medium | Medium | Use short-lived connection timeout (60s); re-auth on reconnect |
| JSON-RPC batch requests | Low | Low | Defer — handle single request first |

## Rollback

Feature-flag in wrangler.toml: `ENABLE_MCP_SERVER=false` → skip router mount. No data migration needed.
