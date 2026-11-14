# Code Review Report: `feat/poly-vnext-hybrid-ic` (`871f71a3` vs `main`, Issue #269 / #268)

**Score: 7.8/10** — **HOLD MERGE** until 3 `HIGH` and 2 `MEDIUM` findings are remediated.

## Scope & Verification Executed
- **Branch / Commit**: `feat/poly-vnext-hybrid-ic` at `871f71a3` (249 files changed vs `main`, +55,321 / -542 LOC) + 4 dirty working-tree files detected during review (`scripts/poly-approve-pusd.ts`, `src/desk/polymarket/clob-v2-heartbeat-service.ts`, `src/desk/polymarket/ctf-eth-call-preflight.ts`, `src/desk/polymarket/poly1271-session-signer.ts`).
- **Checks Run**:
  - `npm run typecheck` (`tsc --noEmit`): PASS (0 errors)
  - `npx tsc -p tsconfig.worker.json --noEmit`: PASS (0 errors, Worker bundle unpolluted)
  - `npx vitest run` (32 test files / 440 tests across `polymarket`, `portfolio`, `governance`, `strategies`): PASS
  - `node scripts/ci-gate-secret-scan.mjs`: PASS (0 matches)
  - `npm run poly:governance`: PASS (241 files scanned, 0 findings, 10/10 watchlist repos)
  - `npm run poly:sidecars -- doctor` & `drill-ghost`: PASS (`status=0` `TRANSFER_FROM_FAILED` latched `PolyKillSwitch` in `50.81ms`, `rustBinaryVerified: true`, `activeManagedPids: []`)
  - `node scripts/check-quality-baseline.mjs --quality`: PASS at `HEAD` (`871f71a3`), **FAIL in dirty working tree** (`src/desk/polymarket/clob-v2-heartbeat-service.ts` at 210 LOC > 200 LOC ceiling).

---

## Concrete Findings

### HIGH-1: `solveLockupAdjustedKelly` multiplies `log(1 + w·R)` by `gammaKelly` instead of damping leverage, yielding ~100% Full Kelly on interior solutions
- **Location**: `/Users/macbook/algo-trader/src/desk/portfolio/poly-lockup-kelly-solver.ts:131-141` (and hurdle mismatch at `:112-113`)
- **Problem**: `evalObjAndGrad` maximizes `sum_s gamma * pi_s * log(1 + w^T R_s) - c^T w`. Multiplying `E[log(1 + w^T R)]` by a positive scalar `gamma` (`0.15–0.25`) does **not** scale optimal Kelly weights by `gamma`; it is mathematically identical to maximizing `E[log(1 + w^T R)] - (c / gamma)^T w` (**Full Kelly** with slightly higher linear drag `c / gamma`). Additionally, line 113 pre-filters on `mu <= c_i` (`gamma = 1`), whereas `grad[i]` at `w = 0` is `gamma * mu - c_i`, so candidates with `c_i < mu <= c_i / gamma` solve to `0` without being listed in `rejectedTokenIds`.
- **Failure Scenario**: On `pi = [0.51, 0.49]`, `R = [+0.20, -0.20]`, `expectedLockupDays = 2`, `resolutionRiskBps = 1` (`c = 0.000346`), Full Kelly is `w_full = 10.0%` NAV (worst-case loss `2.0% <= 3.0%` cluster cap, so interior). True `0.20` Fractional Kelly is `2.0%` NAV, but `solveLockupAdjustedKelly` with `gammaKelly = 0.20` allocates **`9.1%` NAV (~4.5x over-leveraged)**. Note `computeNaiveIndependentKellyWeights` in `/Users/macbook/algo-trader/src/desk/portfolio/poly-lockup-kelly-allocator.ts:86-93` correctly scales `gammaKelly * w_full`.
- **Fix**: Optimize in fractional Kelly coordinates `w = gamma * f` — i.e., `max_w gamma * E[log(1 + (w / gamma)^T R)] - c^T w` (or CRRA power utility with relative risk aversion `1 / gamma`), where unconstrained optimum satisfies `w* <= gamma * w_full` and the `w = 0` derivative is `mu - c_i` (matching the line 113 hurdle).

