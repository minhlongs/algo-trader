# Code Review — S11 vibe-audit-gap-closure (feat/vibe-audit-gap-closure vs main @ 55714c28)

- Date: 2026-08-26 · Reviewer: code-reviewer · Base 55714c28 → HEAD 141f9c28 (3 commits)
- Files: 23 · +1515/−30 (code: 616 insertions across 9 TS files; docs: 10 md + log/json)
- Verdict: **REVIEW: 9.0/10 — PASS — 0 critical / 2 major / 4 minor**
- Gates run live: targeted vitest 70/70 GREEN · `tsc --noEmit` 0 err · strict eslint changed-files 0 warn · ratchet 4/4 · `cashclaw doctor` live exit 0, 5 labelled checks

## Scope
Code: system-doctor.ts + system-doctor-defaults.ts (new), research-mcp-server.ts, cost-stress.ts, cashclaw-cli.ts, alpha-commands.ts + 3 test files. Docs: 9 architecture docs, MIGRATION_COMPLETE.md, MIGRATION_LOG.json, vibe-trading-migration.md, 2 reports.

## Non-negotiables audit (task.md §rules)
- Zero new `:any` (diff grep clean; ratchet anyTypes 117=floor PASS). Zero new eslint-disable. Zero new console.log in code (uses shared logger).
- No deleted files/tests (diff-filter=D = 0; cost-stress.test.ts edits are 3→4-mode assertion updates, coverage increased).
- Production execution path untouched: MCP change is metadata-only; cost-stress pure config; doctor isolated new command. READ_ONLY default intact (live-verified).
- Doctor NOT wired into CI (matches plan risk ii). File LOC: doctor 164+147 ≤200 ✓ (cashclaw-cli.ts 283 pre-existing overage, +11).

