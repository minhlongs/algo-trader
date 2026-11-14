# Report: Polymarket CLOB V2 Core Port — Completion

- **Date:** 2026-11-08
- **Plan:** `plans/20261108-poly-v4-clob-v2-core-port/plan.md`
- **Issue:** #242 (closed on merge)
- **PR:** #243 → MERGED into `main` as `ee9f7224` (2026-11-08 04:54 UTC)
- **Route:** Feature + Hardening
- **Status:** complete — all 5 tasks delivered, all gates green

## Outcome

Ported the 5 core protocol, accounting, pre-trade risk, microstructure, and
market-making primitives from `POLY-ALPHA-HUNTER-V4-SPEC-FULL` (`poly.md`)
into `algo-trader`, then hardened every module against the findings an
isolated reviewer raised on the first landing. The work is now on `main`.

Both live shadow cohorts and the trading gate were preserved untouched:
`G1-Soak` (`startedAt = 1793536843401`) and `G2-Poly-Shadow`
(`startedAtMs = 1794047000444`) were never reseeded, and `LIVE_TRADING_ENABLED`
remains `false`, so Gate `G3` stays BLOCKED.

## Delivered modules

| Task | Module | LOC |
|------|--------|-----|
| 1 Quadratic fee / rebate / liquidity reward V2 | `src/desk/polymarket/polymarket-fee-calculator.ts` | 196 |
| 2 Integer micro-unit FIFO ledger | `src/desk/execution/integer-micro-unit-fifo-ledger.ts` | 190 |
| 3 10-rule CLOB V2 pre-trade risk gate | `src/desk/execution/polymarket-v2-pretrade-risk-gate.ts` | 194 |
| 4 On-chain OFI/VPIN estimator | `src/desk/polymarket/onchain-ofi-vpin-estimator.ts` | 193 |
| 4 Log-Odds Avellaneda-Stoikov MM | `src/desk/polymarket/log-odds-avellaneda-stoikov-mm.ts` | 141 |
| 5 CLOB V2/V3 fail-closed signer | `src/desk/execution/polymarket-signer.ts` | 193 |
| 5 Walk-forward OOS evaluator | `src/desk/polymarket/polymarket-oos-evaluator.ts` | 136 |

Modules extracted during hardening (each isolated so every file stays <= 200
LOC, the `CLAUDE.md` rule the plan commits to):

| Module | LOC | Owns |
|--------|-----|------|
| `src/desk/execution/integer-micro-unit-mtm.ts` | 80 | Executable-depth MTM valuation + `MICRO_PER_PUSD` / `mulDivMicro` |
| `src/desk/execution/polymarket-pretrade-finite-guard.ts` | 36 | Non-finite order-term rejection |
| `src/desk/execution/polymarket-v3-position-id-guard.ts` | 22 | 32-byte hex `positionId` fail-closed guard |
| `src/desk/polymarket/polymarket-oos-deterministic-rng.ts` | 18 | Seeded LCG (no `Math.random` in the reproducibility harness) |
| `src/desk/polymarket/polymarket-oos-synthetic-market.ts` | 57 | Episode generator (spread, depth, queue, Leg-2 reject) |
| `src/desk/polymarket/polymarket-oos-maker-episode-simulator.ts` | 90 | Passive-maker queue, partial fill, adverse selection |
| `src/desk/polymarket/polymarket-oos-arb-episode-simulator.ts` | 68 | Naive-mid and executable-ask taker arbs |

Test files: `src/desk/polymarket/__tests__/poly-v4-clob-v2-core.test.ts` (150),
`src/desk/execution/__tests__/poly-v4-integer-micro-unit-fifo-ledger.test.ts`
(179), `src/desk/execution/__tests__/poly-v4-ledger-and-risk-gate.test.ts`
(114), `src/desk/execution/__tests__/polymarket-signer.test.ts`,
`tests/unit/desk/execution/s4-s5-polymarket-hardening.test.ts`.

## Review findings fixed

Six findings from the isolated review were confirmed by reproducing each one
before changing anything, then fixed with a regression test each.

**Important 1 — non-atomic ledger accrual.** Income was accrued before the
FIFO disposal that validates inventory, so an over-sell or over-settle throw
left phantom cash behind (+16 micro on sell, +50 micro on settle). Accruals
now run only after `disposeFifoCost()` succeeds; two tests assert the PnL,
rebate, reward and fee totals are byte-identical across a caught throw.

**Important 2 — MTM over-stated liquidity.** VWAP divided by the whole
position instead of the depth the bid book absorbs, so a position larger than
the book was marked at a blended price that understated real value by an order
of magnitude, and an empty book returned a priced position. `mulDivMicro` now
feeds a partial-fill walk; the result reports `filledSharesMicro`,
`unfilledSharesMicro`, `vwapBidMicro` and `fullyFillable`.

**Important 3 — the OOS evaluator could not lose.** `log_odds_maker_mm_v2`
hardcoded `fees: 0` and `unwindLoss: 0` and fed the queue simulator constants,
so its win rate was 1.00 on every seed. It now derives per-episode queue depth
and fill volume from the snapshot, takes the fill from the queue (partial
fills occur), and charges adverse selection plus unwind taker fees. Measured
across 4 seeds: fees 0.05–0.14 USD, unwind up to 1.05, win rate 0.90–0.96.