### HIGH-2: Strategy 3 + 7 (`ToxicityAwareMarketMakerStrategy` + `MakerRegimeCoordinator`) skips regime enforcement on open/cooldown markets and corrupts inventory across exits and multi-fill merges
- **Location**:
  - `/Users/macbook/algo-trader/src/desk/strategies/polymarket/quant-alpha/toxicity-aware-market-maker.ts:118, 127`
  - `/Users/macbook/algo-trader/src/desk/strategies/polymarket/quant-alpha/toxicity-aware-market-maker-regime-wiring.ts:78-95, 130-151, 168-176`
- **Problem & Failure Scenarios**:
  1. **Short-circuit before `evaluateMarketRegime` (`toxicity-aware-market-maker.ts:118`)**: `if (this.hasPosition(market.conditionId) || this.isOnCooldown(market.conditionId, now)) return null;` executes *before* `this.regimeCoord.evaluateMarketRegime(...)` at line 127. Once one leg fills (adding to `this.positions`) while the other leg has a resting order (or after an exit puts the market on 120s cooldown), `evaluateMarketRegime` is never called for that market: resting quotes are **not** cancelled on `EVENT` / `REDUCE_ONLY` / `HALTED`, and `netSkewQ` (`normalizedInventoryQ` at `regime-wiring.ts:94`) can never trigger `REDUCE_ONLY` once `recordLeg` populates `this.positions`.
  2. **Phantom `pairInventory` after exits (`regime-wiring.ts:78-85`)**: `ToxicityAwareMarketMakerStrategy` does not override `exitPosition`, so TP/SL/maxHold/`toxic-flow-against-leg` exits sell tokens from `this.positions` while `pairInventory` retains sold shares, causing `processEligibleMerges` to attempt `mergePositions` on phantom inventory when an opposing leg fills later.
  3. **Multi-fill over-deduction in `deductMergedPositions` (`regime-wiring.ts:168-176`)**: Subtracts full `shares` (`pair.matchedShares`) from *every* `OpenPosition` with `p.conditionId === conditionId` instead of tracking remaining shares per token (`yesTokenId` vs `noTokenId`). Two 12-share YES fills (`24`) merged against one 20-share NO fill (`matchedShares = 20`) deletes *both* YES positions (`12 - 20 <= 0`), orphaning 4 real YES shares from `this.positions` (and leaving `entryFeesUsdc` un-prorated).
- **Fix**: Evaluate `evaluateMarketRegime` (which cancels resting orders when `withdrawAllQuotes || cancelMarketOrders`) *before* returning `null` on `hasPosition` / `isOnCooldown`; compute per-condition `yesShares` / `noShares` directly from live `this.positions` (keyed by `yesTokenId` / `noTokenId`) instead of separate `pairInventory`; deduct `matchedShares` using per-token remaining counters (`remYes`, `remNo`) and prorate `entryFeesUsdc`.

### HIGH-3: Uncommitted working-tree edits break 200-LOC quality ratchet (`clob-v2-heartbeat-service.ts` = 210 LOC), while committed `HEAD` (`871f71a3`) lacks `process.env` master-key check & custom Solidity revert guard
- **Location**:
  - `/Users/macbook/algo-trader/src/desk/polymarket/clob-v2-heartbeat-service.ts:1-210` (working tree)
  - `/Users/macbook/algo-trader/src/desk/polymarket/poly1271-session-signer.ts:99-103` (`HEAD` `871f71a3`)
  - `/Users/macbook/algo-trader/src/desk/polymarket/ctf-eth-call-preflight.ts:31, 148` (`HEAD` `871f71a3`)
  - `/Users/macbook/algo-trader/scripts/poly-approve-pusd.ts:36` (`HEAD` `871f71a3`)
