# Phase 05 — Tests + CI Green + Docs Sync

## Context Links

- File: `/Users/macbookprom1/algo-trader/vitest.config.ts`
- File: `/Users/macbookprom1/algo-trader/docs/system-architecture.md`
- File: `/Users/macbookprom1/algo-trader/docs/development-roadmap.md`
- File: `/Users/macbookprom1/algo-trader/docs/project-changelog.md`
- Rule: `~/.claude/rules/binh-phap-cicd.md` — post-push verification MANDATORY
- Depends: Phases 01–04 all complete

## Overview

**Priority:** P1
**Status:** done
**Effort:** 3h
**Description:** Full test sweep (existing 211 + new Qwen tests), CI green on PR, post-merge verification (CF Pages + production smoke), docs updated. This is the "ship gate" — no merge until this passes.

## Key Insights

- **Post-push verification is MANDATORY:** per `binh-phap-cicd.md`, cannot report done until (1) GH Actions green (2) CF Pages deployed (3) prod HTTP 200.
- **Mekong CLI Tier A/B/C patterns applied:** CI gates (A), OTel signals (B), SDLC CLAUDE docs (C) — reuse, don't reinvent.
- Parallelizable within the phase: tests ↔ docs. Tester owns test files only; docs-manager owns `docs/*.md`.

## Requirements

**Functional:**
- `pnpm test` exit 0 (211+ tests)
- `pnpm run typecheck` exit 0
- `pnpm run lint` within existing warning budget
- GH Actions all green on PR
- CF Pages deployment succeeds post-merge
- Production smoke: `curl https://algo-trader.pages.dev/api/v1/health` returns 200

**Non-functional:**
- `docs/system-architecture.md` updated with Qwen architecture diagram + M1 Max daemon role
- `docs/development-roadmap.md` Phase "Qwen M1 Max Integration" marked complete
- `docs/project-changelog.md` entry dated 2026-04-17

## Architecture (Test Coverage Map)

```
Phase 02 tests: llm-router-qwen.test.ts            (4+ cases)
Phase 03 tests: signal-ingest-route.test.ts        (6+ cases)
                hmac-verifier.test.ts              (4+ cases)
Phase 04 tests: qwen-paper-gate-monitor.test.ts    (6+ cases)
Phase 05 NEW:   qwen-e2e-smoke.test.ts             (3 cases)
                ├─ signal ingest → publisher → SSE
                ├─ HMAC reject path
                └─ 30d paper-gate blocks live
```

## Related Code Files

**Create:**
- `tests/e2e/qwen-e2e-smoke.test.ts` (~150 LOC) — end-to-end with mocked HMAC + mocked Qwen response

**Modify:**
- `docs/system-architecture.md` — add section "Qwen M1 Max Signal Daemon (2026-04-17)"
- `docs/development-roadmap.md` — add Phase entry + status
- `docs/project-changelog.md` — 2026-04-17 entry with PR link
- `.env.example` — ensure all new vars documented
- `README.md` — add "Qwen local signals" subsection under architecture

**Do NOT modify:**
- Any test file already written by Phases 02/03/04 owner (no overlap — reviewer-only reads)

## Implementation Steps

1. **E2E smoke test** (`qwen-e2e-smoke.test.ts`):
   - Spin supertest server with mocked `SignalPublisher` and mocked HMAC secret
   - Case 1: valid signal → 202, publisher called with correct shape
   - Case 2: bad HMAC → 401, publisher NOT called
   - Case 3: attempt live execute on fresh qwen signal → PaperGateError
2. **Run full suite:** `pnpm run typecheck && pnpm test && pnpm run lint`
3. **Fix any failures** — do NOT skip or mock out. Real fixes only (per `primary-workflow.md`).
4. **Docs update** (parallel with tests):
   - `system-architecture.md`: insert "Signal Ingestion" section with ASCII diagram from plan.md Architecture
   - `development-roadmap.md`: add row to current phase table
   - `project-changelog.md`: entry format `### 2026-04-17 - feat: Qwen M1 Max signal daemon (PR #XXX)`
5. **Push branch**: `git push -u origin feat/qwen-m1max-signal-daemon-260417`
6. **Open PR:**
   ```
   gh pr create --title "feat(qwen): M1 Max Qwen3-30B-A3B signal daemon + paper gate (Option B)"
   --body <HEREDOC with summary, phases, test counts, paper-gate plan>
   ```
