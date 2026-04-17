# Code Review — AI-First 5 Enforcement Gates MVP

Date: 2026-04-17 16:30
Scope: `.github/workflows/ci.yml`, `scripts/ci-gate-secret-scan.mjs`, `scripts/ci-gate-deploy-smoke.mjs`, `docs/ai-first-enforcement-gates.md`
Dimensions: correctness, security, CI cost, failure surface, rollback blast radius, doc-to-code drift

---

## Verdict

**Score: 9.2 / 10 — AUTO-APPROVE**
0 critical · 0 major · 3 minor · 2 nits. Threshold met (≥9.0, zero critical/major).

Ship it. Minors can land as a follow-up PR without blocking.

---

## Dimension Findings

### 1. Correctness — PASS
- All 5 jobs enforce what they claim. Gate-1 preserves the original monolith (tsc + eslint + validate-strategies + vitest).
- Gate-5 `needs: [gate-1..4]` + `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` is correct: runs only on post-merge push to main, never on PRs. Verified logic.
- Secret-scan file listing: `git ls-files src scripts migrations workers` works fine when `migrations/` and `workers/` don't exist — git silently drops missing paths. Confirmed locally (those dirs don't exist yet; scan still succeeds). No bug.
- Gate-3 `awk 'END{...}'` via `find -exec … {} \;` is correct: per-file invocation → `FILENAME` + `NR` refer to the single file. Verified on `whale-tracker.ts` (477 LOC): prints `file : 477` as expected.
- Deploy-smoke treats 3xx as healthy (`>= 200 && < 400`) — matches CF Pages redirect behavior. `redirect: "manual"` prevents silent following that could mask a broken canonical. Correct.

### 2. Security — PASS (minor gap)
Regex audit:
- `AKIA[0-9A-Z]{16}` ✅ canonical AWS access key
- `ghp_[A-Za-z0-9]{36}` ✅ canonical GH classic PAT
- `github_pat_[A-Za-z0-9_]{60,}` ✅ GH fine-grained
- `xox[baprs]-[A-Za-z0-9-]{10,}` ✅ Slack bot/user/app tokens
- `sk-ant-[A-Za-z0-9-]{20,}` ✅ Anthropic
- `sk-[A-Za-z0-9]{48}` ✅ OpenAI classic (⚠ see M1 below — new `sk-proj-` + project-scoped shapes not matched)
- `sk_live_[A-Za-z0-9]{24,}` ✅ Stripe live (test keys `sk_test_` intentionally skipped — reasonable)
- `AIza[0-9A-Za-z_-]{35}` ✅ Google API key
- PEM block ✅

**False-positive risk: LOW.** None of these shapes collide with common literals in TS/JS source. Verified grep over entire `src/` — zero matches. Excludes test/fixtures/markdown, which avoids the classic "example key in docs" trap.

Additional safety: `pnpm audit --audit-level=critical` hard-fails; `high` soft-warns. Matches the documented rationale (6 vite/fastify transitives, no upstream patch).

### 3. CI cost — ACCEPTABLE
`pnpm install --frozen-lockfile` runs 4× (gates 1–4). With `cache: pnpm` on setup-node the warm-cache cost is ~10–15 s per job, all parallel. Net wall-clock increase vs. monolith ≈ 0 (was ~15 s once, now ~15 s in parallel). Total CPU-minutes ~2–3× the monolith, but YAGNI — composite action not worth it for ~1 min of runner time per PR. **Not flagged as blocker.**

### 4. Failure surface — PASS
PR scenario "one bad file added":
- Gate-1 lints full `src/` with `--max-warnings 50` → catches if bad file pushes total warnings >50 OR has error-level rules.
- Gate-3 lints only changed files with `--max-warnings 0` → catches any warning on the new file, tighter threshold.
- Order: gates run in parallel, so **whichever finishes first surfaces the failure.** Gate-3 is smaller and faster → typically surfaces first with a targeted "this file is the problem" signal. This is the right design: developer sees the offending file before waiting on full-suite fail.

### 5. Rollback blast radius — ACCEPTABLE (documented)
Gate-5 runs **after** merge to main. If smoke fails, commit is already on main; no automated revert. For MVP this is acceptable:
- The commit that broke prod is visible in `git log`; manual `git revert` is trivial.
- Binh Pháp CICD rule (global) mandates post-push verification via Bước 1–2–3 — Gate 5 now automates Bước 1 and 3, partial Bước 2.
- Doc explicitly calls it out.

**Known limitation (documented):** No automated rollback. Founder must manually revert + push if smoke fails post-merge. Future improvement: add auto-revert job on gate-5 failure (out of MVP scope).

