# Code Review Summary — Poly Bot vNext Hybrid IC (`5faa16ef` vs `main`, R2)

### Scope
- **Branch / Commit**: `feat/poly-vnext-hybrid-ic` at `5faa16ef31932f94c528a801a90bc1104bce0a1e` vs `main` (Issues `#269`, `#268`)
- **Files**: 250 changed files (`+55,486 / -559` LOC, including vendored MIT Rust sidecars `sidecars/poly-book` and `sidecars/ghost-guard`; 92 touched/new `src/**/*.ts` + `scripts/*.ts` files totaling `14,818` LOC)
- **Focus**: Independent Staff-Engineer production-readiness re-review across all 5 surfaces + runnable gates
- **Scout findings**: Checked `src/**/*.ts` LOC ceiling (`<= 200` LOC across all 88 `src/` files; max = `200` in `market-blind-calibrator.ts` and `poly-ci-backtest-auditor.ts`), Worker bundle isolation (`0` imports into `src/platform/`, `src/durable-objects/`, `src/regions/`), `#268` `noTokenId ??` elimination (`0` production strategy matches), and orphan sidecar PID cleanup (`0` remaining processes).

### Overall Assessment
**APPROVED (`9.6/10`)**. All prior R1 defects and all 5 verification surfaces pass independent mathematical, security, concurrency, and runtime checks with **0 blocking or high-priority defects remaining**:

1. **Lockup-Adjusted Fractional Kelly & Risk Engine**:
   - `src/desk/portfolio/poly-lockup-kelly-solver.ts:132-143` optimizes `gamma * sum_s pi_s log(1 + (w/gamma)^T R(s)) - c^T w` in true fractional Kelly coordinates (`w = gamma * f`, `gamma in [0.15, 0.25]`), damping interior solutions by `gammaKelly` while preserving exact `<= 3.0% NAV` (`maxClusterLoss`) scenario/cluster halfspaces, `4.5%/yr` carry + UMA `RR_i` drag, and `tau = 1e-3` KKT stationarity probe.
   - `src/desk/portfolio/poly-lockup-kelly-allocator.ts:40-67,135-193` enforces hard freeze on `> 10% NAV` UMA-disputed capital (`UMA_DISPUTE_LOCKUP_CAP`) or `>= 5.0%` portfolio drawdown (`PORTFOLIO_DRAWDOWN_CAP`), and `shouldRotateEarly` triggers iff `>= 80%` profit captured with `> 15` lockup days remaining.
   - `src/desk/risk/poly-fail-closed-risk-checks.ts:109-157` fails closed on `unknown`/`NaN`/mismatched `tokenId` or unknown `clusterId` (`maxClusterWorstCaseLossUsd: 'unknown'`), enforces `<= 3.0% NAV` cluster tail-loss ceiling, and safely permits `REDUCE_ONLY` `sell` disposals within held long exposure (`intentNotional <= currentTokenExposureUsd`) only when cluster tail-loss stays within cap.

