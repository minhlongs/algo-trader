# G1 SaaS/Paper Hardening — Polymarket Execution Correctness

**Date:** 2026-10-30, Asia/Ho_Chi_Minh
**Branch:** `fix/g1-saas-paper-hardening` (base `origin/main` SHA `b064a3ba`)
**Worktree:** `/Users/macbook/algo-trader/.claude/worktrees/g1-saas-paper-hardening`
**Route:** bugfix (5 confirmed correctness defects + 2 gate-contract defects)
**Status:** completed
**Mode:** PR-ready, shipped via `/ak-vibe go next --ship`.

## Objective

Restore the excluded Polymarket test suite, close the H10 coverage gate, make the
shared execution-mode resolver able to return `PAPER`, and fix five confirmed
execution-correctness defects in the Polymarket order lifecycle — with a failing
test before each patch and an independent review before the PR opens.

## Why this is safe work

Every defect below is in code paths that only reach real money when
`LIVE_TRADING_ENABLED=true` AND an explicit owner approval for live capital
exists. Neither is true. The defects therefore cannot cost money today. They can
cost *credibility*: the same code reports `FILLED`, realized PnL and arbitrage
edge that no venue ever confirmed. Fixing them is what makes any later
paper-then-live evidence mean anything.

## Confirmed defects (each verified at `b064a3ba` by reading source in this worktree)

| ID | File:line | Defect | Consequence |
|---|---|---|---|
| D1 | `vitest.config.ts` | `tests/strategies/polymarket/**` excluded; thresholds 75/75/60/70 | Violates `AGENTS.md` H10 (80/80/80/80); the only tests guarding 2 live strategies never run |
| D2 | `src/desk/execution/execution-mode.ts:46-50` | `resolveExecutionMode()` returns only `LIVE` or `READ_ONLY` | Type declares `PAPER` but no branch yields it, so `requireTradingEnabled()` can never pass via paper; resolver disagrees with `tri-mode-dispatcher.ts` default and with `polymarket-execution-adapter.ts` |
| D3 | `src/desk/strategies/polymarket/base-polymarket-strategy-trades.ts:68,73` | Exit side is `pos.side === 'yes' ? 'sell' : 'buy'`; exit size is `sizeUsdc / currentPrice` | Exiting a NO position sends a BUY — it doubles the position instead of closing it. Exit size sells a price-derived quantity, not the token quantity actually bought at entry |
| D4 | `src/desk/strategies/polymarket/base-polymarket-strategy-trades.ts:39,48-56` + `base-polymarket-strategy-exit-runner.ts:44-59` | Entry records position and emits `fillPrice/fillSize/fees:'0'` immediately after a GTC order; `performExit` swallows errors but `exit-runner` always splices the position out | Paper PnL and position state are fabricated. A failed or unfilled exit silently removes the position from tracking while real exposure remains |
| D5 | `src/desk/strategies/polymarket-arb-strategy.ts:58,76,90,96-116` | Arb detected on `mid` prices, orders submitted at `ask`; two sequential GTC legs with no leg-2 failure handling; `hasPosition(conditionId)` cannot express a YES+NO pair | Combined ask ≥ 1.00 can execute a certain loss while mid-based detection reports edge. Leg risk is unhedged and untested |
| D6 | `src/desk/execution/live-execution-gateway.ts:91-99` | `executeOrderIntent()` returns `status: 'FILLED'` from an in-process route plan with no venue call | Any caller reading this result treats simulated routing as a venue fill |
| D7 | `src/desk/arbitrage/backtester.ts:32,106,123` | `capital += opp.expectedProfit` | Backtest capital compounds theoretical expected profit as realized PnL; used as edge evidence it is false |

## Scope boundary

In scope, in dependency order:

1. Un-exclude `tests/strategies/polymarket/**`, discover the true state of those two suites, raise thresholds to H10 only after they pass honestly.
2. Add `PAPER` to the shared resolver with an explicit, fail-closed env contract; keep `READ_ONLY` the default; unify it with `tri-mode-dispatcher` and `polymarket-execution-adapter`.
3. Fix the trade lifecycle (D3, D4) with a fill-confirmation contract before position state and trade events are written.
4. Fix the arb strategy (D5) to reason on executable prices and to refuse when leg 2 is not fillable.
5. Stop `LiveExecutionGateway` from claiming a venue fill (D6).
6. Stop the backtester from compounding expected profit as realized PnL (D7).

Out of scope for this PR:

- Deploying anything to `api.cashclaw.cc`. That is a separate gate with its own prerequisites.
- Any live-capital work, signing, allowance, or transfer — none is approved.
- The 50+ other Polymarket strategies. Fix the base lifecycle and one arb strategy; other strategies inherit the base fix.
- Raising coverage by rewriting thresholds on source, narrowing the instrumented set, or deleting tests.
- The multi-session marketing work on `feat/cmo-marketing-dual-funnel-push` and the 11 staged + 4 untracked planning files in the primary worktree. This worktree never reads them.

## Done means

- `tests/strategies/polymarket/**` runs in the default suite and its result (pass or named failures) is recorded, not hidden.
- `vitest.config.ts` thresholds read 80 for statements, lines, functions and branches, and `npm run test:coverage` exits 0 at those thresholds.
- A unit test proves `getExecutionMode()` returns `READ_ONLY` by default, `LIVE` only for the literal string `'true'`, and `PAPER` under its own explicit, non-live, non-default condition — and that `PAPER` never satisfies `requireLiveEnabled`.
- A test proves an exit from a NO position sends `side: 'sell'` on the NO token and sizes from the token quantity recorded at entry.
- A test proves a position is not recorded and no trade event is emitted before a fill confirmation, and that a failed exit does not remove the position.
- A test proves the arb strategy declines when the executable YES ask + NO ask is not profitable after configured costs, and that it does not hold two positions on one `conditionId` as if they were one.
- A test proves `LiveExecutionGateway` does not report a venue fill from a local route plan.
- A test proves the backtester never adds `expectedProfit` to realized capital.
- Every one of the above had a red test first, in the same commit range as its patch.
- `npm run build`, `npm run build:worker`, `npm test`, `npm run lint` exit 0.
- PR opened with the diff, test evidence, and a stated disposition for every finding; merge untouched.

## Stop and ask only if

- Un-excluding the Polymarket suites reveals failures rooted in something outside the six modules above, i.e. a contract change that would alter a public interface.
- Any fix would require a change to a shared schema, migration, or workspace config owned by another session.
- An instruction arrives to deploy, enable live trading, sign, transfer, or alter risk limits — none of which is authorized by this plan.

## Success metrics

- 5 confirmed defects → 5 FIXED-VERIFIED, each with red-before and green-after evidence.
- Coverage ≥80% on all four metrics, measured, not asserted.
- 0 open Critical or High in this release scope; anything Medium carries impact, owner and due date.
- 0 real order submissions reachable during any test run in this branch.

## Sequencing

Phase 1 → discovery and baseline. Phase 2 → mode resolver. Phase 3 → trade lifecycle.
Phase 4 → arb strategy. Phase 5 → gateway and backtester. Phase 6 → whole-suite gates
and independent review. Phases 3 and 4 both touch the Polymarket base, so they are
serial; phases 5 and 6 are read-only against the base and can follow.