- **Problem & Failure Scenarios**:
  - At committed `HEAD` (`871f71a3`), `Poly1271SessionSigner` checks `config.runtimeEnv?.['POLY_OWNER_MASTER_PRIVATE_KEY']` without falling back to `process.env`, so omitting `runtimeEnv` silently allows a leaked `process.env.POLY_OWNER_MASTER_PRIVATE_KEY`; `CtfEthCallPreflight` only rejects `0x08c379a0` / `0x4e487b71` selectors on void CTF calls (missing custom Solidity errors); and `poly-approve-pusd.ts` allows `--broadcast` against `PLACEHOLDER_EXCHANGE_V3` if `--exchange` is omitted.
  - Uncommitted working-tree edits fix all three plus add `AbortSignal.timeout` + `tickSequence` superseding in `ClobV2HeartbeatService`, **but** grew `src/desk/polymarket/clob-v2-heartbeat-service.ts` to **210 lines**, causing `node scripts/check-quality-baseline.mjs --quality` to fail (`filesOverMaxLines`).
- **Fix**: Compact `src/desk/polymarket/clob-v2-heartbeat-service.ts` to `<= 200` LOC, add tests covering `process.env.POLY_OWNER_MASTER_PRIVATE_KEY` fallback, custom `eth_call` 4-byte error selector rejection, and `--broadcast` without `--exchange`, verify `check-quality-baseline.mjs --quality` 5/5 PASS, and commit cleanly.

### MEDIUM-1: `scripts/poly-sidecars.ts` `cmdCaptureSample({ live: true })` does not wire `walDir` into `poly-book ingest`
- **Location**: `/Users/macbook/algo-trader/scripts/poly-sidecars.ts:251-283`
- **Problem & Failure Scenario**: `cmdCaptureSample` creates `walDir` (default temp dir), spawns `poly-book ingest --auto-rotate --parquet=false --metrics=false` without `PB__WAL__BASE_PATH=walDir`, and then reads `walDir`. `poly-book` writes WAL segments to `sidecars/poly-book/data/wal` (from `config/default.toml`), leaving `walDir` empty so `cmdCaptureSample({ live: true })` reports `validFrames: 0, ok: false` and pollutes `sidecars/poly-book/data/wal`.
- **Fix**: Add `env?: NodeJS.ProcessEnv` to `runBoundedProcess` and pass `env: { ...process.env, PB__WAL__BASE_PATH: walDir }` in `cmdCaptureSample`.

### MEDIUM-2: `assertProspectiveCutoff` fails open when `modelKnowledgeCutoffMs` is set but `eventResolutionOrCutoffMs` is omitted
- **Location**: `/Users/macbook/algo-trader/src/desk/polymarket/market-blind/market-blind-sanitizer.ts:94-104`
- **Problem & Failure Scenario**: Line 103 (`if (eventResolutionOrCutoffMs === undefined) return;`) returns silently even when the caller explicitly configured `modelKnowledgeCutoffMs`. Any call to `sanitizeMarketBlindContext({ documents }, { modelKnowledgeCutoffMs })` or `commitMarketBlindForecast({ ..., modelKnowledgeCutoffMs })` that forgets `eventResolutionOrCutoffMs` bypasses the anti-hindcast guard.
- **Fix**: When `modelKnowledgeCutoffMs !== undefined` and `eventResolutionOrCutoffMs === undefined`, throw `MarketBlindError('INVALID_MARKET_BLIND_INPUT', 'eventResolutionOrCutoffMs is required when modelKnowledgeCutoffMs is configured')`.

