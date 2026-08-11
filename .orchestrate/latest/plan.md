# Plan — algo-trader: bootstrap → build → ship

**Author:** kongming (advisory) · **Date:** 2026-08-12 · **Work context:** `/Users/macbook/algo-trader`
**Original command:** `/ak:bootstrap to /ak:ship --auto --parallel`

---

## TL;DR

**The command as typed cannot execute.** Three verified blockers: (1) the `ak` harness CLI crashes on every invocation from a one-line bug; (2) the *other* `ak` binary works but has zero commands installed — no `ship`, no `cook`, no `bootstrap`; (3) algo-trader is a mature 5-month-old repo, so `/bootstrap` (a **new-project scaffolder**) is the wrong tool and would be destructive if taken literally.

Also: **the payload you probably meant to ship is already shipped.** The security-hardening work (all 3 blockers from the 2026-08-11 code review) was committed in `688f1f187` at Aug 11 22:17 and `HEAD == origin/main`.

So the real job is: **repair the toolchain, then run the plan→build→test→review→ship loop via Claude Code native agents against the actual pending payload** — the 120 dirty working-tree files, dominated by an uncommitted arbitrage-execution-engine workstream. Phase 0 and Phase 1 are non-negotiable prerequisites; everything after is the normal loop.

---

## Reframed problem

The prompt asks to "bootstrap and build the project end-to-end." Taken literally that implies greenfield setup. It is not. What is actually being decided:

1. **Does the agent toolchain work at all?** No. Fix it, or run the pipeline natively without it. (Decided: fix it — it's a one-line change — *and* run natively, since even a fixed harness has no commands.)
2. **What is the actual ship payload?** Not security-hardening (already on main). It is the 120 dirty files — mostly `src/desk/arbitrage/*`, `src/desk/risk/*`, and API-surface edits — plus repo hygiene.
3. **Can the documented ship gates even run?** Uncertain. CI workflows are `active` but no run has fired on `main` since **2026-04-20**, despite many commits since. `CLAUDE.deploy.md` mandates polling `gh run list` until green; that will hang forever if pushes are not triggering workflows. This must be diagnosed *before* the ship phase, not during it.

**Non-goals:** scaffolding new project structure; re-shipping security-hardening; migrating deploy targets; fixing the 4-month CI gap beyond what's needed to ship this payload.

---

## Ground truth (verified 2026-08-12)

| # | Claim | Evidence |
|---|---|---|
| 1 | Harness `ak`/`mk` crash on **every** command | `ak --help` → `❌ Fatal: this.getCKConfigSafe is not a function` |
| 2 | Root cause is a single call to a method that does not exist | `/Users/macbook/mekong-cli/harness/src/core/config-manager.ts:223` calls `this.getCKConfigSafe()`; grep across the whole repo finds **only this one line** — no definition anywhere. A working private getter `ckConfig` exists at line 237. |
| 3 | Two different `ak` binaries exist | shell alias → `npx tsx $MEKONG_ROOT/harness/bin/ak.ts` (broken). `$HOME/bin/ak` → Go binary "AgentKit" v2.4.0, 20MB, works. |
| 4 | `/ak:ship` routes to the binary that has no `ship` | `~/.claude/commands/ak-ship.md` runs `$HOME/bin/ak ship` → `Error: unknown command "ship" for "ak"` |
| 5 | Only the empty `core` kit is installed | `ak kit list-kits` → `core 0.1.0 free … 0 agents, 0 skills, 0 commands, 0 hooks` |
| 6 | Kit cache is corrupt (why no commands) | `ak doctor` → `Kit cache: 1 cache issue(s): engineer/claude-code: invalid version directory` |
| 7 | `bootstrap` does not exist in the harness at all | grep `bootstrap` across `harness/src/`, `harness/bin/` → **no matches** |
| 8 | `/bootstrap` is a new-project scaffolder | `~/.claude/commands/bootstrap.md`: "Bootstrap a **new** project", asks tech-stack questions, checks `git init` |
| 9 | algo-trader is **not** a monorepo — no `apps/`, no `packages/` | top-level: `src/ dashboard/ landing/ mobile/ intelligence/ rl/ ops/ scripts/ docs/ plans/ migrations/ config/` |
| 10 | All 3 code-review blockers are **fixed and pushed** | `688f1f187` (Aug 11 22:17) adds `041-audit-hash-chain.ts`, `042_add_encrypted_credential_columns.sql`, `security-integration.test.ts` (+624), `credentials-routes.ts` (+106) |
| 11 | Credential GET + DELETE now exist | `src/platform/api/routes/credentials-routes.ts:87` `.get('/')`, `:114` `.delete('/')`, `:56` `.post('/')` |
| 12 | Nothing to push — main is synced | `git rev-parse HEAD` == `git rev-parse origin/main` == `688f1f187` |
| 13 | 120 dirty files, incl. runtime state not gitignored | `.mekong/goals.sqlite3`, `.mekong/memory.yaml`, `.mekong/vector_index.json`, `.orchestrate/` all untracked |
| 14 | **CI has not run on `main` since 2026-04-20** | `gh run list --branch main` → newest is `2026-04-20T04:20:59Z`. Workflows are `active`, Actions `enabled:true`. |
| 15 | `CLAUDE.md` deploy section is stale | it documents multi-region VPS `deploy-region.sh`; `CLAUDE.deploy.md` (Cloudflare-only, Vercel banned) is authoritative |

---

## What the requested commands actually resolve to

| Requested | Reality | Substitute used in this plan |
|---|---|---|
| `ak:bootstrap` | does not exist in either binary | `ak init` (Go binary — creates `.agentkit/ownership.json`) + repo hygiene. **Not** `/bootstrap`. |
| `ak:auto` | does not exist | Claude Code native agent loop (`planner` → `fullstack-developer` → `tester` → `code-reviewer`) |
| `--parallel` | no harness support | parallel `fullstack-developer` agents with **disjoint file-ownership lanes** per `.claude/rules/team-coordination-rules.md` |
| `ak:ship` | `unknown command` | manual ship per `CLAUDE.deploy.md` (PR → squash merge → gates → CF Pages → smoke → 11-line report) |

---

## Phase 0 — Repo triage & hygiene gate  ·  agent: `git-manager` + `debugger`

**Blocking. Nothing else starts until this is green.** 120 dirty files is not a working tree you can safely ship from.

**Steps**

1. Classify all 120 dirty entries into four buckets. Produce `plans/reports/triage-260812-dirty-tree.md`:
   - **KEEP-COMMIT** — real source work (`src/desk/arbitrage/*`, `src/desk/risk/*`, `src/api/routes/audit-routes.ts`, `src/api/server.ts`, `src/db/tenant-credentials-repository.ts`, `src/platform/api/routes/*`)
   - **DOCS** — `docs/*`, `plans/*` (30+ modified plan files, likely hook-injected noise)
   - **IGNORE** — runtime state: `.mekong/`, `.orchestrate/`, `htmlcov/`, `test-results/`, `.coverage`
   - **DELETE** — dev debris at repo root: `.tmp-fix-trading-pipeline.py`, `.tmp-fix2.py`, `.fix-method.py`, `.fix-pipeline.py`, `.build-latex-report.py`, `patch-vps-origin.py`, `conflict-test.txt`, `detached-test.txt`, `README.md.bak`, `ci-trigger.log`, `landing/src/_redirects.bak`
2. **Modify `/Users/macbook/algo-trader/.gitignore`** — append:
   ```
   # Agent runtime state (never commit)
   .mekong/
   .orchestrate/
   .coverage
   htmlcov/
   test-results/
   ```
3. `git rm -r --cached` anything already tracked that now matches the ignore rules.
4. Delete the DELETE bucket.
5. Create the working branch: `git checkout -b feat/arbitrage-execution-engine`.

**Acceptance:** `git status --porcelain | wc -l` drops from 120 to only KEEP-COMMIT + DOCS entries; `git status` shows zero `.mekong/` or `.orchestrate/` noise; triage report exists.

**Risk:** the 30+ modified `plans/*.md` files may be pure hook-injected churn. Check `git diff --stat plans/` — if diffs are only naming-header lines, `git checkout -- plans/` to discard rather than commit noise.

---

## Phase 1 — Toolchain repair (the real "bootstrap")  ·  agent: `fullstack-developer`

**This is the highest-leverage step in the whole plan and takes ~5 minutes.**

**Step 1.1 — Fix the harness crash (one line, outside this repo)**

**Modify `/Users/macbook/mekong-cli/harness/src/core/config-manager.ts:223`:**

```ts
// before
 this.getCKConfigSafe()?.modelOverrides?.[this.persona] ||
// after
 this.ckConfig?.modelOverrides?.[this.persona] ||
```

The private getter `ckConfig` (line 237) already lazy-loads via `loadCKConfig()` (line 103) and is null-safe. This is the intended call; `getCKConfigSafe` was never written.

**Acceptance:** `ak --help` prints the Agent Kit help banner and exits 0. `mk --version` does not crash. Both currently fail identically, so verify **both**.

> Note: `/Users/macbook/mekong-cli` is a **separate repo** (public, MIT). Commit the fix there independently — do **not** bundle it into the algo-trader PR.

**Step 1.2 — Register algo-trader with AgentKit (the literal `bootstrap`)**

```bash
cd /Users/macbook/algo-trader && $HOME/bin/ak init
```
**Acceptance:** `.agentkit/ownership.json` exists. Add `.agentkit/` to `.gitignore` unless the team wants ownership tracked in VCS.

**Step 1.3 — Repair the kit cache (unblocks `ak` commands generally)**

```bash
$HOME/bin/ak doctor
$HOME/bin/ak kit list-kits    # currently: core only, 0 commands
```
Address `engineer/claude-code: invalid version directory`. **Time-box to 20 minutes.** If the engineer kit does not install cleanly, **stop and proceed natively** — the pipeline does not depend on it. Do not let toolchain yak-shaving block the payload.

**Acceptance:** either `ak kit list-kits` shows a kit with >0 commands, or a one-line note in the report: "engineer kit unavailable — proceeding with native agents."

---

## Phase 2 — Plan consolidation  ·  agent: `planner`

Three overlapping uncommitted plan directories exist for the same workstream:
- `plans/260808-arbitrage-execution-engine/` (untracked)
- `plans/260808-1500-automated-arbitrage-execution-engine/` (untracked)
- `plans/260810-0000-phase-34-content-personalization/` (untracked)

**Steps**

1. Read all three; determine which matches the dirty `src/desk/arbitrage/*` code.
2. Consolidate into **one** canonical plan dir; delete or archive the duplicate. Follow `.claude/rules/documentation-management.md` structure (`plan.md` ≤80 lines + `phase-XX-*.md`).
3. Write `plans/reports/scope-260812-ship-payload.md` defining exactly which files ship in this PR.

**Acceptance:** exactly one plan dir owns the arbitrage workstream; every KEEP-COMMIT file from Phase 0 maps to a phase in it. Any file that maps to nothing gets an explicit keep-or-revert decision.

---

## Phase 3 — Parallel build  ·  agents: 3× `fullstack-developer` (concurrent)

Spawn in a **single message** for true concurrency. **Strict disjoint file ownership** — per `.claude/rules/team-coordination-rules.md`, an ownership violation is a STOP-and-report condition.

| Lane | Owner | Files (exclusive) |
|---|---|---|
| **A — arbitrage engine** | fullstack-developer #1 | `src/desk/arbitrage/*` (`config.ts`, `trading-loop.ts`, `types.ts`), `src/desk/execution/order-executor.ts`, `src/desk/commands/arb-auto.ts`, `src/desk/cli/cashclaw-trade-commands.ts` |
| **B — risk controls** | fullstack-developer #2 | `src/desk/risk/circuit-breaker.ts`, `src/desk/risk/drawdown-monitor.ts` |
| **C — API surface** | fullstack-developer #3 | `src/api/routes/audit-routes.ts`, `src/api/routes/license-routes.ts`, `src/api/server.ts`, `src/db/tenant-credentials-repository.ts`, `src/platform/api/routes/admin.ts`, `src/platform/api/routes/blog-engagement-routes.ts`, `src/platform/audit/audit-hooks.ts` |

**Shared files — lead handles directly, never a lane:** `src/index.ts`, `.claude/settings.json`, `package.json`.
**`dashboard/src/App.tsx`** — defer to a separate PR unless Phase 2 proves it belongs to this payload.

**Per-lane rules**
- Finish each file to compiling state; run `npm run typecheck` (`tsc --noEmit`) before declaring done.
- Files >200 lines → modularize per `CLAUDE.md`; kebab-case, descriptive names.
- No `:any`. No `console.*` — use the logger utility.
- **Do not write tests** — `tester` owns `*.test.ts` exclusively.
- **Drawdown monitor is a live rollback layer (L3, −5% auto-disable).** Lane B must not weaken it; any behavior change requires an explicit note in the PR body.

**Acceptance:** `npm run typecheck` → 0 errors; `npm run lint` within `--max-warnings 100`; each lane posts a completion note listing files touched.

---

## Phase 4 — Test & review gates  ·  agents: `tester`, then `code-reviewer`

**Sequential, not parallel** — review must read the code that tests validated.

1. **`tester`**: `npm test` (vitest). Baseline from 2026-08-11 was ~4191 tests. Also run `npx vitest run src/platform/api/__tests__/security-integration.test.ts` to confirm the already-shipped security work did not regress.
   - Known trap: ~113 pre-existing phase-35 failures were previously bucketed as a separate tracking item. **Do not fix them here and do not let them mask new failures** — diff the failure set against the recorded baseline.
   - **Acceptance:** zero *new* failures vs baseline. No skipped tests added. No mocks/fixtures introduced to force a pass (`.claude/rules/primary-workflow.md` bans this).
2. **`code-reviewer`**: full review of the diff.
   - **Acceptance:** ≥9.0/10, **0 critical** — this is a hard input requirement in `CLAUDE.deploy.md`.
   - Loop back to Phase 3 on any critical. Max 3 rounds; each round re-verifies only the prior round's conditions.
3. **`docs-manager`**: update `docs/project-changelog.md`, `docs/development-roadmap.md`, and `docs/system-architecture.md` if architecture shifted.

---

## Phase 5 — Ship  ·  agent: `git-manager` + lead

**Read `CLAUDE.deploy.md` — it is authoritative. The deploy section of `CLAUDE.md` is stale (multi-region VPS) and must be ignored.**

### 5.0 — Pre-flight: diagnose the CI gap (NEW — do this first)

CI has not run on `main` since 2026-04-20 although workflows are `active` and Actions `enabled`. `CLAUDE.deploy.md` says to poll `gh run list` until green — **that will hang forever if pushes don't trigger runs.**

```bash
git push origin feat/arbitrage-execution-engine
sleep 30
gh run list --branch feat/arbitrage-execution-engine -L 5
```

- **Runs appear** → proceed normally through 5.1–5.5.
- **No runs appear** → do **not** wait. Most likely cause: pushes authenticated with `GITHUB_TOKEN` (`gh auth status` shows account `longtho638-jpg` / token type `GITHUB_TOKEN`), and GitHub deliberately does not trigger workflows for pushes made with that token, to prevent recursion. Fix by pushing with a user PAT or SSH credential, or trigger manually via `gh workflow run ci.yml --ref <branch>`. Record whichever path was taken in the verification report.

### 5.1 — Commit

Conventional commits, no AI references (`.claude/rules/development-rules.md`). Split by lane:
```
feat(arbitrage): automated execution engine — trading loop, order executor, CLI
feat(risk): circuit breaker + drawdown monitor updates
fix(api): audit/license route hardening
chore: gitignore agent runtime state, remove dev debris
docs: changelog + roadmap for arbitrage engine
```
**Verify no secrets:** `.env`, `.env.local` are gitignored — confirm they are not staged. Gate 2 scans for hardcoded secrets.

### 5.2 — PR

`gh pr create --base main`. Body must state: migrations touched (none expected — 041/042 already shipped), rollback tier affected (**L3 if drawdown-monitor changed**), and any manual follow-ups.

### 5.3 — Gates

Required contexts: **Gate 1 Validation, Gate 2 Security, Gate 3 Quality, Gate 4 Dependency**. Gate 5 (deploy smoke) is post-merge only. Gates 6 (paper-gate lock) and 7 (shell lint) soft-required. 5-minute ceiling per gate. `enforce_admins: true`.

### 5.4 — Merge & deploy

```bash
gh pr merge <N> --squash --delete-branch     # never --no-verify, never --admin unless contexts drift
gh run list -L 5                              # poll until completed/success
wrangler pages deployment list --project-name algo-trader | head -10
```

### 5.5 — Smoke + mandatory report

```bash
curl -sI https://algo-trader.pages.dev | head -1   # HTTP/2 200
curl -sI https://cashclaw.cc | head -1            # HTTP/2 200
```

Post the **11-line Binh-phap-cicd verification report** verbatim from `CLAUDE.deploy.md`. **Missing any line = task incomplete. Push-and-done = task failed.**

Then: update `docs/project-changelog.md`, `docs/development-roadmap.md`, and the ship memory.

---

## Risks & gates

| Risk | Likelihood | Check | Mitigation |
|---|---|---|---|
| CI silently never fires; pipeline waits forever | **High** — no run since 2026-04-20 | Step 5.0 | Push with user PAT/SSH, or `gh workflow run`. Never block on a silent queue. |
| 120 dirty files hide unrelated/half-finished work | **High** | Phase 0 triage | Bucket + branch before touching code |
| Secrets committed (`.env`, `.env.local` present at root) | Medium | `git status --porcelain \| grep env` | Already gitignored — verify staged set before commit |
| Pre-existing ~113 phase-35 failures mask new breakage | Medium | Phase 4 baseline diff | Compare failure sets, don't compare counts |
| Lane collision on `src/index.ts` / shared files | Medium | ownership table | Lead owns shared files; lanes STOP-and-report |
| Weakening L3 drawdown rollback layer | Low/High-impact | Lane B review | Explicit PR-body note; code-reviewer must sign off |
| Toolchain repair becomes a rabbit hole | Medium | 20-min time-box in 1.3 | Proceed natively; harness is not on the critical path |
| Following stale `CLAUDE.md` VPS deploy commands | Medium | — | `CLAUDE.deploy.md` is authoritative; Vercel banned, Cloudflare only |

**Hard stops (escalate, do not improvise):** any `code-reviewer` critical; any *new* test failure; any secret in the staged set; prod deploy without the `CLAUDE.md` production checklist (integration tests, PSF gate `/mekong gates`, on-call notified).

---

## Agent assignment summary

| Phase | Agent(s) | Mode |
|---|---|---|
| 0 — triage & hygiene | `git-manager`, `debugger` | sequential |
| 1 — toolchain repair | `fullstack-developer` | sequential |
| 2 — plan consolidation | `planner` | sequential |
| 3 — build | 3× `fullstack-developer` | **parallel, disjoint lanes** |
| 4 — test → review → docs | `tester` → `code-reviewer` → `docs-manager` | strictly sequential |
| 5 — ship | `git-manager` + lead | sequential |

---

## Success metrics

- `ak --help` and `mk --version` exit 0 (currently both fatal).
- `git status --porcelain` reduced from 120 to a reviewed, intentional set.
- `npm run typecheck` → 0 errors; zero *new* test failures vs baseline.
- `code-reviewer` ≥9.0/10, 0 critical.
- 11-line verification report posted with all lines green.
- `algo-trader.pages.dev` **and** `cashclaw.cc` both HTTP 200 post-deploy.

---

## Assumptions

| # | Assumption | Confidence | What would change it |
|---|---|---|---|
| 1 | "Bootstrap" means *restore the toolchain + register the project*, not scaffold a new one | **High** — repo has 5 months of history, 30+ plan dirs | User explicitly wanting a greenfield sub-project |
| 2 | The intended ship payload is the dirty arbitrage workstream | **Medium** — it dominates the dirty set; security-hardening is already on main | Phase 2 revealing the arbitrage work is abandoned/experimental |
| 3 | Fixing `getCKConfigSafe` → `ckConfig` is correct and sufficient | **High** — getter exists, is null-safe, is the only sane referent | A second crash surfacing after the fix |
| 4 | The 30+ modified `plans/*.md` are hook churn, not real edits | **Low** — not diffed | `git diff --stat plans/` showing substantive edits |
| 5 | CI silence is push-token related | **Medium** — workflows active + Actions enabled + `gh` on `GITHUB_TOKEN` | Step 5.0 showing runs fire normally |
| 6 | No new migrations needed (041/042 already shipped) | **High** — both verified on disk and committed | Phase 3 introducing schema changes |
| 7 | `dashboard/src/App.tsx` is out of payload scope | **Medium** | Phase 2 tying it to the arbitrage feature |

---

## Explicitly out of scope

- Re-shipping security-hardening (`688f1f187`, already on `origin/main`).
- The ~113 pre-existing phase-35 test failures (separate tracking bucket).
- Backfilling the 2026-04-20 → 2026-08-12 CI gap beyond what Step 5.0 needs.
- Reconciling the stale VPS deploy section in `CLAUDE.md` (worth a follow-up PR).
- Installing the AgentKit engineer kit beyond the 20-minute time-box.

## Unresolved questions

1. Are the three overlapping arbitrage plan dirs one workstream or two? (Phase 2 resolves.)
2. Should `.agentkit/ownership.json` be tracked in VCS or ignored?
3. Is the `dashboard/src/App.tsx` change part of this payload or a separate frontend PR?