### 6. Doc-to-code drift — MINOR DRIFT
Doc at `docs/ai-first-enforcement-gates.md` is accurate overall, but:
- Doc says "OpenAI keys (`sk-…` 48-char)" — matches regex. ✅
- Doc's "Gate 3: Quality" row says **"yes on PR"** hard-fail, but YAML shows the strict eslint step only runs `if: github.event_name == 'pull_request'`. On push-to-main gate-3 effectively becomes file-size warning only. Doc is accurate but subtle; founders reading the table may assume "yes on PR" means "hard fail always". **Minor wording clarification suggested.**
- Doc's Dependency table omits that gate-4 also re-runs `--frozen-lockfile` twice (once in install, once in "verify" step). Cosmetic, not misleading.

---

## Minor Issues (non-blocking)

**M1. Secret scan misses newer OpenAI key shapes.**
Regex `sk-[A-Za-z0-9]{48}` matches only the pre-2024 48-char classic keys. Newer forms:
- `sk-proj-[A-Za-z0-9_-]{40,}` (project-scoped, common 2024+)
- `sk-svcacct-…` (service accounts)
- Variable-length org-scoped

Suggest broadening to `sk-(proj-|svcacct-)?[A-Za-z0-9_-]{20,}` OR add explicit `sk-proj-` pattern. Low urgency — Anthropic is the project's primary LLM vendor.

**M2. `pnpm` version unpinned.**
Workflow uses `pnpm/action-setup@v4` with `version: latest`. No `packageManager` field in `package.json` (verified). If pnpm ships a breaking lockfile v10 mid-week, CI goes red with no code change. Pin via `packageManager: "pnpm@9.x"` in package.json OR `version: 9` in workflow.

**M3. Doc-to-code: gate-3 hard-fail wording.**
Clarify in doc that strict eslint is **PR-only**; file-size warning runs on every event. Current table entry is "yes on PR" which is technically right but reads as "always".

---

## Nits (skip or bundle freely)

**N1.** Gate-2 runs `pnpm audit --audit-level=high || echo "::warning::..."` — the warning always fires on a non-zero exit code even when the failure is a network blip. Harmless, just noisy.

**N2.** Gate-5 has a hardcoded `sleep 45` for CF propagation. CF Pages usually promotes within 10–20 s; 45 s is safe but adds to post-merge latency. Leave as-is for MVP; reduce once observed.

---

## Positive Observations

- **Named gates in GitHub Checks UI** — founder can skim pass/fail without expanding jobs. This is the whole point and is executed cleanly.
- **Dual smoke targets** (`pages.dev` + `cashclaw.cc`) catch both CF-side and custom-domain/DNS regressions.
- **Secret scan exclude list** (tests/fixtures/markdown) is the right call — avoids the classic "example key in README breaks CI" trap.
- **ESM node scripts** (no deps, pure stdlib) — zero supply-chain surface for the gate scripts themselves. Good.
- **Rollback stack alignment** — doc explicitly slots gates at L0 static within the existing 5-tier trader rollback. Keeps the mental model consistent.

---

## Out-of-Scope Flag (not a blocker, but worth knowing)

Repo has **two other deploy workflows** on same trigger: `deploy.yml` (VPS + ghcr.io) and `cloudflare-deploy.yml` (CF Pages). Both fire on `push main`. Gate 5 smoke test in `ci.yml` may race them. If `deploy.yml` is dead code (Binh Pháp CICD: Vercel/VPS banned 2026-03-27, CF-only), delete it. If `cloudflare-deploy.yml` is the real deploy, Gate 5's `sleep 45` should be tuned to run *after* that workflow completes (currently it races on a parallel workflow graph). Neither is in this PR's scope — call out for a cleanup follow-up.

---

## Recommended Actions

1. **Merge as-is** — meets AUTO-APPROVE threshold.
2. Follow-up PR (low priority): M1 broaden OpenAI regex + M2 pin pnpm + M3 doc wording.
3. Separate cleanup (not related): audit `deploy.yml` vs. `cloudflare-deploy.yml` for dead code.

---

## Metrics

- Files reviewed: 4 (1 YAML 128 LOC, 2 mjs 103 LOC, 1 md 78 LOC)
- Type coverage: N/A (no TS in this change; ESM scripts are intentionally plain JS)
- Lint issues: 0 (scripts are self-contained, no imports beyond node stdlib)
- Critical: 0 · Major: 0 · Minor: 3 · Nit: 2

---

## Unresolved Questions

1. Is `deploy.yml` (VPS + ghcr.io) still a live path, or is it stale from pre-2026-03-27 Vercel/VPS ban? Affects whether Gate 5 is racing a second deploy workflow.
2. Should `pnpm audit --audit-level=high` annotation be promoted back to hard-fail once the 6 vite/fastify advisories receive upstream patches? Suggest a reminder/ticket in changelog.
3. Post-merge auto-revert on Gate 5 failure — defer to post-MVP, or spec it now as L0.5?