## Verified working (not taken on faith)
1. Doctor error paths: DB unreachable→UNREACHABLE (ok stays true); ledger corrupt/gate-eval throw/baseline parse-fail→FAIL (ok false). Exit-code policy correct: `system-doctor.ts:141-142` ok=no-FAIL; UNREACHABLE tolerated. Live run: 5 PASS, exit 0, ~11s wall (bounded by 15s AbortSignal).
2. MCP: SDK types.d.ts confirms `annotations.readOnlyHint: ZodOptional<ZodBoolean>` on ToolSchema — typed via `Tool` import, no widening. 4 tools × readOnlyHint at :84,100,115,130.
3. EXTREME: in-file doc of composition math (30×2+15+25=100bps round-trip); `listStressModes()` canonical order; sole consumer `alpha-robustness-handler.ts:36` iterates `listStressModes()` → auto-flows, no hardcoded-3 consumer found.
4. Docs truth: python-extracted 70 distinct src/*.ts paths cited across architecture docs + MIGRATION_COMPLETE → **70/70 exist on disk**. Zero TODO markers. Each doc ≤86 lines (plan cap 150). MIGRATION_COMPLETE has "DERIV DEFERRED" verbatim; zero profitability claims (tester report records negative Sharpe/PnL honestly with configHash 5790bf44…).
5. MIGRATION_LOG: valid JSON, 10 phases. S1 entry preserves original keys/targetFiles/status; `correctedBy:"S11"` + correction appended — history visible, not rewritten. deferred-count 2==baseline 2 (AC unchanged-or-higher met).
6. Tests assert real behavior: exact preset object equality, 100bps formula, 4-mode order, LIVE/PAPER FAIL, UNREACHABLE tolerance, corrupt-vs-missing ledger (tmpdir-based real fs), fetch-stubbed offline degradation. No phantom asserts found.

## Findings

### CRITICAL
None.

### MAJOR
1. **Full suite now red locally: 7151/7152 — S11's own acceptance run broke a pre-existing env-dependent test; tester evidence unreproducible.**
   - `src/alpha-lab/provenance/__tests__/verdict-summary.test.ts:126` asserts `loadVerdictSummary()` (default path `data/research-ledger.jsonl`) returns totalRecords===0. B4 step-c `--record` wrote 1 record there → assertion fails on rerun. Tester report §1 claims "7152/7152" but that run PRECEDED step 2c in their own sequence; post-acceptance rerun was never done. Violates "no fake completion"/evidence-honesty posture: recorded count is not reproducible after the recorded procedure. Gitignored file ⇒ CI/fresh-clone unaffected — hence major, not critical.
   - Fix: stub/quarantine the default-path test (tmp cwd or vi.mock DEFAULT_LEDGER_PATH — it tests nothing real today), rerun full suite AFTER acceptance steps, append corrected count to tester report + MIGRATION_LOG evidence.
2. **SECURITY_MODEL.md cites a nonexistent symbol — phantom helper in the flagship truth-audit doc.**
   - `docs/architecture/SECURITY_MODEL.md:12` claims helpers `isLiveTradingEnabled()` (:61). Actual `src/desk/execution/execution-mode.ts`: `isLiveEnabled()` :55, `isTradingEnabled()` :60, `isReadOnly()` :65, guard throw :78-93. No `isLiveTradingEnabled` exists anywhere (repo grep: only this doc). Line refs :66/:80 also off by 1-2. For an increment whose product IS doc truth (header: "all paths verified"), this repeats the exact defect class being corrected. Fix: rename citation to `isLiveEnabled()`, correct line numbers.

### MINOR
1. `src/desk/cli/system-doctor-defaults.ts:79` hardcodes `https://api.cashclaw.cc/api/v1/paper-trades`, dropping the `PAPER_TRADES_API` env override that `check-gates.ts:20` honors — despite the header claiming "same graceful-degradation pattern as check-gates.ts". Staging deploys would doctor against prod endpoint. Fix: reuse the env fallback expression.
2. Plan AC B2 literal `grep -c "file:" docs/architecture/MODULE_MAPPING.md ≥ 15` returns **0** (paths cited inline in table cells, no `file:` prefix). Intent met (34 rows, every path disk-verified) but stated AC unmet — record as accepted-deviation or add prefix.
3. MIGRATION_LOG S11 entry schema drift vs prior entries: adds top-level `note` (S8/S9 lack it) and `evidence.prUrl: null` placeholder. Fill prUrl at merge time or drop the key until it exists.
4. Robustness display semantics: handler prints preset fee/slippage (EXTREME "30/25") while `applyStressToBaselineConfig` folds spread into fee (effective 45/25). Pre-existing for all modes (NORMAL 5/3 vs effective 7/3) — EXTREME inherits; consider printing effective values so stress rows reflect applied friction.

### NIT
1. Duplicate MCP tests: handleListTools test and RESEARCH_MCP_TOOLS test assert identical property (former is a thin wrapper over latter). Harmless redundancy.
2. `inspectLedger` partial-corruption loses valid-record count: one malformed line aborts readLedgerRecords mid-map → [] → reported corrupt,count 0 even if other lines parse. Status/detail still truthful; count loss only.
3. MIGRATION_STATUS counts P12 under "DONE/PORT" while MODULE_MAPPING row 15 shadow-account = DEFERRED. Reconcilable (deferred = broker-statement reconciliation only, per MIGRATION_COMPLETE table) but easy to misread; one clarifying clause would help.
4. `flags:{kellyWired:true,circuitBreakerTested:true}` hardcoded in loadGateSummary — mirrors check-gates.ts:103-104 exactly (pre-existing pattern, consistently mirrored).

## Scout / edge-case notes
- Doctor natural-exit on success path relies on event-loop drain with live pg Pool — verified empirically (exit 0 twice, ~11s incl. npx+tsx cold start; 15s timeout bounds worst case).
- `readLedgerRecords` swallows JSON.parse throws into [] (research-ledger.ts:101-113) — inspectLedger's raw-reread design correctly compensates; covered by tests incl. real corrupt file.
- EXTREME flip-back is genuinely one-line-per-field + 2 test edits (documented in plan §B3c note).

## Recommended actions (priority order)
1. Pre-merge: fix SECURITY_MODEL.md:12 phantom symbol + line refs (1-line).
2. Pre-merge or escrow-with-decision: fix verdict-summary default-path test; rerun FULL suite after acceptance artifacts exist; update tester report + MIGRATION_LOG tests evidence with reproducible count.
3. Follow-up commit acceptable: PAPER_TRADES_API env in system-doctor-defaults.ts:79; prUrl fill-or-drop at merge.
4. Optional: MODULE_MAPPING `file:` AC note; robustness effective-cost display; dedupe one MCP test.

## Metrics
- Type coverage: tsc 0 errors; new `any` = 0 (ratchet 117/117 floor held)
- Tests: targeted 70/70 GREEN; full 7151/7152 (1 fail = finding MAJOR-1, env-dependent, pre-existing test); ratchet 4/4
- Lint: strict `--max-warnings 0` on all 9 changed TS files = 0 issues; repo budget untouched

## Unresolved questions
1. Owner call: fix the fragile verdict-summary test inside this PR (touches pre-existing test file — allowed since it repairs, not deletes?) or escrow to next increment with suite-count annotation?
2. Should doctor honor PAPER_TRADES_API now (1-line) or defer with the URL hardcode documented?
3. prUrl in MIGRATION_LOG: fill at squash-merge (requires post-merge edit) or leave null permanently?
