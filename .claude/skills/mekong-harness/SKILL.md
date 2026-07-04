---
name: mekong-harness
description: "Orchestrate algo-trader development via me-deep-wrapper (MekongMind Solo Company Orchestrator). Goal management, department routing, gate verification, evidence contracts, MCP server coordination. Triggers: 'mekong status', 'mekong goal', 'mekong solo', 'mekong gates', 'mekong artifact', 'mekong bottlenecks', 'mekong allow', 'mekong route', 'harness status', 'gate verify', 'evidence contract', 'department routing', 'me goal', 'me solo', 'me gates', 'algo-trader orchestration', 'trading platform workflow', 'rerun goal', 'update goal', 'modify goal', 'based on previous results', 'improve goal'."
---

# Mekong Harness — algo-trader Orchestrator Skill

## Purpose

Orchestrate algo-trader development through me-deep-wrapper's MekongMind Solo Company Orchestrator. Maps algo-trader domains to me-deep-wrapper departments, manages evidence contracts, and coordinates agent execution via MCP servers.

## Phase 1: Context Check

Before any operation, determine run mode based on `_workspace/` existence:

| Condition | Mode | Action |
|-----------|------|--------|
| `_workspace/` missing | **initial** | Fresh run — create new goal, execute full pipeline |
| `_workspace/` exists + new input | **follow-up** | Continue from last state, check `me goal show` |
| `_workspace/` exists + partial modify | **partial** | Resume interrupted phase, verify gate state |

```bash
# Context check
if [ -d "_workspace" ]; then
  me goal show  # Check current state
  me solo bottlenecks --strict  # Find next action
else
  echo "Initial run — no prior state"
fi
```

## Pre-Work Protocol

1. `/mekong status` — active goal, gate, bottleneck
2. `/mekong gates` — ensure current gate has evidence
3. `/mekong allow <command>` — verify command allowed at current gate

## Commands

| Command | Action | CLI |
|---------|--------|-----|
| `/mekong goal <text>` | Create/show goal | `me goal "<text>"` |
| `/mekong status` | Goal + gate + bottleneck | `me goal show && me solo bottlenecks --strict` |
| `/mekong step <N>` | Execute step N | `me step <N>` |
| `/mekong solo <dept>` | Run department | `me solo run <dept> ready "<note>"` |
| `/mekong route <cmd>` | Route command to dept | `me solo route <cmd>` |
| `/mekong gates` | Verify gate artifacts | `me solo gates verify --strict` |
| `/mekong bottlenecks` | Next bottleneck | `me solo bottlenecks --strict` |
| `/mekong allow <cmd>` | Check command allowed | `me solo allow <cmd>` |
| `/mekong artifact <g> <d> <note>` | Record gate evidence | `me solo artifact write <g> <d> "<note>"` |

## Department Mapping — algo-trader

| algo-trader Domain | me-deep-wrapper Department | Claude Agent | Gate |
|--------------------|---------------------------|--------------|------|
| trading-engine | engineering-factory | fullstack-developer | mvp-live |
| code-quality | quality-compliance | code-reviewer | mvp-live, scale-ready |
| platform-ops | platform-operations | devops-expert | mvp-live |
| market-intelligence | market-intelligence | researcher | offer-validated |
| trading-performance | sales-revenue | project-manager | first-revenue |

## Evidence Contract — algo-trader (mvp-live gate)

```json
{
  "routes": ["/api/health", "/api/status", "/api/strategies/*"],
  "apis": ["strategy-engine", "market-data-feed", "risk-manager", "backtest-engine"],
  "data_model": {
    "strategies": "id,name,type,params,active",
    "trades": "id,strategy_id,exchange,pair,side,amount,price,status,pnl",
    "market_data": "exchange,pair,timestamp,bid,ask,last,volume"
  },
  "integrations": ["ccxt-exchanges", "polymarket-clob", "ethers-js", "jupiter"],
  "checkout_path": "N/A (trading platform, no checkout)",
  "build_command": "npm run build && npm test",
  "tests_run": true,
  "known_risks": []
}
```

**Template file:** `.claude/templates/evidence-mvp-live.json`

## Agent Definitions

All agents defined in `.claude/agents/`:

| Agent | Department | Model | Role |
|-------|-----------|-------|------|
| brainstormer | market-intelligence | sonnet | Strategy ideation, market analysis |
| code-reviewer | code-quality | sonnet | Code review, quality gates |
| code-simplifier | trading-engine | sonnet | Refactoring, complexity reduction |
| debugger | trading-engine | sonnet | Bug investigation, root cause |
| docs-manager | platform-ops | sonnet | Documentation updates |
| fullstack-developer | trading-engine | sonnet | Implementation, phase execution |
| git-manager | platform-ops | sonnet | Git operations, commits |
| journal-writer | platform-ops | sonnet | Session journals, decision records |
| mcp-manager | platform-ops | sonnet | MCP server configuration |
| planner | market-intelligence | opus | Planning, research, architecture |
| project-manager | trading-performance | sonnet | Progress tracking, coordination |
| researcher | market-intelligence | sonnet | Technical research, data gathering |
| tester | code-quality | sonnet | Test execution, coverage |
| ui-ux-designer | trading-engine | sonnet | Dashboard, CLI UX design |

## MCP Servers

Configured in `.claude/mcp/mekong-harness.json`:

| Server | Purpose |
|--------|---------|
| mekong-model-router | Model selection via Hermes API |
| mekong-state | State management (evidence, gates) |
| mekong-agents | Agent registry and routing |
| mekong-hermes | Hermes integration layer |

## Gate Progression

```
idea-intake → company-blueprint → offer-validated → mvp-live → first-revenue → repeatable-channel → fulfillment-stable → scale-ready → first-1m-mrr
```

Each gate requires evidence artifacts in `state/evidence/`.

## Post-Work Protocol

1. `/mekong artifact <gate> <dept> "<note>"` — record evidence
2. `/mekong gates` — verify gate passes
3. `me goal show` — confirm progress

## Error Handling

- `me` CLI not found → check shell function in `~/.zshrc`
- Goal missing → `me goal "<description>"` to create
- Gate blocked → write missing evidence, retry
- MCP connection fail → verify `HERMES_API_KEY` env var

## Integration Paths

| Resource | Path |
|----------|------|
| me-deep-wrapper repo | `/Users/macbook/Documents/me-deep-wrapper` |
| me CLI | `me` (shell function) |
| State directory | `/Users/macbook/Documents/me-deep-wrapper/state` |
| SOPs directory | `/Users/macbook/Documents/me-deep-wrapper/sops` |
| MCP config | `.claude/mcp/mekong-harness.json` |
| Evidence template | `.claude/templates/evidence-mvp-live.json` |
| Bootstrap script | `.claude/scripts/bootstrap-harness.sh` |