7. **Await CI:** `gh run watch` (max 10 min; binh-phap-cicd.md polling pattern)
8. **Merge** when green: `gh pr merge --squash --delete-branch`
9. **Post-merge verification (MANDATORY):**
   - `gh run list -L 1 --json status,conclusion` — must be success
   - `wrangler pages deployment list --project-name algo-trader | head -10` — latest deployment Ready
   - `curl -sI https://algo-trader.pages.dev/api/v1/health | head -1` — HTTP 200
10. **Memory updates:**
    - Update `project_algotrade_deepseek_monitoring.md`: add Qwen row
    - Update `project_algotrade_paper_trading.md`: new paper clock started
    - Create `project_algotrader_qwen_integration_260417.md` if >150 chars justification

## Todo List

- [ ] `qwen-e2e-smoke.test.ts` written (3 cases)
- [ ] `pnpm run typecheck` green
- [ ] `pnpm test` exit 0 (all tests pass)
- [ ] `pnpm run lint` within budget
- [ ] `docs/system-architecture.md` updated
- [ ] `docs/development-roadmap.md` updated
- [ ] `docs/project-changelog.md` entry added
- [ ] `.env.example` + README updated
- [ ] Branch pushed, PR opened with HEREDOC body
- [ ] GH Actions green
- [ ] PR merged to `main`
- [ ] CF Pages latest deployment Ready
- [ ] Production smoke HTTP 200
- [ ] Memory files updated per plan.md "Next Steps"

## Success Criteria

- Full verification report format emitted (per binh-phap-cicd.md):
  ```
  ## Verification Report
  - Build: ✅ exit code 0
  - Tests: ✅ [N] tests passed
  - Git Push: ✅ [hash] → main
  - CI/CD: ✅ GitHub Actions success
  - Deploy: ✅ CF Pages Ready
  - Production: ✅ HTTP 200
  - Timestamp: [actual]
  ```
- M1 Max daemon runs 24h without crash (post-merge observation)
- At least 10 qwen-source signals persisted to D1 in first 24h

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| CI flake on SSE tests | Medium | Existing suite has retry config; if flaky, do not skip — fix root cause |
| Lint budget exceeded | Low | New code follows existing style; ESLint max-warnings 100 has headroom |
| CF Pages deploy fails on new env var | Low | Pre-push: `wrangler secret list` confirms `QWEN_INGEST_HMAC_SECRET` set in CF |
| Production regression (SSE clients) | Medium | Feature flag `SWARM_QWEN_ENABLED=false` default in prod for 7d. Flip to true after observation. |
| Daemon crashloop floods ingest endpoint | Low | launchd ThrottleInterval=60s; rate limit server-side 60/min |

## Security Considerations

- HMAC secret rotation documented in system-architecture.md (quarterly)
- No secrets in PR diff (ensured by existing pre-commit hook)
- Signed commits if `commit.gpgsign=true` in user config

## Next Steps (Post-Merge Roadmap)

1. **Day 1–7:** Observation mode. `SWARM_QWEN_ENABLED=false` in prod. Daemon pushes to staging D1 only.
2. **Day 8:** If no incidents, flip `SWARM_QWEN_ENABLED=true` in prod (Qwen joins 4-persona swarm).
3. **Day 8–38:** 30-day paper clock. Qwen cannot authorize live trades.
4. **Day 39:** Review metrics — if Qwen edge ≥5% and drawdown <5%, promote to live-eligible (manual admin flag flip, PR-gated).
5. **Unresolved Q2 resolved in Phase 01:** DeepSeek + Qwen concurrent on M1 Max; Nemotron cold-demoted.
6. **Unresolved Q3 resolved in Phase 04:** `$500` auto-approve retained as `QWEN_AUTO_APPROVE_MAX_USD=500` env var.

## Final Summary Template (for main agent to fill post-merge)

```
## Qwen M1 Max Integration Summary
- Branch: feat/qwen-m1max-signal-daemon-260417
- PR: #<NUM>
- Commits: <SHA1>..<SHA5>
- Files changed: ~14 files (7 new, 7 modified)
- Tests added: ~20 new (total 231+)
- Memory files to update:
  - project_algotrade_deepseek_monitoring.md (add Qwen)
  - project_algotrade_paper_trading.md (new clock)
  - project_algotrader_qwen_integration_260417.md (new entry)
- Paper clock: starts at first Qwen signal post-merge; 30d hard gate
- Live eligibility review date: 2026-05-17 (merge date + 30d)
```