2. **Strategy 3 + 7 & CLOB V2 Pilot-Ready Surface**:
   - `src/desk/strategies/polymarket/quant-alpha/toxicity-aware-market-maker.ts:71-75,119-128` evaluates `LiquidityRegimeMachine` (`HALTED > REDUCE_ONLY > EVENT > TRENDING > QUIET`, hysteresis step-down `EVENT -> TRENDING -> QUIET`) *before* `killed`, `hasPosition`, `isOnCooldown`, and `minVolume` gates so resting quotes are always cancelled on `EVENT`/`REDUCE_ONLY`/`HALTED`. `exitPosition` deducts sold shares via `recordSoldPosition`, and `deductTokenShares` (`toxicity-aware-market-maker-regime-wiring.ts:176-192`) iterates multi-fill `OpenPosition[]` entries accurately.
   - `src/desk/polymarket/clob-v2-heartbeat-service.ts` (`196` LOC `<= 200`) enforces `AbortSignal.timeout(reqTimeoutMs)` and monotonic `tickSequence` supersession guards (`lines 109, 122, 129, 137`), notes HTTP 425 restarts, and fires `killSwitch.fire('heartbeat-deadman-missed')` at `maxMissedHeartbeats`.
   - `src/desk/polymarket/poly1271-session-signer.ts:94-105,158-170` defaults `runtimeEnv` to `process.env`, blocks `POLY_OWNER_MASTER_PRIVATE_KEY` / `POLY_DEPOSIT_OWNER_PRIVATE_KEY` or matching session keys with `MASTER_KEY_FORBIDDEN_IN_RUNTIME`, rejects retired V1 CTF Exchange, and verifies EIP-712 `verifyTypedData` recovery against `sessionSignerAddress`.
   - `src/desk/polymarket/ctf-eth-call-preflight.ts:148-150` rejects any non-`0x` return payload on void CTF/NegRisk `eth_call` simulations (`eth-call-reverted`), and `negrisk-bundle-arbitrage-settlement.ts:67-88` distinguishes explicit `bytes32` `event.negRiskMarketId` (`convertPositions`) from exhaustive YES-bundle merges (`mergePositions`).
   - `scripts/poly-approve-pusd.ts:87-89` refuses `--broadcast` unless explicit `--exchange` or `POLY_EXCHANGE_V3_ADDRESS` is provided.

3. **Strategy 4 + 6 (Market-Blind FV & Arbiter News)**:
   - `src/desk/polymarket/market-blind/market-blind-sanitizer.ts:94-112` fails closed in `assertProspectiveCutoff` when `modelKnowledgeCutoffMs` is set without a finite `eventResolutionOrCutoffMs` or when `eventResolutionOrCutoffMs <= modelKnowledgeCutoffMs`.
   - `src/desk/polymarket/market-blind/market-blind-shrunk-posterior.ts:27-59,67-74` locks `wSkill = 0` (`loggingOnly = true`) on any failure across resolved count (`< 150`), `BSS_OOS` (`< 0.02`), `bssLower95 <= 0`, `ECE >= 0.035`, or rolling-100 Brier `>=` market, and `computePostOnlyPrice` snaps strictly below `askPrice` by at least one tick.
   - `src/desk/strategies/polymarket/quant-alpha/primary-source-news-latency-types.ts:65-70` requires `wSkill: number`, and `primary-source-news-latency-detector.ts:88-95` enforces normalized `sourceHost` + `bulletin.url` host whitelists (blocking userinfo/protocol-relative bypasses) and `forbiddenTerms` vetoes *before* invoking primary streams or the optional 3rd arbiter.

4. **Rust Sidecar Bridges, `#268`, & Governance / Stress KPIs**:
   - `scripts/poly-sidecars.ts:258-266` passes `PB__WAL__BASE_PATH: walDir` to `poly-book ingest` in `cmdCaptureSample` and deterministically reaps child PIDs via `SIGTERM -> SIGKILL` (`0` orphan processes verified via `ps`).
   - `src/desk/cli/kpi-poly-observed-replay.ts:60-73` enforces fail-closed `evaluatePolyRisk` preflight before running observed replay; `kpi-poly-stress-shocks.ts` cleanly applies `1.5x` cost/cancel-latency, `-50%` liquidity reward haircut, and `4.5%/yr` locked-capital carry.
   - `#268` verified: `resolveOutcomeTokenId` returns `null` when `noTokenId` is absent/blank, with `0` `noTokenId ??` fallbacks anywhere in `src/desk/strategies/polymarket/`.

### Critical Issues
None (0).

### High Priority
None (0).

### Medium Priority
None (0).

### Low Priority
1. **Non-blocking edge case — `ToxicityAwareMarketMakerStrategy` partial exit accounting** (`/Users/macbook/algo-trader/src/desk/strategies/polymarket/quant-alpha/toxicity-aware-market-maker.ts:71-75`): `exitPosition` deducts `pos.tokenQuantity` on `recordSoldPosition`, whereas `performExit` can theoretically record a partial IOC fill (`order.filledSize < pos.tokenQuantity`). Safe in current paper/shadow adapters (`BacktestOrderManager` fills full IOC size or rejects) and fails conservative for merge eligibility (`matchedShares` underestimated, never overestimated). Consider passing confirmed `filledTokens` if partial IOC fills are enabled in live execution later.

