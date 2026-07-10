# Phase B — MCP Server for Signal Discovery

**Priority:** P1 | **Effort:** 2 days | **Dependencies:** Phase A complete

## Context Links

- Plan: `plan.md`
- Brainstorm: `plans/reports/260708-2000-billing-polish-mcp-brainstorm-report.md`
- Related: `plans/260708-0255-phase-a-billing-polish-plus-phase-b-mcp/phase-b-mcp-server.md`

## Overview

Build a Model Context Protocol (MCP) stdio server that lets AI agents natively discover and consume trading signals. This is the agentic positioning identified as the competitive moat.

## MCP Contract

| Concept | Algobot Surface |
|---------|-----------------|
| **Tool** | `get_signals(tier, since, limit)`, `get_subscription_status()` |
| **Resource** | Signal feed (paginated, `updatedAt`-tracked) |
| **Auth** | Reuses existing Bearer API key → tier resolution |
| **Transport** | stdio (local agent) |

## Requirements

1. Stdio MCP server using `@modelcontextprotocol/sdk`
2. `get_signals` tool: cache-first, tier-filtered, matches REST `/feed` response shape
3. `get_subscription_status` tool: subscriber lookup by API key
4. Auth: reject SIGNALS_FREE tier from SIGNALS_BASIC-required tool
5. Resource listing: `signal://feed/{tier}` URI scheme

## Files to Create

| File | Purpose |
|------|---------|
| `src/platform/mcp/signal-mcp-server.ts` | MCP server implementation |
| `tests/unit/signal-mcp-server.test.ts` | Tool contract + auth + tier tests |

## Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add `@modelcontextprotocol/sdk` dependency |

## Implementation Steps

1. **Install SDK** — `npm install @modelcontextprotocol/sdk`
2. **Scaffold stdio server** — Use `Server` class + `StdioServerTransport`. Register tools on `list_tools` handler.
3. **Wire `get_signals`** — Call `getCachedSignals(tier, since, limit)` then `filterSignalsForTier()`. Return `{ data, count, tier, cached }`.
4. **Wire `get_subscription_status`** — Call `signalSubscriberRepo.getBySubscriberId(apiKey)`.
5. **Auth integration** — Extract Bearer key from MCP session init params. Call `requireSignalTier('SIGNALS_BASIC')` gate.
6. **Resource listing** — Register `signal://feed/{tier}` URI with pagination params.
7. **Write tests** — tool call returns filtered signals, invalid key → auth error, FREE tier rejected, response shape matches REST contract.

## Todo List

- [ ] Install `@modelcontextprotocol/sdk`
- [ ] Create `signal-mcp-server.ts` with stdio transport
- [ ] Implement `get_signals` tool (cache-first, tier-filtered)
- [ ] Implement `get_subscription_status` tool
- [ ] Wire auth via signal-tier-resolver Bearer extraction
- [ ] Register `signal://feed/{tier}` resource
- [ ] Write unit tests (contract + auth + tier)
- [ ] Verify agent connects via local MCP client
- [ ] Run `npx vitest run` — all tests pass

## Success Criteria

- MCP server starts on stdio, responds to `initialize` handshake
- `get_signals` with SIGNALS_BASIC tier returns filtered signals
- `get_signals` with SIGNALS_FREE tier returns auth error
- `get_subscription_status` returns subscriber data for valid key
- Response shape matches `GET /api/v1/signals/feed` contract

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| SDK version mismatch | Low | Pin exact version; check changelog |
| No existing MCP test fixtures | Medium | Write minimal mock transport for tests |
| Auth model mismatch (stdio vs HTTP Bearer) | Low | Pass API key in MCP initialization params; test handshake |

## Rollback

Delete new files, remove dep from package.json. No existing APIs touched.
