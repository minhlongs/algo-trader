# CLAUDE.code.md — SDLC Phase 3: Code

> **Role:** agent instructions for the *Code* phase (implementation + tests).
> **Upstream:** `CLAUDE.design.md`. **Downstream:** `CLAUDE.deploy.md`.

---

## Purpose

Turn a frozen design into shipping code that passes all 5 CI gates on first run. Tests are non-negotiable here — no green tests, no deploy phase.

## Required inputs

- Approved phase file (file list, interfaces, metrics, rollback posture).
- `docs/code-standards.md` + `./.claude/rules/development-rules.md`.
- Existing tests under `tests/integration/`, `tests/unit/`, `src/**/__tests__/`.

## Required outputs

1. Source files matching phase file's paths. Ownership per file belongs to one agent — no overlapping edits.
2. Unit + integration tests alongside. Target: ≥80% coverage on new code, 0 regression on existing 747 suite (or current baseline).
3. Migration applied to local + D1. Idempotent. Rollback script if destructive (rare; forward-only preferred).
4. Prometheus metrics wired + hit from at least one test (counter increment assertion).

## Implementation rules

- **YAGNI / KISS / DRY.** No speculative abstractions. Three similar lines beat a premature helper.
- **No mocks that lie.** If an integration test hits the DB, use the real D1 (or dockerized Postgres). Learned incident: mocked auth tests passed, prod migration broke.
- **Error handling at boundaries only.** Trust internal callers. Validate at HTTP / user / external-API edges.
- **No comments that narrate code.** Only WHY when non-obvious (workaround, invariant, surprise). Never reference tickets or callers.
- **No `any`, no `@ts-ignore`, no `console.log` in `src/`.** `grep -r ": any\|@ts-ignore\|console\." src | wc -l` must return 0 before review.
- **Run compile after every file.** `npx tsc --noEmit` between edits, not at the end.
- **Secret hygiene.** Gate 2 regex scan covers AWS / GitHub / Slack / Anthropic / OpenAI / Stripe / Google / PEM. Never hardcode, never commit `.env*`.
- **File size.** ≤200 LOC target; split at logical seams (per concern, not per line count). Gate 3 warns >400 LOC.

## Test rules

- `pnpm vitest run` must be 100% green before PR.
- New test file name mirrors code file: `signal-foo.ts` → `signal-foo.test.ts`.
- Integration tests: `tests/integration/*.test.ts`, hit real deps.
- Paper-gate / rollback tests: every new Qwen path needs at least one kill-switch test + one drawdown test.
- Flaky tests get fixed, not retried. If a test is fundamentally flaky, exclude via `vitest.config.ts` with a one-line comment justifying.

## Commit discipline

- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- One concept per commit. Hard ceiling: 400 LOC diff per commit (soft).
- No AI co-author lines, no AI references in messages.
- `.claude/` directory changes: `feat:` / `fix:` / `refactor:` — NOT `chore:` or `docs:` (per global rule).

## Definition of done

- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npx eslint src/ --max-warnings 50` — pass.
- [ ] `pnpm vitest run` — 100% pass.
- [ ] `grep -r ": any\|@ts-ignore\|console\." src | wc -l` → 0.
- [ ] New Prometheus metric incremented in at least one test.
- [ ] Kill-switch path tested (if Qwen / signal / live-affecting code).
- [ ] Changelog entry drafted in `docs/project-changelog.md`.
- [ ] No `.env`, credentials, or private keys staged.

## Hand-off

Tester subagent runs full suite → code-reviewer scores ≥9.0/10 → Deploy phase (`CLAUDE.deploy.md`). If review flags critical/major, loop back here.

## Unresolved questions

Log in commit body or PR description.
