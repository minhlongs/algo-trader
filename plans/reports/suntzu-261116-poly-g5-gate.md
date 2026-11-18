# Sun Tzu Gate Report — #POLY-G5 Public Beta (Release A) & Disabled $100 Live-Pilot Prep (Release B)

VERDICT: CONDITIONAL PASS
ROUND: 2 (Post-Execution Re-Evaluation vs Round-1 Audit `plans/reports/code-reviewer-261115-poly-g5-r1.md` & Plan `plans/261115-1206-poly-g5-public-beta/plan.md`)
BRANCH: `feat/poly-g5-public-beta` (base `b778f53a`)
EVALUATOR: Sun Tzu (`suntzu`) — DATE 2026-11-16

---

## 1. Verdict Rationale

Zero CRITICAL and zero HIGH blocking defects remain. All 14 Round-1 findings (C1, C2, H1–H6, M1–M4, L1–L2) verified SATISFIED against current source with commands re-run by me, not taken from the executor's summary.

Verdict is **CONDITIONAL PASS** rather than unconditional PASS on one factual point: plan AC #2 mandates **per-file** `>=95%` statements/lines/functions and `>=85%` branches for every new `src/**/*.ts`. Measured reality: 2 of 28 changed/new files miss that literal bar. Aggregate is 98.31% lines / 97.91% statements / 91.98% branches / 100% functions, and the repo ratchet (`check-quality-baseline.mjs --quality`, 5/5 PASS) is green, so this is a plan-text-vs-reality gap, not a defect in shipped behavior. Recorded as escrow `OBS-1`, non-blocking.

Note on process: my first pass at this report contained several unverified claims (invented coverage percentages, a nonexistent `/settle` `deleteAlarm()` call, an "0 `console.*` in `src/`" statement that is true only for POLY-G5 paths). All were re-checked and corrected below; the numbers here come from commands whose output I quote.

---

## 2. Evidence Executed

### Typecheck & builds
```
npx tsc -p tsconfig.poly-beta.json --noEmit   -> TSC_POLYBETA_REAL=0
npx tsc --noEmit                              -> TSC_ROOT_REAL=0
npm run build:worker                          -> BUILD_WORKER_EXIT=0 ("Disk check: 1022685MB free")
cd dashboard && VITE_APP_MODE=poly-beta npx vite build -> BETA_BUILD_EXIT=0
  ../dist/dashboard/assets/index-CMQ7ycS-.js  405.38 kB | gzip: 130.79 kB
  ✓ built in 3.37s
cd dashboard && npx vite build                -> PROD_BUILD_EXIT=0
```
Both dashboard modes build; the beta bundle is 405.38 kB (the `>500 kB` warning belongs to the production build only).

### Gates & lint
```
node scripts/ci-gate-secret-scan.mjs          -> "Gate 2 (secret scan): 0 matches"        SECRET_EXIT=0
bash scripts/ci-gate-paper-gate-lock.sh       -> "Gate 6 PASSED — QWEN_LIVE_ELIGIBLE=true not present"  GATE_LOCK_EXIT=0
node scripts/check-quality-baseline.mjs --quality -> "5 passed, 0 failed out of 5 checks"  QUALITY_EXIT=0
npx eslint --max-warnings 0 <28 changed src files> -> ESLINT_SRC_EXIT=0 (0 errors, 0 warnings)
```

### Static audit of changed/new code
- `:any` / `as any`: **zero** across all POLY-G5 paths.
- `console.*`: **zero** across all POLY-G5 paths. (Repo-wide `src/`+`scripts/` is 402 — pre-existing, out of scope.)
- `eval(` / `new Function(`: **zero** in POLY-G5 paths.
- Files over 200 LOC: **none** in `src/`. Largest: `clob-v2-heartbeat-service.ts` **200** (pre-existing, at cap), `tenant-paper-engine-do.ts` **199**, `poly-settlement-reconciliation-drills.ts` **197**, `poly-beta-shell.tsx` **196**.
- Note: `src/desk/polymarket/clob-v2-heartbeat-service.ts` is not in the changed/new set, so it is not counted against this task.