### LOW-1: `computePostOnlyPrice` in `market-blind-shrunk-posterior.ts` does not snap to tick and can touch `askPrice` when `askPrice <= tickSize`
- **Location**: `/Users/macbook/algo-trader/src/desk/polymarket/market-blind/market-blind-shrunk-posterior.ts:67-73`
- **Problem**: `Math.max(tickSize, Number((askPrice - tickSize).toFixed(6)))` returns `tickSize` even if an explicit `askPrice <= tickSize` is supplied alongside `marketPrice >= 0.10`, and does not snap off-tick `bestBid` / `askPrice` inputs to `cfg.tickSize`.
- **Fix**: Snap `limitPrice` to `cfg.tickSize` and reject/suppress `'post-only-improve-1tick'` if `!(limitPrice < askPrice - 1e-9)`.

### LOW-2: `MarketBlindEventPosterior.wSkill` is typed optional (`wSkill?: number`) but required at runtime
- **Location**: `/Users/macbook/algo-trader/src/desk/strategies/polymarket/quant-alpha/primary-source-news-latency-types.ts:68` vs `/Users/macbook/algo-trader/src/desk/strategies/polymarket/quant-alpha/primary-source-news-latency.ts:150`
- **Problem**: `resolvePosteriorConfig` rejects `mb.wSkill === undefined` at runtime (`typeof mb.wSkill === 'number'`). Typing `wSkill: number` as required prevents compile-time callers from accidentally omitting it.

### LOW-3: 8 untouched legacy Polymarket strategies still use manual `market.noTokenId!` checks rather than `resolveOutcomeTokenId`
- **Location**: `/Users/macbook/algo-trader/src/desk/strategies/polymarket/{funding-rate-arb,twap-accumulator-strategy,microstructure-alpha,liquidation-cascade-strategy,regime-adaptive-momentum-evaluators,gamma-scalping,kalman-filter-tracker,order-flow-toxicity}.ts`
- **Problem**: None contain `noTokenId ?? yesTokenId` (`#268` is fully closed), so they do not buy the opposite token, but whitespace-only `noTokenId: '   '` would pass `!market.noTokenId` whereas `resolveOutcomeTokenId` trims and validates both sides uniformly.

---

## Verified Strengths (Risk Calibration)
- **Issue #268 & NegRisk `legPlacement` & KPI Replay Preflight**: Zero `noTokenId ??` fallbacks remain in `src/desk/strategies/`; `passiveMakerBidPrice` strictly separates `'touch'` vs `'one-tick-inside'` and clamps below `liveBestAsk`; `runObservedQuantAlphaReplay` blocks fail-closed on `!preflightVerdict.allowed`.
- **Rust Sidecar Bridges**: `poly-book-wal-{crc32c,codec,bridge}.ts` matches `pb-wal` v3 `GOLDEN_V3_HEX` byte-for-byte, preserves `u64` `FixedSize` precision via `BigInt`, flushes across `SourceReset`, and verifies `recv_time` vs `exchange_time` ordering. `ghost-guard-webhook-bridge.ts` enforces loopback/Host/CSRF/`timingSafeEqual` Bearer guards and latches `PolyKillSwitch` synchronously before awaiting `DELETE /cancel-all`.
- **Market-Blind & Risk Engine**: `MarketBlindProspectiveLedger` (`WeakSet` + SHA-256 chain), PAVA + damped Newton Platt calibrators, 5-way `evaluateSkillGate`, URL userinfo/host spoofing normalization + pre-arbiter `forbiddenTerms` veto, and `checkPortfolioKelly` (`UNRESOLVED_STATE` fail-closed + `REDUCE_ONLY` sell exemption) are all solidly engineered.

## Unresolved Questions
1. Should `clob-v2-order-signing.ts` (`ORDER_FIELD_TYPES`, inherited from `main` with `NOT VERIFIED AGAINST THE LIVE ENDPOINT` notice) be reconciled against `@polymarket/clob-client-v2`'s live `Order` EIP-712 struct (`salt`, `maker`, `signer`, `taker`, `tokenId`, ...) before any post-Paper live pilot cutover?