### Edge Cases Found by Scout
- **Multi-fill `OpenPosition[]` merge deduction**: Verified `deductTokenShares` (`toxicity-aware-market-maker-regime-wiring.ts:176-192`) walks backwards across multiple fills for the same `(conditionId, tokenId)` and scales `sizeUsdc` + `entryFeesUsdc` proportionally on partial remainder.
- **Heartbeat slow-response supersession**: Verified `ClobV2HeartbeatService.beatOnce` checks `seq < this.tickSequence` both after `fetch` headers and after `res.text()` so a delayed response cannot reset `consecutiveMisses` after a newer tick failed.
- **Void `eth_call` custom Solidity error selector (`0xdeadbeef`)**: Verified `CtfEthCallPreflight.dispatch` rejects any `ret.toLowerCase() !== '0x'` before `iface.decodeFunctionResult` can silently ignore revert bytes on `returns ()`.
- **URL userinfo / protocol-relative spoofing on news bulletins**: Verified `federalreserve.gov@attacker.tld` and `//attacker.tld/release` are rejected before any classifier runs.

### Behavioral Checklist Verification
- [x] Concurrency: `tickSequence` + `AbortSignal.timeout` in heartbeat service; bounded `SIGTERM -> SIGKILL` teardown in `poly-sidecars.ts`
- [x] Error boundaries: Fail-closed `evaluatePolyRisk`, `solveLockupAdjustedKelly`, `CtfEthCallPreflight`, and `MarketBlindError` guards
- [x] API contracts: `GammaEvent.negRiskMarketId`, `MarketBlindEventPosterior.wSkill: number`, `RecordedL2Source` union aligned across callers
- [x] Backwards compatibility: Existing 37 strategy test files (`1,978` tests) + 34 poly/portfolio/risk/governance/cli test files (`309` tests) pass unchanged
- [x] Input validation: Zod webhook schema + 256 KB body cap + loopback Host/Origin CSRF/DNS-rebinding guard in `ghost-guard-http-helpers.ts`
- [x] Auth/authz paths: Timing-safe Bearer check on non-loopback GhostGuard webhook; `MASTER_KEY_FORBIDDEN_IN_RUNTIME` isolation in `Poly1271SessionSigner`
- [x] N+1 / query efficiency: Bounded iteration/time budgets (`50ms` Kelly PGA + Dykstra solver)
- [x] Data leaks: `0` secret scan matches; market-blind sanitizer strips 31 forbidden anchor keys + multi-pass regex redaction
- [x] Fact-checked against `plans/261114-2344-poly-vnext-hybrid-ic/plan.md`: All phase files, LOC caps (`<= 200` in `src/`), and checklist items verified

### Recommended Actions
1. Ready to open PR and squash-merge `feat/poly-vnext-hybrid-ic` (`5faa16ef`) into `main`, then close `#268` and `#269`.

### Metrics
- **Type Check (`npm run typecheck` + `tsconfig.worker.json`)**: PASS (0 errors)
- **Quality Baseline (`check-quality-baseline.mjs --quality`)**: 5/5 PASS (`0` `anyTypes`, `0` `filesOverMaxLines`, `0` `bannedImports`, `0` `eslintDisables`)
- **Secret Scan (`ci-gate-secret-scan.mjs`)**: PASS (0 matches)
- **Governance Audit (`npm run poly:governance`)**: PASS (`scanned=241, findings=0`, EOD `HEALTHY`, Watchlist `10/10`)
- **Tests**: `34/34` files (`309/309` tests) PASS in target suite + `37/37` files (`1,978/1,978` tests) PASS in `tests/strategies/` + live `poly-sidecars` (`doctor`, `drill-ghost`, `capture-sample`) PASS with `0` orphan PIDs

### Score
**9.6/10**

### Unresolved Questions
None.