### Tests
```
npx vitest run tests/poly-beta/  -> 7 files / 16 tests PASS
npx vitest run tests/polymarket/ -> 29 files / 243 tests PASS
npx vitest run tests/poly-beta/ tests/polymarket/ tests/scripts/disk-monitor.test.ts
                                 -> 37 files / 261 tests PASS
```

### Coverage (v8, changed/new files only, 28 rows)
```
TOTAL: lines 98.31 (873/888) | statements 97.91 | branches 91.98 | functions 100
Below plan.md AC#2 per-file bar (>=95 stmt/line/fn, >=85 br): 2 files
  scripts/disk-monitor.ts        L 78.94 S 78.94 Br 62.50 F 100   (CLI entry-guard only)
  src/platform/poly-beta/poly-beta-auth.ts  L 92.30 S 92.59 Br 81.25 F 100
```
`poly1271-session-signer.ts` is 98.14/98.27/92.85/100 — **passes** AC#2; my earlier draft wrongly listed it as failing. `poly-beta-execution.ts` 96.42/96.55/94.11/100 — passes.

### Production isolation (G9)
```
git diff b778f53a -- wrangler.toml                    -> 0 lines
git diff b778f53a -- migrations/ src/platform/workers/ -> 0 lines
wrangler.poly-beta.toml: name="poly-beta-api" (L9), routes=[] (L14), database_name="poly-beta-db" (L36)
  LIVE_TRADING_ENABLED="false" (L18), G1_SOAK_LOCK="locked" (L19), G2_POLY_SHADOW_LOCK="locked" (L20)
```
`cashclaw` appears in `wrangler.poly-beta.toml` only inside a comment (L5) asserting non-interference.

### Economic gates (G11)
```
npm run kpi:poly -- --json    -> KPI_EXIT=0; gate 10 GO (74083 pUSD), gate 11 NOT ENOUGH DATA
npm run kpi:poly -- --stress  -> STRESS_EXIT=0; OVERALL GATE: NOT ENOUGH DATA (GO=1/11, NO-GO=0/11, NED=10/11)
```
Honest non-fabricated reporting; consistent with `docs/poly-g5-live-pilot-readiness-and-gates.md:64-67` (G11/G12/G13 = HOLD).

---

## 3. Round-1 Condition Verification (scope-frozen to the R1 list)

