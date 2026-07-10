---
title: Billing Polish + MCP Server Execution
status: in_progress
priority: P1
effort: medium
branch: main
tags: [billing, mcp, execution]
created: 2026-07-09
---

# Billing Polish + MCP Server Execution

## Source Plan
`plans/260708-2000-billing-polish-mcp/plan.md`

## Phases

| Phase | Source File | Status |
|-------|------------|--------|
| A | `phase-a-billing-polish.md` | pending |
| B | `phase-b-mcp-server.md` | pending |

## Mode
`--auto --deep --parallel` | Ultracode: most exhaustive, correct answer

## Success Criteria
- grep 0 dead NOWPayments functions/env vars
- npx vitest run exit 0
- MCP agent connects, get_signals works with tier filtering
