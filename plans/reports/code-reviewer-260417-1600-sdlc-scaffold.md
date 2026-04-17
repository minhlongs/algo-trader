# SDLC Scaffold Review — Pillar 4 (CLAUDE.<phase>.md)

**Branch:** feat/sdlc-scaffold-claude-phase-md
**Scope:** `CLAUDE.specification.md`, `CLAUDE.design.md`, `CLAUDE.code.md`, `CLAUDE.deploy.md`, + `CLAUDE.md` SDLC section.
**Nature:** docs-only. Scored on doctrine alignment + agent usability + factual consistency.
**Date:** 2026-04-17 16:00 Asia/Saigon

---

## Verdict

**REQUEST-CHANGES** — score **8.6/10**. 0 critical, **1 major**, 5 minor, 2 nit.
Auto-approve threshold (9.0/10, 0 major) not met due to the kill-switch env-var name misquote — a hard constraint that could mislead a fresh agent into coding a dead switch.

---

## Critical
None.

## Major

### M1. Kill-switch env var misquoted — `QWEN_SIGNAL_KILL` vs `QWEN_KILL`
- `CLAUDE.specification.md` line 48: `QWEN_SIGNAL_KILL` env.
- Reality (`src/wiring/qwen-drawdown-monitor.ts` L35, `admin-qwen-routes.ts` L48, rollback harness tests): the L1 switch is **`QWEN_KILL=1`**. `QWEN_SIGNAL_KILL` exists only in `scripts/qwen-signal-daemon/README.md` for the daemon's stop-after-cycle flag — a DIFFERENT concern.
- Why this matters: spec doc hard-constrains every new signal path to honour a switch that does not wire L1. A fresh agent reading spec.md will produce code bypassing the actual kill gate.
- Fix: change line 48 to `QWEN_KILL` (matches `ai-first-enforcement-gates.md` L70, `system-architecture.md` L470, `CLAUDE.deploy.md` L43 — which is already correct). One-char fix; scope of damage is the reason it is Major not Minor.

---

## Minor

### m1. `MIN_PAPER_DAYS` described as env, actually hardcoded
- `CLAUDE.specification.md` L46 implies env config.
- `src/wiring/qwen-live-eligibility-gate.ts` L19–20: `const MIN_PAPER_DAYS = 30` + comment "hardcoded, not env-overridable".
- Impact: agent may try to override in `.env` and be surprised. Fix: "`MIN_PAPER_DAYS=30` (hardcoded, not env-overridable). Earliest live-flip: 2026-05-17."

### m2. LLM router fallback chain paraphrased incorrectly
- `CLAUDE.design.md` L47: "`llm-router.ts` fallback chain (Qwen → DeepSeek → Ollama → Claude)".
- Actual (`src/lib/llm-router.ts` L5–7): three distinct routes — `chat()` = DeepSeek R1 → Ollama → Claude; `fastChat()` = Nemotron Nano → DeepSeek → Ollama → Claude; `qwenChat()` = Qwen3-30B → DeepSeek → Ollama → Claude.
- Impact: design-phase agent may pick wrong entry point. Fix: list the three routes + when to use each, or link to router doc-comment instead of paraphrasing.

### m3. Gate 3 LOC cap phrased ambiguously
- `CLAUDE.specification.md` L50: "Gate 3 (≤400 LOC per file)" — sounds like a hard fail.
- Reality (`ai-first-enforcement-gates.md` L23, `ci.yml` L90): Gate 3 strict-lints **only changed files at --max-warnings 0**; the 400 LOC check is a **warning annotation**, not a hard fail.
- `CLAUDE.design.md` L29 and `CLAUDE.code.md` L34 already phrase this correctly. Align spec.md to "≤200 LOC target, >400 LOC soft warning".

### m4. `SWARM_QWEN_ENABLED=false` as L2 disable — polarity is correct but non-obvious
- `CLAUDE.deploy.md` L44: "`SWARM_QWEN_ENABLED=false` swarm disable".
- Code (`signal-consensus-swarm.ts` L71): Qwen routed only when `=== 'true'`. Any other value (including unset) disables → "false" works but so does unset/empty.
- Fix: note "unset or any non-'true' value disables L2" to prevent agents from thinking `false` is mandatory syntax.

### m5. `deploy.yml pending dead-code audit` — unclear actionable
- `CLAUDE.deploy.md` L36 mentions `deploy.yml` awaiting audit but gives no ticket, date, or owner.
- `.github/workflows/deploy.yml` does exist; its future is ambiguous. Either (a) link to a plan/issue, (b) drop the sentence and handle in a separate cleanup PR. Current form risks being stale forever.