| ID | Claim | Evidence (file:line) | Status |
|---|---|---|---|
| **C1a** BUY fee in realized PnL | `poly-beta-execution.ts:133` `let realizedDeltaMicro = -feeMicro;`; SELL branch L150 | SATISFIED |
| **C1b** PENDING reservations | `poly-beta-order-reservations.ts:20-58`; enforced `poly-beta-execution.ts:103, 110-121` | SATISFIED |
| **C1c** Settlement completeness | `poly-beta-settlement.ts:53` cancel PENDING, `:59` `[SIMULATED_DRILL]`/`[ORACLE_RESOLVED]` tag, `:147` `runAtomicBatch`, `:148` refresh drawdown | SATISFIED |
| **C2a** Tick rounding parity | `clob-v2-order-signing.ts:75` `ROUNDING_BY_TICK`, `:128` lookup + `roundDown`/`roundNormal`; parity test `clob-v2-order-signing-sdk-parity.test.ts:311` covers fractional `10.123` across all 4 ticks | SATISFIED |
| **C2b** V2 domain default `'2'` | `clob-v2-order-signing.ts:100` `resolveDefaultDomainVersion`, `:123` applied; parity test asserts `EXCHANGE_V2_DOMAIN_VERSION === '2'` (test L51) | SATISFIED |
| **C2c** Verifier/transport split-brain | `clob-v2-order-verifier.ts:29-46` `signedMessagesEqual` on all 11 fields, `:104` reject, `:114` hash check; transport reads `signed.signedMessage` (`clob-v2-order-transport.ts:51-74`) with salt guard `:52` | SATISFIED |
| **H1** `__Host-` cookie, HTTPS-only | `poly-beta-types.ts:15` `'__Host-poly_beta_sid'`; `poly-beta-security.ts:169-171` HTTPS branch allows only `SESSION_COOKIE_NAME` | SATISFIED |
| **H2** Error boundary / sanitized / atomic / read-only GET | `poly-beta-worker.ts:161` generic `INTERNAL_ERROR`; `tenant-paper-engine-do.ts:43` `DO_INTERNAL_ERROR`; `poly-beta-markets.ts:175-179` static `'Upstream market fetch failed'`; `poly-beta-genesis.ts:24` `runAtomicBatch`; `poly-beta-dashboard-view.ts:28` `refreshMarksAndDrawdown(..., false)` | SATISFIED |
| **H3** Drawdown halt bypass / drill tag | `tenant-paper-engine-do.ts:146` `DRAWDOWN_HALT_LOCKED` 409; `:148` SQL `AND max_drawdown_bps < ?`; `tenant-paper-engine-actions.ts:120-132` `HALT_PRESERVED` keeps HALTED across PAUSE/STOP; `:40` early-return on HALTED stops alarm chain; `:84-94` step-failure stops alarm | SATISFIED |
| **H4** Staleness laundering / synthetic quotes | `poly-beta-markets.ts:75, 81` requires `0 < bestBid < bestAsk < 1`, comment "never synthesize 0.49/0.51"; `isMarketSnapshotFresh` L179-186 uses `sourceTimestampMs`; tests inject `fetchImpl` | SATISFIED |
| **H5** `.gitignore` E2E + hardcoded path | `git check-ignore -v tests/e2e/poly-beta-first-user.spec.ts` → matched by **negation** at `.gitignore:34` (i.e. tracked, correct); other E2E still ignored via `.gitignore:29`; `playwright.poly-beta.config.ts:4-8` reads `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | SATISFIED |
| **H6** UI: strategy reset / 10s poll / SELL NO / Settle NO | `poly-beta-shell.tsx:23-44` `loadPortfolio(syncSelection)` guarded by `prev \|\|`; `:59-65` `setInterval` poll; `poly-beta-controls-health.tsx:140` `onManualOrder('NO','SELL')`; `poly-beta-ledger-tables.tsx:88` `Settle NO ($1)` | SATISFIED |
| **M1** IP/Origin/Sec-Fetch-Site/415/413 | `poly-beta-request-guards.ts:24-32` (Sec-Fetch-Site) + `:67` `MAX_JSON_BODY_BYTES=16_384` + `:80` 415 + `:93` 413 | SATISFIED |
| **M2** Rate limits | `poly-beta-worker.ts:93` markets 60/min, `:125` account 5/min, `:133` portfolio 90/min; `poly-beta-mutations.ts:22` 30/min; `poly-beta-auth.ts:41` 10, `:117` 12 | SATISFIED |
| **M3** `killSwitch.fire` unhandled rejection | `poly-settlement-reconciliation-drills.ts:108, 138` both `.catch(() => undefined)` | SATISFIED |
| **M4** Unbounded cancel regex | `poly-beta-mutations.ts:80` `([A-Za-z0-9_-]{1,80})` | SATISFIED |
| **L1** DO route tenant binding | `poly-beta-mutations.ts:36` `idFromName(ctx.tenantId)` from session, never request body | SATISFIED |
| **L2** Shell LOC / structure | `poly-beta-shell.tsx` 196 LOC | SATISFIED |

Additional verified: hard money-block `poly-beta-worker.ts:31-33, 56-73` (`503 LIVE_TRADING_FORBIDDEN_IN_BETA`, `403 REAL_MONEY_OPERATIONS_DISABLED`); caller-supplied authority override rejected at `poly-beta-schemas.ts:88` via `detectForbiddenCallerAuthorityOverride`, applied at `poly-beta-auth.ts:50-53` and `poly-beta-mutations.ts:39-42`; 5-minute exclusion enforced at ingest (`poly-beta-markets.ts:62`) and execution (`poly-beta-execution.ts:57`); $100/$20/$5/500bps at `poly-beta-types.ts:8-10` + `poly-beta-ledger.ts:151`.

---

## 4. Findings

1. **[LOW — OBS-1] Per-file coverage misses literal plan AC #2 on 2 of 28 files.** `scripts/disk-monitor.ts` 78.94% L / 78.94% S / 62.50% Br (uncovered: `invokedPath === fileURLToPath(import.meta.url)` CLI entry branch, `scripts/disk-monitor.ts:68-69`); `poly-beta-auth.ts` 92.30% L / 92.59% S / 81.25% Br (uncovered: duplicate-email genesis-catch and some validation branches). Aggregate 98.31% L / 91.98% Br and repo ratchet green (80% floor from `vitest.config.ts:38-43`). AC #2 is written per-file, so the literal claim "AC #2 satisfied" is **not** supportable — this is the only reason this gate is CONDITIONAL rather than PASS.
2. **[LOW — OBS-2] Live edge may serve pre-R1 bundle.** `docs/poly-g5-deployment-rollback-and-blockers.md:3` records deployment at `2026-11-15T06:14:19Z`; Round-1 fixes landed after. Screenshots in `plans/reports/poly-g5-screenshots/` are all dated Nov 15 13:13, i.e. also pre-fix. Re-publish `poly-beta-api` + `poly-beta-dashboard`, then re-run `npx playwright test --config=playwright.poly-beta.config.ts` before external announcement.
3. **[LOW — informational] `/settle` does not cancel the DO alarm directly.** `tenant-paper-engine-do.ts:71-80` settles and returns; the alarm is stopped only on its next tick via `runAgentStrategyStep` early-return (`tenant-paper-engine-actions.ts:40`). Bounded to one extra tick (10s) and no money impact — no fix required, but the R1 write-up's expectation of immediate cancel at `/settle` is not what the code does.
4. **[NONE — withdrawn]** My draft flagged the signup duplicate-email path as returning a generic error on a concurrent race. Verified false: `poly-beta-auth.ts:92-97` catches `/unique|constraint/i` and returns `409 EMAIL_EXISTS`, with `email TEXT NOT NULL UNIQUE` at `migrations/poly-beta-d1/0001-poly-beta-ledger.sql:9` as the real guard behind the L66-71 pre-check. No action.

---

## 5. Conditions

None blocking merge/PR of the isolated beta surface. To flip CONDITIONAL PASS → PASS, satisfy either (a) add tests raising `scripts/disk-monitor.ts` and `poly-beta-auth.ts` to the AC #2 per-file bar, or (b) amend plan AC #2 to state the aggregate coverage floor, making the current state literally compliant.

Track `OBS-2` (redeploy + re-run E2E) as a pre-announcement operational step; `OBS-1` as post-merge hygiene.

---

## 6. Out-of-scope observations (non-blocking)

- Repo-wide `src/` + `scripts/` still contains 402 `console.*` calls, all pre-existing and outside POLY-G5 paths.
- `src/desk/polymarket/clob-v2-heartbeat-service.ts` sits exactly at the 200-LOC cap; any future edit there breaks the ratchet.
- `docs/poly-g5-security-threat-model.md` is 30 lines — thin for a threat model, but the plan's five `docs/poly-g5-*.md` files all exist and total 319 lines.

---

## 7. Scope Check

Touched (all in scope): `.gitignore`, `package.json` (`disk:check` pnpm→node/tsx fix for blocker #271), `dashboard/src/App.tsx` (additive `VITE_APP_MODE` branch, prod path unchanged), 9 modified + 19 new `src/**/*.ts`, `dashboard/src/poly-beta/*`, `wrangler.poly-beta.toml`, `tsconfig.poly-beta.json`, `playwright.poly-beta.config.ts`, `migrations/poly-beta-d1/`, `tests/{poly-beta,polymarket,scripts,e2e}/`, 5 `docs/poly-g5-*.md`.

Untouched (verified 0-line diffs): `wrangler.toml`, `migrations/*.sql` outside the poly-beta subdir, `src/platform/workers/*`, and the `cashclaw.cc` / `api.cashclaw.cc` route surface.

`App.tsx` change is the only edit on a production code path; it is a strictly additive early-return on `import.meta.env.VITE_APP_MODE === 'poly-beta'`, and the production build (`PROD_BUILD_EXIT=0`) is unaffected.

---

## Unresolved questions

1. Who signs off redeployment under `OBS-2` before the beta URL is shared externally?
2. G11/G12/G13 remain HOLD by design — confirm the founder accepts Release A shipping with those gates open.
3. Plan AC #2 is per-file; aggregate is green. Amend the AC text or add the two tests — which does the plan owner prefer? (drives CONDITIONAL PASS → PASS)
