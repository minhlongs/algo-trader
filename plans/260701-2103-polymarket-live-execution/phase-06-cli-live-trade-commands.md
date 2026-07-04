# Phase 06: CLI Live Trade Commands

**Priority:** P0 | **Status:** complete | **Depends on:** Phase 05

## Context Links
- Brainstorm: `plans/reports/brainstorm-260701-2103-polymarket-live-execution.md`
- Plan overview: `plan.md`
- CLI: `src/desk/cli/cashclaw-cli.ts` (157 lines, 4 commands: paper, status, scan, ledger)
- Pipeline: `src/desk/polymarket/trading-pipeline.ts`

## Overview

Add live trading commands to the CashClaw CLI so the operator can start/stop live trading and check live positions + P&L. Commands mirror the paper trading UX for operator familiarity.

## Key Insights

- CLI uses Commander.js — add new `.command()` entries
- `paper` command starts paper trading via `wiring/paper-trading-orchestrator` (dynamic require)
- New `trade` command starts the full `TradingPipeline` with `paperTrading: false`
- `status` command currently reads `data/paper-trades.json` — needs LIVE branch
- Operator confirmation required before FIRST live trade (safety gate)
- CLI is the operator's primary interface — must be clear about PAPER vs LIVE

## Requirements

### Functional
- `algo trade start --strategy=<name> --mode=live` — start live trading for a strategy
- `algo trade start --mode=paper` — start paper trading (same as `algo paper` today)
- `algo trade stop` — gracefully stop live trading pipeline
- `algo trade status` — show live positions, P&L, guard status, circuit breaker state
- `algo trade status --json` — machine-readable output for monitoring
- First live trade: CLI prompts "⚠️ LIVE TRADING: This will use REAL USDC. Confirm? (y/N)"
- `--mode` defaults to `paper` (safe default)
- Missing env vars → clear error message listing which vars are missing

### Non-functional
- Under 80 new lines in CLI file
- Confirmation prompt skippable via `--yes` flag (for scripting)
- JSON output mode for integration with monitoring dashboards
- Match existing CLI style (commander.js, chalk-free — plain console output)

## Architecture

```
algo trade
  ├── start [--strategy] [--mode=paper|live] [--capital] [--yes]
  │   ├── mode=paper → existing paper trading (unchanged)
  │   └── mode=live  → validate env vars → confirm → TradingPipeline.start({ paperTrading: false })
  ├── stop → TradingPipeline.stop()
  └── status [--json]
      ├── PAPER → existing paper status (unchanged)
      └── LIVE  → positions, P&L, guard state, breaker status
```

## Related Code Files

| Action | File |
|--------|------|
| MODIFY | `src/desk/cli/cashclaw-cli.ts` |
| READ | `src/desk/polymarket/trading-pipeline.ts` |
| READ | `src/desk/execution/live-execution-guard.ts` (Phase 04) |
| READ | `src/desk/execution/live-position-tracker.ts` (Phase 02) |

## Implementation Steps

1. Add `trade` command group to `cashclaw-cli.ts`
2. Implement `trade start` subcommand:
   - Parse `--strategy`, `--mode` (default: 'paper'), `--capital`, `--yes`
   - If `mode=live`: validate `POLY_API_KEY`, `POLY_API_SECRET`, `POLY_PASSPHRASE`, `POLY_PRIVATE_KEY`
   - If `mode=live` and no `--yes`: prompt confirmation
   - Create `TradingPipeline` with `paperTrading: mode !== 'live'`
   - Handle SIGINT/SIGTERM for graceful shutdown
3. Implement `trade stop` subcommand:
   - Signal pipeline to stop
   - Wait for graceful shutdown (max 10s timeout)
4. Implement `trade status` subcommand:
   - If PAPER: show paper portfolio (existing logic)
   - If LIVE: show live positions, P&L, guard status, breaker state
   - `--json` flag: output JSON instead of formatted text
5. Add `trade` as top-level command in program
6. Run `pnpm typecheck`

## Todo List

- [ ] Add `trade` command with `start`, `stop`, `status` subcommands
- [ ] LIVE mode env var validation with clear error messages
- [ ] First-trade confirmation prompt (skippable via `--yes`)
- [ ] Graceful shutdown on SIGINT/SIGTERM
- [ ] `status --json` for machine-readable output
- [ ] `pnpm typecheck` passes

## Success Criteria

- `algo trade start --mode=live --strategy=endgame-v2` prompts confirmation then starts live trading
- `algo trade start` (no --mode) defaults to paper — safe default
- `algo trade status` shows live P&L when LIVE, paper P&L when PAPER
- Missing env vars → clear error: "POLY_PRIVATE_KEY is required for live trading"
- Ctrl+C gracefully stops pipeline (cancel orders, close connections)
- 0 TypeScript errors

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Operator accidentally starts live trading | Default mode is `paper`; confirmation required for live |
| Pipeline crash → orphaned CLOB orders | `stop()` cancels all orders before shutdown |
| Dynamic require fails in compiled CLI | Import pipeline directly (no dynamic require for live path) |
| CLI tests break | Follow existing CLI test patterns; test with env vars mocked |