---

## Nit

### n1. Vitest test count baseline will drift
- `CLAUDE.code.md` L21: "0 regression on existing 747 suite (or current baseline)".
- Accurate as of PR #114 (tester report 16:09 today) but will be stale within days. The "or current baseline" hedge is fine; consider pointing to `pnpm vitest run` output as the live source instead.

### n2. Root `CLAUDE.md` table lacks the "Test" row implied by code.md hand-off
- `CLAUDE.md` SDLC table: Specification / Design / Code / Deploy — 4 phases.
- `CLAUDE.code.md` L64 hand-off: "Tester subagent runs full suite → code-reviewer scores ≥9.0/10 → Deploy phase".
- No dedicated `CLAUDE.test.md` or `CLAUDE.review.md`. Review/test are folded into Code's DoD. This is a valid KISS choice (YAGNI), but one line in the table — e.g. a "Test + review gate" annotation under the Code row — would kill the implied-fifth-phase confusion.

---

## Answers to Reviewer Prompts

1. **Phase coverage** — yes, Specification → Design → Code → Deploy covered cleanly. No phase leaks responsibilities: design bans "code yet", code bans "deploy", deploy bans "push-and-done".

2. **I/O symmetry** — hand-offs are tight:
   - Spec output (plan.md + acceptance criteria + risk surface) ⊇ Design input ✅
   - Design output (phase-XX file with file list + interfaces + metrics + rollback) ⊇ Code input ✅
   - Code output (green PR + ≥9.0 review + changelog) ⊇ Deploy input ✅
   - **Gap:** Design's "Migration" output requires "new `.sql` under migrations/NNN_*.sql" but Deploy L39's migration apply step assumes the file exists — never states Code phase must *apply* it locally. Minor — covered obliquely in code.md DoD L22 "Migration applied to local + D1".

3. **Hard constraint accuracy** — mostly good. Paper gate date (2026-05-17), CI gate numbers (1–5), Gate 3 400-LOC cap, Cloudflare-only, Polar/PayOS all correct. **One misquote (M1 — QWEN_SIGNAL_KILL)** + 3 minor (m1, m2, m3).

4. **Root `CLAUDE.md` link section** — accurate, concise (~11 LOC as specified), all 4 files linked, upstream/downstream table correct. No regression to existing rules.

5. **Agent usability** — a fresh agent reading `CLAUDE.code.md` alone CAN ship: DoD checklist is actionable (exact commands: `npx tsc --noEmit`, `pnpm vitest run`, grep invocation). `CLAUDE.deploy.md` verification report is copy-paste-ready. Spec + Design DoD checklists are actionable but depend on plan.md existing — fine.

6. **YAGNI/KISS alignment** — docs are load-bearing. No ceremonial sections. Four files @ 70/72/69/96 lines is lean. No unused sections. `## Unresolved questions` placeholder at end is pragmatic.

7. **Rule conflicts** — no conflicts detected with:
   - `.claude/rules/development-rules.md` — file-size / naming / YAGNI aligned.
   - `.claude/rules/documentation-management.md` — plan folder structure honoured.
   - `.claude/rules/primary-workflow.md` — planner → researcher → code-reviewer sequence preserved (CLAUDE.code.md L64 matches workflow step 3).

---

## Recommended Actions

1. **[Major] M1 fix** — change `QWEN_SIGNAL_KILL` → `QWEN_KILL` in `CLAUDE.specification.md` L48. Blocker for auto-approve.
2. **[Minor] m1/m2/m3** — tighten spec.md paper-gate wording, design.md LLM router chain, spec.md Gate 3 LOC phrasing.
3. **[Minor] m4** — clarify `SWARM_QWEN_ENABLED` polarity in deploy.md.
4. **[Minor] m5** — remove or ticket the `deploy.yml pending audit` aside.
5. **[Nit] n2** — add one-line hint under Code row that Test + Review are bundled into the code phase DoD.

After M1 + any 2 of the minors → re-score to ≥9.0/10 → AUTO-APPROVE.

---

## Unresolved questions

- Should a `CLAUDE.plan.md` (pre-spec brainstorming gate) exist, or is planner-agent invocation enough? Current 4-file scaffold bypasses explicit brainstorm phase.
- Is there a canonical place to pin the current vitest baseline (e.g. `docs/codebase-summary.md`) so `CLAUDE.code.md` can reference a live number instead of hardcoded 747?