**Medium 4 — risk-gate holes.** Market SELLs bypassed the 2-decimal
collateral floor (both legs settle a pUSD amount, so it applies to both), and
`NaN` or `Infinity` in any numeric term passed every rule silently because
each comparison is a no-op against `NaN`. Non-finite terms now fail closed
with `NON_FINITE_ORDER_TERMS`.

**Medium 5 — signer fallback.** CLOB V2/V3 signing fell back when
`positionId` was missing, empty or not 32-byte hex. `assertPositionIdUsable`
now throws instead of deriving an id by hashing a non-hex `tokenId`. The V1
path never gains `positionId`, so legacy recorded order hashes do not shift.

**Medium 6 — undocumented regime band.** The VPIN escalation band now records
the 0.525 trigger (75% of the 0.70 kill-switch) so `state: 1` is not read as
incorrectly unreachable.

**Nit 7 — fee cap.** Verified the `Math.min(..., 1000 bps)` clamp never binds:
`rCat` maxes at 0.07 and `p(1-p)` at 0.25, so shipped rates peak at 175 bps.
The clamp is kept as the spec's safety net with a comment saying so.

## Verification evidence

All run in this worktree against the merged revision.

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | clean, 0 errors |
| Full Vitest suite | 17611 passed, 13 skipped, 0 failed (1405 files) |
| `node scripts/check-quality-baseline.mjs --quality` | 5/5 PASS — `anyTypes 0`, `consoleCalls 2`, `filesOverMaxLines 0`, `bannedImports 0`, `eslintDisables 0` |
| Files over 200 LOC in `src/` | 0 |
| `npm run check:leaderboard` | in sync (30 CSV rows) |
| G2-Poly-Shadow probe | `startedAtMs: 1794047000444`, `unexplainedDriftUsdc: 0` |
| PR #243 CI | 13 SUCCESS, 0 FAILURE, 3 SKIPPED (post-merge deploy jobs only) |

A note on the leaderboard check: its existing figures cover only the three
taker candidates, so the maker-path changes above do not invalidate any
recorded number.

A note on process worth recording. `MIGRATION_LOG.json` claimed the
`filesOverMaxLines` check inside `check-quality-baseline.mjs` is broken and
always passes. Reading `scripts/oversized-file-check.mjs` showed the opposite
— it counts real lines through `collectFileLineCounts`. It caught a 287-line
test file this branch had created, which forced the test split; trusting the
log entry instead would have failed the Gate 8 quality ratchet on CI. The stale
`MIGRATION_LOG.json` entry is corrected on `docs/correct-oversized-file-check-history`
so the next session does not repeat the same false assumption.

## Done means — each item verified

1. `calcQuadraticTakerFeeV2` peaks at `p = 0.50` with `1.75%` crypto / `1.25%`
   sports / `1.00%` politics / `0%` geopolitics, and `calcMakerRebateV2` /
   `calcLiquidityRewardScoreV2` follow the spec curves — asserted in
   `poly-v4-clob-v2-core.test.ts`, which passes.
2. `IntegerMicroUnitFifoLedger` disposes lots FIFO oldest-first, amortizes
   entry fees pro-rata, separates all five PnL buckets with `0` micro-unit
   drift, and settles redemption at `$1.00` / `$0.00` — verified, plus the
   atomicity and executable-depth repairs above.
3. `PolymarketV2PreTradeRiskGate` enforces all 10 rules including
   `VPIN > 0.70` rejection, the `20%` reserve, the tick grid, the 5-share
   minimum and the `[$0.02, $0.98]` cutoffs, and now closes the market-SELL
   and non-finite-term holes.
4. On-chain `makerAssetId === '0'` decodes to `BUY`; 5-level OFI, VPIN and the
   4-state regime classify; Log-Odds quotes stay inside `(0, 1)` on the tick
   grid; the conservative queue simulator keeps the `20%` progress cap.
5. The CLOB V2/V3 signer supports `signatureType: 3`, `protocolVersion: '3'`
   and `positionId` while defaulting to `'1'`, and the OOS evaluator grades
   `log_odds_maker_mm_v2` against conservative queue progress.
6. `G1-Soak` / `G2-Poly-Shadow` untouched, `LIVE_TRADING_ENABLED=false`
   unchanged, branch merged to `main`, remote feature branch deleted.

## Follow-ups

- Post-merge `main` CI on the merge commit `ee9f7224` completed **success** on
  all three workflows that run on a `main` push (`CI`, `Security Hardening &
  Attestation`, `CI/CD — Test, Build, Deploy`).
- `EXCHANGE_V3_ADDRESS` is set to the Neg-Risk CTF Exchange
  (`0xC5d563A36AE78145C45a50134d48A1215220f80a`) because the spec publishes
  no distinct non-Neg-Risk `ExchangeV3` address. If the venue confirms a
  different address, that constant is the single place to correct it.
- No live trading path was wired. Gate `G3` remains BLOCKED by design; nothing
  in this port calls the signer outside tests.
